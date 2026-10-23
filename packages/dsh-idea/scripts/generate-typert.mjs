#!/usr/bin/env node
// Standalone Typert generation.
//
// The workspace analyzer can only see packages that physically live under
// <root>/packages (junctions are resolved away with realpath), and the Remote
// decorator/TypertRemoteService symbols must be declared inside a registered
// package for marker discovery. A repo outside the Harness tree therefore
// cannot be analyzed in place, so this script assembles an ephemeral
// generation workspace that mirrors the needed monorepo shape: this package's
// src, the checkout's dsh-typert-protocol src, and the Session package whose
// TypertResourceMap merges into the Protocol are copied under the owned run. The
// aggregate tsconfig references these packages, and the artifacts are written
// back into the real lib/. The workspace is rebuilt from scratch on every run and never
// committed; runtime code always resolves the real shared packages through
// the setup-dev junctions, so no duplicate Typert instance ever loads.
//
// Usage: pnpm generate:typert (the wrapper owns and cleans the workspace).
import { cpSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FaceModelEmitter, WorkspaceAnalyzer } from '@deepseek-ai/dsh-typert-generator'
import { requireRun, runPath } from '../../../scripts/dev-runtime.mjs'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The checkout location is derived from the junctioned generator dependency,
// so no second source of truth is needed.
const checkoutPackages = resolve(
  dirname(realpathSync(pathToFileURL(join(packageDir, 'node_modules/@deepseek-ai/dsh-typert-generator')))),
  '..',
)

const protocolPackage = join(checkoutPackages, 'typert/protocol')
const sessionPackage = join(checkoutPackages, 'core/session')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))

// Never sweep a previous invocation's directory, including a concurrent run.
const run = requireRun()
const workspace = runPath(run, 'build', `typert-${crypto.randomUUID()}`)
const localPackage = join(workspace, 'packages', 'dsh-idea')
const protocolCopy = join(workspace, 'packages/typert-protocol')
const sessionCopy = join(workspace, 'packages/dsh-session')

for (const dir of [join(workspace, 'packages'), localPackage, protocolCopy, sessionCopy]) mkdirSync(dir, { recursive: true })

// Relocation removes the package node_modules from the ancestor chain. Restore
// the same read-only resolution through a run-owned link, never mutate/install
// dependencies. Cleanup unlinks this alias without traversing its target.
symlinkSync(join(packageDir, 'node_modules'), join(workspace, 'node_modules'), 'junction')

cpSync(join(packageDir, 'src'), join(localPackage, 'src'), { recursive: true })
cpSync(join(packageDir, 'package.json'), join(localPackage, 'package.json'))
cpSync(join(protocolPackage, 'src'), join(protocolCopy, 'src'), { recursive: true })
cpSync(join(protocolPackage, 'package.json'), join(protocolCopy, 'package.json'))
cpSync(join(sessionPackage, 'src'), join(sessionCopy, 'src'), { recursive: true })
cpSync(join(sessionPackage, 'package.json'), join(sessionCopy, 'package.json'))

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
writeFileSync(join(sessionCopy, 'tsconfig.json'), JSON.stringify({
  compilerOptions,
  include: ['src'],
}, null, 2))
writeFileSync(join(workspace, 'tsconfig.host.json'), JSON.stringify({
  compilerOptions: {
    ...compilerOptions,
    baseUrl: '.',
    // Redirect the protocol and Session imports to copied sources so the
    // analyzer sees both sides of the real TypertResourceMap merge. Runtime
    // resolution is untouched: these paths exist only in this workspace.
    paths: {
      '@deepseek-ai/dsh-typert-protocol': ['./packages/typert-protocol/src/index.ts'],
      '@deepseek-ai/dsh-session': ['./packages/dsh-session/src/index.ts'],
      '@deepseek-ai/dsh-session/*': ['./packages/dsh-session/src/*'],
    },
  },
  files: [],
  references: [
    { path: './packages/dsh-idea' },
    { path: './packages/typert-protocol' },
    { path: './packages/dsh-session' },
  ],
}, null, 2))

const faces = ['host']
const output = join(packageDir, 'lib')
mkdirSync(output, { recursive: true })

// Analyze only this package for output while registering the real Session
// source. Harness 0.2.1 adds Session's TypertResourceMap declaration; the
// workspace generator's full-contributor pass would also emit unrelated
// Harness packages into this external plugin build.
const workspaceModel = new WorkspaceAnalyzer({
  root: workspace,
  packages: [manifest.name],
  faces,
  checkDiagnostics: false,
}).analyze()
const host = workspaceModel.faces.find(face => face.face === 'host')
const artifact = host === undefined ? undefined : new FaceModelEmitter(host).emit(manifest.name)
if (artifact === undefined) {
  console.error('generate-typert: no Host artifact was emitted for dsh-idea')
  process.exit(1)
}
writeFileSync(join(output, 'typert.host.js'), artifact.js)
writeFileSync(join(output, 'typert.host.d.ts'), artifact.dts)
console.log(`generate-typert: wrote typert.host (${manifest.name})`)
if (artifact.remote !== undefined) {
  writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
  writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
  writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
  console.log('generate-typert: wrote typert.remote-client')
}
if (artifact.remote === undefined) {
  console.error('generate-typert: no Remote methods were discovered — refusing to publish a host manifest without them')
  process.exit(1)
}
console.log('generate-typert: done')
