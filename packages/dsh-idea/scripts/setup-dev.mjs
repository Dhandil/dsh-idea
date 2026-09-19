#!/usr/bin/env node
// Links this package's Harness dependencies to a local deepseek-harness checkout
// so typecheck, tests, and builds resolve the same module instances the runtime
// profile uses. The checkout must be installed AND built (its packages ship lib/).
//
// Usage: DSH_CHECKOUT=D:/Harness/deepseek-harness node scripts/setup-dev.mjs
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

const checkout = resolve(process.env.DSH_CHECKOUT ?? '')
if (!checkout || !existsSync(join(checkout, 'package.json'))) {
  console.error('setup-dev: set DSH_CHECKOUT to a deepseek-harness checkout')
  process.exit(1)
}

const LINKS = [
  ['@deepseek-ai/cordis', 'vendor/cordis'],
  ['@deepseek-ai/cosmokit', 'vendor/cosmokit'],
  ['@deepseek-ai/schemastery', 'vendor/schemastery'],
  ['@deepseek-ai/dsh-storage', 'packages/storage/storage'],
  ['@deepseek-ai/dsh-storage-json', 'packages/storage/storage-json'],
  ['@deepseek-ai/dsh-storage-domain', 'packages/storage/storage-domain'],
  ['@deepseek-ai/dsh-invariants', 'packages/runtime-diagnostics/invariants'],
  ['@deepseek-ai/dsh-session', 'packages/core/session'],
  ['@deepseek-ai/dsh-session-query', 'packages/session-query/session-query'],
  ['@deepseek-ai/dsh-llm', 'packages/llm/llm'],
  ['@deepseek-ai/dsh-agent', 'packages/core/agent'],
  ['@deepseek-ai/dsh-agent-default-model', 'packages/core/agent-default-model'],
  ['@deepseek-ai/dsh-api-session-controller', 'packages/api/session-controller'],
  ['@deepseek-ai/dsh-typert-protocol', 'packages/typert/protocol'],
  ['@deepseek-ai/dsh-typert-generator', 'packages/typert/generator'],
  ['@deepseek-ai/dsh-typert-loader', 'packages/typert/loader'],
  ['@deepseek-ai/dsh-typert-registry', 'packages/typert/registry'],
  ['@deepseek-ai/dsh-api-remotes', 'packages/api/remotes'],
  ['@deepseek-ai/dsh-client-store', 'packages/client/store'],
  ['@deepseek-ai/dsh-client-locale', 'packages/client/locale'],
  ['@deepseek-ai/dsh-client-ui-slots', 'packages/client/ui-slots'],
  ['@deepseek-ai/dsh-client-ui-primitives', 'packages/client/ui-primitives'],
  ['@deepseek-ai/dsh-client-ui-renderer', 'packages/client/ui-renderer'],
  ['@deepseek-ai/dsh-client-ui-conversation', 'packages/client/ui-conversation'],
  ['@deepseek-ai/dsh-client-ui-chat', 'packages/client/ui-chat'],
  ['@deepseek-ai/dsh-client-ui-session', 'packages/client/ui-session'],
  ['@deepseek-ai/dsh-client-ui-settings', 'packages/client/ui-settings'],
  ['@deepseek-ai/dsh-client-ui-commands', 'packages/client/ui-commands'],
  ['@deepseek-ai/dsh-client-ui-input-trigger', 'packages/client/ui-input-trigger'],
]

function link(name, target) {
  const link_ = join('node_modules', name)
  if (!existsSync(join(target, 'package.json'))) {
    console.error(`setup-dev: missing package at ${target} (is the checkout installed?)`)
    process.exit(1)
  }
  const built = ['lib/index.js', 'lib/index.cjs', 'index.js', 'index.cjs'].some(file => existsSync(join(target, file)))
  if (!built) {
    console.error(`setup-dev: ${target} has no built output — build the checkout first (pnpm build)`)
    process.exit(1)
  }
  rmSync(link_, { recursive: true, force: true })
  mkdirSync(join(link_, '..'), { recursive: true })
  symlinkSync(target, link_, 'junction')
  console.log(`setup-dev: linked ${name} -> ${target}`)
}

for (const [name, rel] of LINKS) {
  link(name, join(checkout, rel))
}

// One zod instance across the whole graph: link the checkout's installed copy
// so record schemas passed into storage-domain share its zod.
const pnpmRoot = join(checkout, 'node_modules', '.pnpm')
const zodDirs = existsSync(pnpmRoot)
  ? readdirSync(pnpmRoot).filter(name => /^zod@4\./.test(name)).sort((a, b) => {
      const version = name => name.match(/^zod@(\d+\.\d+\.\d+)/)?.[1] ?? '0.0.0'
      return version(a).localeCompare(version(b), undefined, { numeric: true })
    })
  : []
if (zodDirs.length === 0) {
  console.error('setup-dev: no zod@4.* found in the checkout (is the checkout installed?)')
  process.exit(1)
}
link('zod', join(pnpmRoot, zodDirs[zodDirs.length - 1], 'node_modules', 'zod'))

console.log('setup-dev: done')
