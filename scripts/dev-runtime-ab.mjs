/** Offline E6 control: fresh source snapshots, shared read-only dependencies. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { repositoryRoot, requireRun, runPath } from './dev-runtime.mjs'

const baseline = '9fcee9888390cd04d4a87bbf837c04bebfa92f61'
const candidate = 'b3a7aec8e20fe04f4e3839a6e53c847027ef149f'
const run = requireRun()
// HOME isolation must not let Corepack select/download a different release.
// pnpm supplies its already-installed JS entry point to the parent script.
const pnpmEntry = process.env.npm_execpath
assert.ok(pnpmEntry && /\/pnpm\.(?:mjs|cjs|js)$/.test(pnpmEntry) && existsSync(pnpmEntry), 'launch via pnpm test:runtime:ab')
const filters = ['schema.spec.ts', 'service.spec.ts', 'version.spec.ts', 'lifecycle.spec.ts',
  'semantic-core.spec.ts', 'semantic-index.spec.ts', 'semantic-retrieval.spec.ts',
  'resurfacing-preference.spec.ts', 'resurfacing-budget.spec.ts', 'resurfacing-mute-suppression.spec.ts',
  'p2-lite-update.spec.ts', 'client-p2-lite.spec.tsx', 'package.spec.ts']
function exec(command, args, options = {}) {
  const p = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options })
  if (p.error || p.status !== 0) throw new Error(`${command} setup failed: ${p.error?.message ?? p.stderr}`)
  return p.stdout
}
function digestFiles(root) {
  const hash = createHash('sha256')
  function walk(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name), name = prefix + entry.name
      if (entry.isDirectory()) walk(path, name + '/')
      else { assert.ok(entry.isFile()); hash.update(name + '\0'); hash.update(readFileSync(path)) }
    }
  }
  walk(root); return hash.digest('hex')
}
function mirrorDependencies(source, destination) {
  mkdirSync(destination, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (['.vite', '.vite-temp', '.cache'].includes(entry.name)) continue
    const from = join(source, entry.name), to = join(destination, entry.name)
    if (entry.name.startsWith('@') && entry.isDirectory()) mirrorDependencies(from, to)
    else symlinkSync(from, to) // alias only; no install and no traversal during cleanup
  }
}

assert.equal(exec('git', ['diff', '--name-only', `${baseline}..${candidate}`, '--',
  'packages/dsh-idea/src', 'packages/dsh-idea/tests', 'pnpm-lock.yaml']).trim(), '')
const lib = join(repositoryRoot, 'packages/dsh-idea/lib')
const evidence = { baseline, candidate, order: ['A', 'B', 'B', 'A'],
  node: process.version, pnpm: exec(process.execPath, [pnpmEntry, '--version']).trim(),
  pnpmEntrypointHash: createHash('sha256').update(readFileSync(pnpmEntry)).digest('hex'),
  sourceTestsLockIdentical: true, formalLibHash: digestFiles(lib),
  lockfileHash: createHash('sha256').update(readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'))).digest('hex'),
  controls: 'fresh HOME/DSH_HOME/tmp per case; same installed dependencies/lib; default parallelism and 5000ms E6 limit; no real Provider', cases: [] }

for (const [index, arm] of evidence.order.entries()) {
  const root = runPath(run, 'workspace', `ab-${index + 1}-${arm}`)
  mkdirSync(root)
  const ref = arm === 'A' ? baseline : candidate
  const archive = spawnSync('git', ['archive', ref], { cwd: repositoryRoot, maxBuffer: 32 * 1024 * 1024 })
  assert.equal(archive.status, 0)
  exec('tar', ['-xf', '-', '-C', root], { input: archive.stdout })
  const pkg = join(root, 'packages/dsh-idea')
  mirrorDependencies(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'))
  mirrorDependencies(join(repositoryRoot, 'packages/dsh-idea/node_modules'), join(pkg, 'node_modules'))
  cpSync(lib, join(pkg, 'lib'), { recursive: true })
  assert.equal(digestFiles(join(pkg, 'lib')), evidence.formalLibHash)
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DSH_IDEA_') && k !== 'NODE_COMPILE_CACHE'))
  for (const [key, name] of Object.entries({ HOME: 'home', DSH_HOME: 'dsh', TMPDIR: 'tmp',
    XDG_CACHE_HOME: 'cache', XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_STATE_HOME: 'state' })) {
    env[key] = join(root, 'isolated', name); mkdirSync(env[key], { recursive: true })
  }
  env.TMP = env.TEMP = env.TMPDIR
  const resultFile = runPath(run, 'logs', `ab-${index + 1}-${arm}.json`)
  const start = Date.now()
  const p = spawnSync(process.execPath, [pnpmEntry, '-C', pkg, 'test', ...filters, '--reporter=default', '--reporter=json', '--outputFile', resultFile],
    { env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 })
  writeFileSync(runPath(run, 'logs', `ab-${index + 1}-${arm}.log`), (p.stdout ?? '') + (p.stderr ?? ''))
  assert.ok(!p.error, p.error?.message)
  assert.ok(existsSync(resultFile), 'runner must emit evidence even for failures')
  const result = JSON.parse(readFileSync(resultFile, 'utf8'))
  const assertions = result.testResults.flatMap(x => x.assertionResults)
  const e6 = assertions.find(x => x.title.startsWith('E6 embedding:'))
  assert.ok(e6)
  const cleanError = text => String(text).replace(/\u001b\[[0-9;]*m/g, '')
  const failed = assertions.filter(x => x.status === 'failed').map(x => ({
    test: x.title,
    firstErrorLines: x.failureMessages.map(m => cleanError(m).split('\n')[0].slice(0, 200)),
  }))
  const outcome = { arm, ref, elapsedMs: Date.now() - start, exitCode: p.status,
    passed: result.numPassedTests, failed: result.numFailedTests, total: result.numTotalTests,
    e6: { status: e6.status, durationMs: e6.duration,
      timeout5000: /Test timed out in\s*5000\s*ms/.test(cleanError((p.stdout ?? '') + (p.stderr ?? ''))) },
    failedAssertions: failed,
    cleanup: arm === 'B' ? readdirSync(join(root, '.dev/runs')).length === 0 && readdirSync(join(root, '.dev/owners')).length === 0 : 'contained-in-parent-run' }
  assert.ok(outcome.cleanup)
  for (const path of ['packages/dsh-idea/node_modules/.vite', 'packages/dsh-idea/node_modules/.vite-temp', 'packages/dsh-idea/build/typert-workspace']) {
    assert.equal(existsSync(join(repositoryRoot, path)), false, 'no cache spill into real package')
  }
  evidence.cases.push(outcome)
  console.log(JSON.stringify({ abCase: index + 1, ...outcome }))
}
writeFileSync(runPath(run, 'logs', 'ab-summary.json'), JSON.stringify(evidence, null, 2))
console.log('AB_SUMMARY=' + JSON.stringify(evidence))
