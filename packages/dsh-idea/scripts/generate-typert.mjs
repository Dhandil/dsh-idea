#!/usr/bin/env node
// Standalone Typert generation.
//
// The workspace analyzer can only see packages that physically live under
// <root>/packages (junctions are resolved away with realpath), and the Remote
// decorator/TypertRemoteService symbols must be declared inside a registered
// package for marker discovery. A repo outside the Harness tree therefore
// cannot be analyzed in place, so this script assembles an ephemeral
// generation workspace that mirrors the monorepo shape: this package's src and
// the checkout's dsh-typert-protocol src are copied under build/, aggregate
// tsconfigs reference both, and the artifacts are written back into the real
// lib/. The workspace is rebuilt from scratch on every run and never
// committed; runtime code always resolves the real shared packages through
// the setup-dev junctions, so no duplicate Typert instance ever loads.
//
// Usage: node scripts/generate-typert.mjs
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The checkout location is derived from the junctioned generator dependency,
// so no second source of truth is needed.
const checkoutPackages = resolve(
  dirname(realpathSync(pathToFileURL(join(packageDir, 'node_modules/@deepseek-ai/dsh-typert-generator')))),
  '..',
)

const protocolPackage = join(checkoutPackages, 'typert/protocol')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))

const workspace = join(packageDir, 'build/typert-workspace')
rmSync(workspace, { recursive: true, force: true })
const localPackage = join(workspace, 'packages', 'dsh-idea')
const protocolCopy = join(workspace, 'packages/typert-protocol')

for (const dir of [join(workspace, 'packages'), localPackage, protocolCopy]) mkdirSync(dir, { recursive: true })

cpSync(join(packageDir, 'src'), join(localPackage, 'src'), { recursive: true })
cpSync(join(packageDir, 'package.json'), join(localPackage, 'package.json'))
cpSync(join(protocolPackage, 'src'), join(protocolCopy, 'src'), { recursive: true })
cpSync(join(protocolPackage, 'package.json'), join(protocolCopy, 'package.json'))

const compilerOptions = {
  target: 'es2024',
  module: 'esnext',
  moduleResolution: 'bundler',
  lib: ['es2024', 'dom'],
  types: ['node'],
  skipLibCheck: true,
  esModuleInterop: true,
  isolatedModules: true,
  allowImportingTsExtensions: true,
  rewriteRelativeImportExtensions: true,
  strict: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  noFallthroughCasesInSwitch: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noEmit: true,
}
writeFileSync(join(localPackage, 'tsconfig.json'), JSON.stringify({
  compilerOptions,
  include: ['src'],
  // The browser half is not part of the host face program: its React/jsx
  // surface has no typert tags, and first-party aggregates exclude it the
  // same way.
  exclude: ['src/client'],
}, null, 2))
writeFileSync(join(protocolCopy, 'tsconfig.json'), JSON.stringify({
  compilerOptions,
  include: ['src'],
}, null, 2))
writeFileSync(join(workspace, 'tsconfig.host.json'), JSON.stringify({
  compilerOptions: {
    ...compilerOptions,
    baseUrl: '.',
    // Redirect the protocol import to the copied source so the analyzer's
    // symbol-identity checks (registration membership) hold inside the
    // workspace. Runtime resolution is untouched: this file exists only here.
    paths: { '@deepseek-ai/dsh-typert-protocol': ['./packages/typert-protocol/src/index.ts'] },
  },
  files: [],
  references: [
    { path: './packages/dsh-idea' },
    { path: './packages/typert-protocol' },
  ],
}, null, 2))

const generator = new WorkspaceTypertGenerator(workspace, { checkDiagnostics: false })
const faces = ['host']
const packages = [manifest.name]
const output = join(packageDir, 'lib')
mkdirSync(output, { recursive: true })

let emittedRemote = false
for (const artifact of generator.generate(packages, faces)) {
  writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
  console.log(`generate-typert: wrote typert.${artifact.face} (${artifact.package})`)
  if (artifact.remote !== undefined) {
    emittedRemote = true
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
    console.log('generate-typert: wrote typert.remote-client')
  }
}
if (!emittedRemote) {
  console.error('generate-typert: no Remote methods were discovered — refusing to publish a host manifest without them')
  process.exit(1)
}
console.log('generate-typert: done')
