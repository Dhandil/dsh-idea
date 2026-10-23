/** Local execution resources only. Never imported by the shipped plugin. */
import { randomUUID } from 'node:crypto'
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const labelPattern = /^[a-z0-9][a-z0-9-]{0,47}$/
const idPattern = /^[a-z0-9][a-z0-9-]{0,47}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const marker = '.run-owner.json'
const directoryNames = ['home', 'dsh-home', 'tmp', 'browser-profile', 'workspace', 'storage',
  'logs', 'screenshots', 'videos', 'build', 'cache', 'config', 'data', 'state']
const fail = message => { throw new Error(`dev-runtime: ${message}`) }
const json = path => {
  const s = lstatSync(path)
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) fail('unsafe JSON file')
  return JSON.parse(readFileSync(path, 'utf8'))
}
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode

function directory(path, create = false) {
  if (create && !existsSync(path)) {
    try { mkdirSync(path, { mode: 0o700 }) } catch (e) { if (e.code !== 'EEXIST') throw e }
  }
  const s = lstatSync(path)
  if (!s.isDirectory() || s.isSymbolicLink() || realpathSync(path) !== path) fail('unsafe directory')
  return s
}

function layout(root, create = false) {
  root = resolve(root)
  const repo = directory(root)
  const dev = join(root, '.dev')
  directory(dev, create)
  const runs = join(dev, 'runs'), registry = join(dev, 'owners')
  directory(runs, create); directory(registry, create)
  return { root, runs, registry, repo: { dev: repo.dev, ino: repo.ino } }
}

/** PID alone is insufficient: retain its start time, host and user too. */
export function processIdentity(pid) {
  const p = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' })
  if (p.error) throw p.error
  if (p.stderr.trim()) fail('process identity proof unavailable')
  if (p.status === 1 && !p.stdout.trim()) return undefined
  if (p.status !== 0 || !p.stdout.trim()) fail('cannot establish process identity')
  return { pid, started: p.stdout.trim() }
}

function alive(identity) {
  const current = processIdentity(identity.pid)
  if (current && current.started !== identity.started) fail('PID reused; retain for review')
  return current !== undefined
}

// Serialize only metadata transitions/audit, not task execution. This prevents
// a strict auditor from seeing half-created/half-removed ownership records.
function withLifecycleLock(root, operation) {
  const l = layout(root), file = join(l.root, '.dev', 'lifecycle.lock')
  const owner = { root: l.root, host: hostname(), uid: process.getuid(),
    process: processIdentity(process.pid), token: randomUUID() }
  const deadline = Date.now() + 5000
  for (;;) {
    try { writeFileSync(file, JSON.stringify(owner), { flag: 'wx', mode: 0o600 }); break }
    catch (e) {
      if (e.code !== 'EEXIST') throw e
      let other
      try { other = json(file) } catch (readError) {
        // A lock may disappear between the exclusive-create and inspection.
        if (readError.code === 'ENOENT') continue
        if (readError instanceof SyntaxError && Date.now() < deadline) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
          continue
        }
        throw readError
      }
      if (other.root !== l.root || other.host !== owner.host || other.uid !== owner.uid
        || !other.token || !other.process || !alive(other.process)) fail('unknown/orphan lifecycle lock; retained')
      if (Date.now() >= deadline) fail('metadata busy; retry audit (not a residue classification)')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  const identity = lstatSync(file)
  try { return operation() }
  finally {
    if (!sameFile(lstatSync(file), identity) || json(file).token !== owner.token) fail('lifecycle lock identity changed')
    unlinkSync(file)
  }
}

function readRun(root, id) {
  if (!idPattern.test(id)) fail('invalid run-id')
  const l = layout(root)
  const path = join(l.runs, id), receipt = join(l.registry, `${id}.json`)
  const st = directory(path)
  for (const file of [receipt, join(path, marker)]) {
    const s = lstatSync(file)
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) fail('unsafe ownership record')
  }
  const owner = json(receipt), copy = json(join(path, marker))
  if (JSON.stringify(owner) !== JSON.stringify(copy) || owner.version !== 1 || owner.id !== id
    || owner.root !== l.root || owner.host !== hostname() || owner.uid !== process.getuid()
    || owner.repo.dev !== l.repo.dev || owner.repo.ino !== l.repo.ino
    || owner.directory.dev !== st.dev || owner.directory.ino !== st.ino
    || !/^[0-9a-f-]{36}$/.test(owner.token)) fail('unknown or changed ownership')
  return { ...l, id, path, receipt, owner }
}

function pathsFor(path) {
  return Object.fromEntries(directoryNames.map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), join(path, name)]))
}

export function createRun({ root = repositoryRoot, label = 'task' } = {}) {
  if (process.platform === 'win32') fail('POSIX process/handle proof required; Windows is not supported')
  // Validate before layout() or any filesystem writes. Do not silently turn
  // punctuation-only/leading-hyphen labels into unaddressable run directories.
  if (typeof label !== 'string' || !labelPattern.test(label.toLowerCase())) fail('invalid run label')
  const id = `${label.toLowerCase()}-${randomUUID()}`
  if (!idPattern.test(id)) fail('invalid generated run-id')
  const ownerProcess = processIdentity(process.pid)
  if (!ownerProcess) fail('owner process identity unavailable')
  const l = layout(root, true)
  return withLifecycleLock(l.root, () => {
    const path = join(l.runs, id)
    mkdirSync(path, { mode: 0o700 })
    const st = directory(path)
    const owner = { version: 1, id, token: randomUUID(), root: l.root, repo: l.repo,
      directory: { dev: st.dev, ino: st.ino }, host: hostname(), uid: process.getuid(),
      process: ownerProcess, createdAt: new Date().toISOString() }
    const receipt = join(l.registry, `${id}.json`)
    const serialized = JSON.stringify(owner)
    writeFileSync(receipt, serialized, { flag: 'wx', mode: 0o600 })
    writeFileSync(join(path, marker), serialized, { flag: 'wx', mode: 0o600 })
    const paths = pathsFor(path)
    for (const dir of Object.values(paths)) mkdirSync(dir, { mode: 0o700 })
    writeFileSync(join(path, 'exceptions.json'), JSON.stringify([
      { category: 'system', reason: 'OS sockets, shared memory, crash reports and OS/browser services may ignore TMPDIR; not searched or deleted', status: 'external-unverified' },
      { category: 'shared', reason: 'Preinstalled MCP services and browser binaries, package stores and Harness dependency links stay shared; never redirected or cleaned', status: 'preserved' },
    ]), { mode: 0o600 })
    return { ...readRun(l.root, id), paths }
  })
}

/** Reject both lexical escapes and existing symlink ancestors. */
export function runPath(run, ...parts) {
  const current = readRun(run.root, run.id)
  if (current.owner.token !== run.owner.token) fail('ownership token changed')
  const path = resolve(current.path, ...parts), rel = relative(current.path, path)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail('path outside run')
  let cursor = current.path
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part)
    if (existsSync(cursor) || (() => { try { return lstatSync(cursor).isSymbolicLink() } catch { return false } })()) {
      const s = lstatSync(cursor)
      if (s.isSymbolicLink() || (cursor !== path && !s.isDirectory())) fail('unsafe run path')
    }
  }
  return path
}

export function requireRun(env = process.env) {
  const id = env.DSH_IDEA_RUN_ID
  if (!id) fail('use pnpm dev:run -- <command>, or a wrapped project script')
  const run = readRun(repositoryRoot, id)
  if (env.DSH_IDEA_RUN_TOKEN !== run.owner.token || env.DSH_IDEA_RUN_DIR !== run.path || !alive(run.owner.process)) fail('inactive or invalid inherited run')
  return { ...run, paths: pathsFor(run.path) }
}

export function runEnvironment(run, base = process.env) {
  const p = run.paths
  // Remove common inherited credentials; a real-provider task requires separate explicit authorization.
  const env = Object.fromEntries(Object.entries(base).filter(([key]) => !/(API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)))
  return { ...env, DSH_IDEA_RUN_ID: run.id, DSH_IDEA_RUN_DIR: run.path,
    DSH_IDEA_RUN_TOKEN: run.owner.token, DSH_IDEA_LIVE: '0',
    HOME: p.home, DSH_HOME: p.dshHome, TMPDIR: p.tmp, TMP: p.tmp, TEMP: p.tmp,
    XDG_CACHE_HOME: p.cache, XDG_CONFIG_HOME: p.config, XDG_DATA_HOME: p.data, XDG_STATE_HOME: p.state,
    DSH_IDEA_BROWSER_PROFILE: p.browserProfile, DSH_IDEA_WORKSPACE: p.workspace,
    DSH_IDEA_STORAGE: p.storage, DSH_IDEA_LOGS: p.logs, DSH_IDEA_SCREENSHOTS: p.screenshots,
    DSH_IDEA_VIDEOS: p.videos, DSH_IDEA_BUILD: p.build, DSH_IDEA_CACHE: p.cache,
    PUPPETEER_TMP_DIR: p.tmp, CHROME_LOG_FILE: join(p.logs, 'chrome.log'),
    NODE_COMPILE_CACHE: join(p.cache, 'node'),
    npm_config_cache: join(p.cache, 'npm'), COREPACK_HOME: join(p.cache, 'corepack'),
  }
}

export function recordException(run, { category, path, reason }) {
  if (!category || !reason || (path !== undefined && !isAbsolute(path))) fail('invalid exception')
  const file = runPath(run, 'exceptions.json')
  const entries = json(file)
  entries.push({ category, path, reason, status: 'external-unverified' })
  writeFileSync(file, JSON.stringify(entries), { mode: 0o600 })
}

function handles(path) {
  const p = spawnSync('lsof', ['-nP', '-Fpn'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (p.error || ![0, 1].includes(p.status) || p.stderr.trim()) fail('open-handle proof unavailable; retained')
  let pid; const found = []
  for (const line of p.stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    if (line.startsWith('n')) {
      const name = line.slice(1).replace(/ \(deleted\)$/, '')
      if (name === path || name.startsWith(path + sep)) found.push(pid)
    }
  }
  return [...new Set(found)]
}

function snapshot(path) {
  const entries = []
  const walk = p => {
    const s = lstatSync(p)
    entries.push({ path: p, stat: s })
    if (s.isDirectory() && !s.isSymbolicLink()) {
      if (realpathSync(p) !== p) fail('directory boundary changed')
      for (const name of readdirSync(p).sort()) walk(join(p, name))
    } else if (!s.isFile() && !s.isSymbolicLink()) fail('unexpected special file; retained')
  }
  walk(path)
  return entries
}

/** Reap is deliberately explicit. Active/unknown runs never qualify. */
export function cleanupRun(run, { stale = false } = {}) {
  return withLifecycleLock(run.root, () => cleanupUnlocked(run, stale))
}

function cleanupUnlocked(run, stale) {
  const current = readRun(run.root, run.id)
  if (run.owner.token !== current.owner.token) fail('ownership changed')
  if (stale) {
    if (alive(current.owner.process)) fail('active owner; retained')
  } else if (current.owner.process.pid !== process.pid || !alive(current.owner.process)) fail('not this process owner')
  const lock = join(current.registry, `${run.id}.cleanup`)
  mkdirSync(lock, { mode: 0o700 }) // competing/abandoned cleanup fails closed
  try {
    const execution = join(current.path, 'execution.json')
    if (existsSync(execution)) {
      const child = json(execution)
      if (alive(child)) fail('active child; retained')
      if (groupMembers(child.pid).length) fail('active process group; retained')
    }
    if (handles(current.path).length) fail('active file handles; retained')
    const exceptions = json(join(current.path, 'exceptions.json')).map(x => ({ ...x,
      endCheck: x.path ? (existsSync(x.path) ? 'still-present-not-deleted' : 'absent') : 'not-enumerable',
    }))
    const entries = snapshot(current.path)
    if (entries.some(x => x.stat.dev !== entries[0].stat.dev)) fail('mount boundary; retained')
    for (const e of entries.reverse()) {
      const now = lstatSync(e.path)
      if (!sameFile(now, e.stat) || (!now.isDirectory() && (now.size !== e.stat.size || now.mtimeMs !== e.stat.mtimeMs))) fail('content changed during cleanup')
      if (now.isDirectory()) {
        if (realpathSync(e.path) !== e.path) fail('directory changed during cleanup')
        rmdirSync(e.path) // a new entry causes failure, never recursively swept
      } else unlinkSync(e.path) // symlink itself only; no dereference
    }
    if (existsSync(current.path)) fail('run directory remains')
    unlinkSync(current.receipt)
    return { id: run.id, removed: true, exceptions }
  } finally { rmdirSync(lock) }
}

function inspectUnlocked(l) {
  const root = l.root
  const entries = readdirSync(l.runs).sort().map(id => {
    try {
      const run = readRun(root, id)
      return { id, state: alive(run.owner.process) ? 'active' : 'orphan', run }
    } catch { return { id, state: 'unknown' } }
  })
  for (const file of readdirSync(l.registry).sort()) {
    const id = file.replace(/\.json$|\.cleanup$/g, '')
    if (file === `${id}.json` && entries.some(x => x.id === id)) continue
    entries.push({ id: file, state: file.endsWith('.cleanup') ? 'unknown-cleanup-lock' : 'unknown-registry-entry' })
  }
  for (const file of readdirSync(join(root, '.dev')).sort()) {
    if (!['runs', 'owners', 'lifecycle.lock'].includes(file)) entries.push({ id: file, state: 'unknown-runtime-root-entry' })
  }
  return entries
}

export function inspectRuns(root = repositoryRoot) {
  try { lstatSync(join(root, '.dev')) } catch (e) { if (e.code === 'ENOENT') return []; throw e }
  return withLifecycleLock(root, () => inspectUnlocked(layout(root)))
}

/** Automatic pre/post execution gate. No garbage collection occurs here. */
export function strictAudit(root = repositoryRoot) {
  const entries = inspectRuns(root)
  const issues = entries.filter(x => x.state !== 'active').map(({ id, state }) => ({ id, state }))
  if (issues.length) {
    const error = new Error(`dev-runtime: strict audit blocked: ${JSON.stringify(issues)}`)
    error.audit = issues
    throw error
  }
  return entries
}

export function reapRun(id, root = repositoryRoot) {
  return cleanupRun(readRun(root, id), { stale: true })
}

export function groupMembers(pgid) {
  const p = spawnSync('ps', ['-axo', 'pid=,pgid=,stat='], { encoding: 'utf8' })
  if (p.error || p.status !== 0 || p.stderr.trim()) fail('process group proof unavailable')
  return p.stdout.trim().split('\n').map(line => line.trim().split(/\s+/))
    .filter(row => Number(row[1]) === pgid && !row[2]?.startsWith('Z')).map(row => Number(row[0]))
}

export function registerChild(run, child) {
  writeFileSync(runPath(run, 'execution.json'), JSON.stringify(child), { flag: 'wx', mode: 0o600 })
}
