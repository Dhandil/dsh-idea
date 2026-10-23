import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import {
  closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync,
  renameSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanupRun, createRun, inspectRuns, processIdentity, reapRun, recordException, registerChild,
  requireRun, runEnvironment, runPath,
} from '../dev-runtime.mjs'

const outer = requireRun()
const runtime = fileURLToPath(new URL('../dev-runtime.mjs', import.meta.url))
const cli = fileURLToPath(new URL('../dev-run.mjs', import.meta.url))
const runs = [], children = []
const independentEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('DSH_IDEA_RUN_')))
const fixture = () => mkdtempSync(join(outer.paths.tmp, 'runtime-fixture-'))
function owned() {
  const run = createRun({ root: fixture(), label: 'unit' })
  runs.push(run)
  return run
}
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); await once(child, 'close')
    }
  }
  for (const run of runs.splice(0)) if (existsSync(run.path)) cleanupRun(run)
})

function start(args, options = {}) {
  const child = spawn(process.execPath, args, { env: independentEnv, ...options })
  children.push(child)
  let stdout = '', stderr = ''
  child.stdout?.on('data', b => { stdout += b })
  child.stderr?.on('data', b => { stderr += b })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  const line = async () => {
    const deadline = Date.now() + 10000
    while (!stdout.includes('\n')) {
      if (Date.now() > deadline || child.exitCode !== null) throw new Error('fixture did not become ready: ' + stderr)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    return JSON.parse(stdout.split('\n')[0])
  }
  return { child, done, line }
}

test('unique IDs, private owned paths, full isolated environment and credential filtering', () => {
  const a = owned(), b = createRun({ root: a.root, label: 'parallel' }); runs.push(b)
  assert.notEqual(a.path, b.path)
  const env = runEnvironment(a, { PATH: process.env.PATH, OPENAI_API_KEY: 'do-not-pass', DSH_IDEA_EMBEDDING_API_KEY: 'do-not-pass' })
  for (const k of ['HOME', 'DSH_HOME', 'TMPDIR', 'TMP', 'TEMP', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'DSH_IDEA_BROWSER_PROFILE', 'DSH_IDEA_WORKSPACE', 'DSH_IDEA_STORAGE', 'DSH_IDEA_LOGS', 'DSH_IDEA_SCREENSHOTS', 'DSH_IDEA_VIDEOS', 'DSH_IDEA_BUILD', 'DSH_IDEA_CACHE']) {
    assert.ok(env[k].startsWith(a.path + '/'), k)
    assert.ok(existsSync(env[k]), k)
  }
  assert.equal(env.OPENAI_API_KEY, undefined)
  assert.equal(env.DSH_IDEA_EMBEDDING_API_KEY, undefined)
  assert.equal(readFileSync(a.receipt, 'utf8'), readFileSync(join(a.path, '.run-owner.json'), 'utf8'))
  assert.equal(inspectRuns(a.root).filter(x => x.state === 'active').length, 2)
})

test('cleanup removes only this run, preserving concurrent runs and repository siblings', () => {
  const a = owned(), b = createRun({ root: a.root, label: 'other' }); runs.push(b)
  writeFileSync(join(a.root, 'keep'), 'keep')
  writeFileSync(runPath(a, 'logs', 'output'), 'test')
  assert.equal(cleanupRun(a).removed, true)
  assert.equal(existsSync(a.path), false)
  assert.equal(existsSync(a.receipt), false)
  assert.ok(existsSync(b.path))
  assert.equal(readFileSync(join(a.root, 'keep'), 'utf8'), 'keep')
})

test('lexical escapes, absolute escapes and symlink ancestors are refused', () => {
  const run = owned(), outside = fixture()
  for (const part of ['..', '../sibling', run.root, '/']) assert.throws(() => runPath(run, part), /outside run/)
  symlinkSync(outside, join(run.paths.tmp, 'escape'))
  assert.throws(() => runPath(run, 'tmp', 'escape', 'file'), /unsafe run path/)
  writeFileSync(join(outside, 'keep'), 'keep')
  cleanupRun(run)
  assert.equal(readFileSync(join(outside, 'keep'), 'utf8'), 'keep')
})

test('symlinked .dev and changed directory identities are refused', () => {
  const root = fixture(), outside = fixture()
  symlinkSync(outside, join(root, '.dev'))
  assert.throws(() => createRun({ root }), /unsafe directory/)
  const run = owned(), saved = run.path + '-saved'
  renameSync(run.path, saved); mkdirSync(run.path)
  assert.throws(() => cleanupRun(run))
  rmdirSync(run.path); renameSync(saved, run.path)
})

test('unknown/mismatched ownership and duplicate cleanup fail closed', () => {
  const run = owned(), marker = join(run.path, '.run-owner.json')
  const original = readFileSync(marker, 'utf8')
  writeFileSync(marker, JSON.stringify({ ...run.owner, token: 'bad' }))
  assert.throws(() => cleanupRun(run), /ownership/)
  assert.ok(existsSync(run.path))
  writeFileSync(marker, original)
  assert.throws(() => reapRun('../outside', run.root), /invalid run-id/)
  cleanupRun(run)
  assert.throws(() => cleanupRun(run))
})

test('active owner cannot be reaped', () => {
  const run = owned()
  assert.throws(() => reapRun(run.id, run.root), /active owner/)
  assert.ok(existsSync(run.path))
})

test('open file handle prevents cleanup until explicitly released', () => {
  const run = owned(), file = runPath(run, 'tmp', 'open-file')
  writeFileSync(file, 'test')
  const fd = openSync(file, 'r')
  try { assert.throws(() => cleanupRun(run), /active file handles/) } finally { closeSync(fd) }
  assert.ok(existsSync(file))
  assert.equal(cleanupRun(run).removed, true)
})

test('an active registered child blocks cleanup even without file handles', async () => {
  const run = owned(), p = start(['-e', "console.log('{}');setInterval(()=>{},1000)"])
  await p.line()
  registerChild(run, processIdentity(p.child.pid))
  assert.throws(() => cleanupRun(run), /active child/)
  assert.ok(existsSync(run.path))
  p.child.kill('SIGTERM'); await p.done
  assert.equal(cleanupRun(run).removed, true)
})

test('unavailable handle scanner retains the complete run', () => {
  const run = owned(), bin = join(fixture(), 'bin')
  mkdirSync(bin)
  symlinkSync('/bin/ps', join(bin, 'ps'))
  const saved = process.env.PATH
  try {
    process.env.PATH = bin
    assert.throws(() => cleanupRun(run), /open-handle proof unavailable/)
    assert.ok(existsSync(run.paths.home))
  } finally { process.env.PATH = saved }
})

test('PID reuse or changed owner identity is never treated as an inactive run', () => {
  const run = owned(), original = readFileSync(run.receipt, 'utf8')
  const changed = JSON.stringify({ ...run.owner, process: { ...run.owner.process, started: 'not-this-process' } })
  try {
    writeFileSync(run.receipt, changed); writeFileSync(join(run.path, '.run-owner.json'), changed)
    assert.throws(() => reapRun(run.id, run.root), /PID reused/)
    assert.ok(existsSync(run.path))
  } finally { writeFileSync(run.receipt, original); writeFileSync(join(run.path, '.run-owner.json'), original) }
})

test('symlink ownership files cannot be followed', () => {
  const run = owned(), marker = join(run.path, '.run-owner.json')
  const original = readFileSync(marker, 'utf8'), outside = join(fixture(), 'outside')
  writeFileSync(outside, original)
  unlinkSync(marker); symlinkSync(outside, marker)
  assert.throws(() => cleanupRun(run), /unsafe ownership record/)
  unlinkSync(marker); writeFileSync(marker, original)
  assert.ok(existsSync(outside))
})

test('external exceptions are checked but never removed', () => {
  const run = owned(), outside = join(fixture(), 'external')
  writeFileSync(outside, 'keep')
  recordException(run, { category: 'test-external', path: outside, reason: 'controlled external exception fixture' })
  const result = cleanupRun(run)
  assert.equal(result.exceptions.at(-1).endCheck, 'still-present-not-deleted')
  assert.equal(result.exceptions[0].endCheck, 'not-enumerable')
  assert.ok(existsSync(outside))
})

test('success and failure commands both remove their run and preserve exit status', async () => {
  for (const code of [0, 7]) {
    const p = start([cli, '--', process.execPath, '-e', `console.log(JSON.stringify({dir:process.env.DSH_IDEA_RUN_DIR,home:require('node:os').homedir(),tmp:require('node:os').tmpdir(),dsh:process.env.DSH_HOME}));process.exitCode=${code}`])
    const result = await p.done, paths = JSON.parse(result.stdout.split('\n')[0])
    assert.equal(result.code, code, result.stderr)
    assert.ok(paths.home.startsWith(paths.dir + '/'))
    assert.ok(paths.tmp.startsWith(paths.dir + '/'))
    assert.ok(paths.dsh.startsWith(paths.dir + '/'))
    assert.equal(existsSync(paths.dir), false)
    assert.match(result.stderr, /"removed":true/)
  }
})

test('spawn failure also cleans its run (no unhandled rejection)', async () => {
  const before = inspectRuns().map(x => x.id)
  const p = start([cli, '--', '/nonexistent-dsh-idea-test-command'])
  const result = await p.done
  assert.equal(result.code, 1)
  assert.match(result.stderr, /"removed":true/)
  assert.doesNotMatch(result.stderr, /UnhandledPromiseRejection/)
  assert.deepEqual(inspectRuns().map(x => x.id), before)
})

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`${sig} cancels the task and verifies removal`, async () => {
    const p = start([cli, '--', process.execPath, '-e', "console.log(JSON.stringify({dir:process.env.DSH_IDEA_RUN_DIR}));setInterval(()=>{},1000)"])
    const { dir } = await p.line()
    p.child.kill(sig)
    const result = await p.done
    assert.equal(result.code, { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }[sig], result.stderr)
    assert.equal(existsSync(dir), false)
  })
}

test('two concurrent CLI tasks never share or delete each other\'s run', async () => {
  const script = "console.log(JSON.stringify({dir:process.env.DSH_IDEA_RUN_DIR}));setInterval(()=>{},1000)"
  const a = start([cli, '--', process.execPath, '-e', script]), b = start([cli, '--', process.execPath, '-e', script])
  const pa = await a.line(), pb = await b.line()
  assert.notEqual(pa.dir, pb.dir)
  a.child.kill('SIGTERM'); assert.equal((await a.done).code, 143)
  assert.equal(existsSync(pa.dir), false); assert.ok(existsSync(pb.dir))
  b.child.kill('SIGTERM'); assert.equal((await b.done).code, 143)
  assert.equal(existsSync(pb.dir), false)
})

test('normal exit gracefully stops a descendant in the owned process group', async () => {
  const script = "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref();console.log(JSON.stringify({dir:process.env.DSH_IDEA_RUN_DIR}))"
  const p = start([cli, '--', process.execPath, '-e', script])
  const result = await p.done, { dir } = JSON.parse(result.stdout.split('\n')[0])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(existsSync(dir), false)
})

test('uncooperative cancellation retains active resources; reap waits for child exit', async () => {
  const script = "process.on('SIGTERM',()=>{});process.on('SIGUSR1',()=>process.exit(0));console.log(JSON.stringify({dir:process.env.DSH_IDEA_RUN_DIR,id:process.env.DSH_IDEA_RUN_ID,pid:process.pid}));setInterval(()=>{},1000)"
  const p = start([cli, '--', process.execPath, '-e', script])
  const info = await p.line()
  try {
    const exited = once(p.child, 'exit')
    p.child.kill('SIGTERM'); await exited
    assert.ok(existsSync(info.dir))
    assert.throws(() => reapRun(info.id), /active child/)
  } finally {
    process.kill(info.pid, 'SIGUSR1')
    await p.done
    assert.equal(reapRun(info.id).removed, true)
  }
})

test('SIGKILL leaves an auditable orphan; active then stale recovery is safe', async () => {
  const root = fixture()
  const script = `import {createRun} from ${JSON.stringify(new URL('../dev-runtime.mjs', import.meta.url).href)};const r=createRun({root:${JSON.stringify(root)},label:'crash'});console.log(JSON.stringify({id:r.id,path:r.path}));setInterval(()=>{},1000)`
  const p = start(['--input-type=module', '-e', script])
  const info = await p.line()
  assert.throws(() => reapRun(info.id, root), /active owner/)
  p.child.kill('SIGKILL'); await p.done
  assert.equal(inspectRuns(root)[0].state, 'orphan')
  assert.equal(reapRun(info.id, root).removed, true)
  assert.equal(existsSync(info.path), false)
})

test('unknown orphan directory is reported and retained', () => {
  const run = owned(), unknown = join(run.root, '.dev', 'runs', 'unknown')
  mkdirSync(unknown)
  assert.equal(inspectRuns(run.root).find(x => x.id === 'unknown').state, 'unknown')
  assert.throws(() => reapRun('unknown', run.root), /invalid run-id/)
  assert.ok(existsSync(unknown))
})

test('nested project commands reuse the parent run without cleaning it early', async () => {
  const p = start([cli, '--', process.execPath, cli, '--', process.execPath, '-e', "console.log(JSON.stringify({dir:process.env.DSH_IDEA_RUN_DIR}))"])
  const result = await p.done, { dir } = JSON.parse(result.stdout.split('\n')[0])
  assert.equal(result.code, 0, result.stderr)
  assert.equal((result.stderr.match(/"removed":true/g) ?? []).length, 1)
  assert.equal(existsSync(dir), false)
})

test('unwrapped configuration access is rejected, not silently pointed at real HOME', () => {
  assert.throws(() => requireRun({}), /use pnpm dev:run/)
  assert.ok(readdirSync(outer.path).length)
  assert.ok(existsSync(runtime))
})
