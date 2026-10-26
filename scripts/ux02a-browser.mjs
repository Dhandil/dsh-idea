/** Real Web/Host, synthetic data and gated LLM. No Provider or normal Profile. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { userInfo } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { requireRun, runPath, recordException, repositoryRoot } from './dev-runtime.mjs'

const run = requireRun()
// Fail closed after the user's isolation review. Native Chromium sandboxing is
// retained, but it does not establish a filesystem/network policy for the
// browser main process. Page routing cannot attest background traffic either.
// No environment flag may waive this gate; a reviewed compatible enforcement
// mechanism and runtime evidence are required before removing the blocker.
throw new Error('DSH_IDEA_UX02A_BROWSER_BLOCKED_ISOLATION: browser-process protected-path denial and process-wide loopback enforcement are not proven; do not launch CFT')
const attempt = randomUUID()
const attemptHome = runPath(run, 'dsh-home', attempt), attemptProfile = runPath(run, 'browser-profile', attempt)
mkdirSync(attemptHome); mkdirSync(attemptProfile)
const playwright = process.env.UX02A_PLAYWRIGHT ?? '/Users/tongxin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const chrome = process.env.UX02A_CHROME ?? '/Users/tongxin/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
assert.ok(existsSync(playwright) && existsSync(chrome), 'provide preinstalled Playwright and CFT; never download')
recordException(run, { category: 'shared-playwright', path: playwright, reason: 'Read-only preinstalled driver, no shared MCP instance' })
recordException(run, { category: 'shared-cft', path: chrome, reason: 'Existing CFT binary; task-specific run-owned Profile' })
recordException(run, { category: 'browser-system-services', reason: 'CFT uses its native Chromium sandbox; nested macOS Seatbelt is unsupported. Page requests are loopback-only and background networking is disabled; OS/browser services are not assumed enumerable.' })
const policy = runPath(run, 'build', 'ux02a.sb')
const home = userInfo().homedir
writeFileSync(policy, `(version 1)\n(allow default)\n(deny file-read* file-write* (subpath ${JSON.stringify(home + '/.dsh')}))\n(deny file-read* file-write* (subpath ${JSON.stringify(home + '/Library/Application Support/Google/Chrome')}))\n(deny network-outbound)\n(allow network-outbound (remote ip "localhost:*"))\n`)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn, label) {
  const end = Date.now() + 30_000
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(20) }
  throw Error('UX02A fixture wait failed: ' + label)
}
let browser, chromeChild, host, page, cdp, traceOpen = false
const pending = new Map()
let request = 0, hostOutput = '', externalBrowserRequests = 0
const rpc = (op, payload = {}) => new Promise((resolve, reject) => {
  const id = ++request
  const timer = setTimeout(() => { pending.delete(id); reject(Error('fixture IPC timeout: ' + op)) }, 30_000)
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: e => { clearTimeout(timer); reject(e) } })
  host.send({ request: id, op, ...payload })
})
const delta = (before, after) => Object.fromEntries(Object.entries(after).flatMap(([key, value]) => {
  const count = value.count - (before[key]?.count ?? 0), totalMs = value.totalMs - (before[key]?.totalMs ?? 0)
  return count ? [[key, { count, totalMs }]] : []
}))
async function metricsHandle() {
  const fn = await cdp.send('Runtime.evaluate', { expression: `(()=>{const n=document.querySelector('[role="dialog"]');let f=n?.[Object.keys(n).find(k=>k.startsWith('__reactFiber'))];while(f){if(f.memoizedProps?.recordRendered)return f.memoizedProps.recordRendered;f=f.return}throw Error('missing real slot callback')})()` })
  assert.ok(fn.result.objectId, 'real slot callback handle')
  const props = await cdp.send('Runtime.getProperties', { objectId: fn.result.objectId })
  const scopes = props.internalProperties.find(x => x.name === '[[Scopes]]').value.objectId
  const list = await cdp.send('Runtime.getProperties', { objectId: scopes })
  for (const item of list.result.filter(x => /^\d+$/.test(x.name))) {
    const values = await cdp.send('Runtime.getProperties', { objectId: item.value.objectId })
    const surface = values.result.find(x => x.name === 'surface')
    if (surface?.value?.objectId) return surface.value.objectId
  }
  throw Error('cannot read real surface from slot scope')
}
async function clientMetrics(handle) {
  const result = await cdp.send('Runtime.callFunctionOn', { objectId: handle, functionDeclaration: 'function(){return this.performance.snapshot()}', returnByValue: true })
  assert.ok(!result.exceptionDetails)
  return result.result.value
}
async function traceEnd(name) {
  const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.end'); const { stream } = await completed
  let data = ''
  for (;;) { const value = await cdp.send('IO.read', { handle: stream }); data += value.data; if (value.eof) break }
  await cdp.send('IO.close', { handle: stream }); traceOpen = false
  writeFileSync(runPath(run, 'logs', name + '-trace.json'), data)
  const events = JSON.parse(data).traceEvents
  return { paints: events.filter(x => x.name === 'Paint').length,
    compositorScreenshots: events.filter(x => x.name === 'Screenshot').length }
}
async function screenshot(name, phase) {
  const path = runPath(run, 'screenshots', `${name}-${phase}.png`)
  await page.screenshot({ path })
  return { file: `${name}-${phase}.png`, sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    // Screenshot completion is a conservative visual upper bound, not an exact paint timestamp.
    upperBoundMs: await page.evaluate(phase => performance.now() - window.__ux02aClicks[phase === 'choice' ? 'choice' : 'generate'], phase) }
}
const evidence = { providerCalls: 0, cases: [], cancellations: [], paintMeaning: 'React commit, compositor Paint/Screenshot counts, and actual PNG capture upper bounds are distinct; no rAF-as-paint claim.' }
try {
  let ready = false
  host = spawn('/usr/bin/sandbox-exec', ['-f', policy, process.execPath, join(repositoryRoot, 'scripts/ux02a-host.mjs')], {
    cwd: run.paths.workspace, env: { ...process.env, DSH_HOME: attemptHome, DSH_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  host.on('message', m => {
    if (m.ready) { ready = true; return }
    const item = pending.get(m.request); if (!item) return; pending.delete(m.request)
    if (m.error) item.reject(Error(m.error)); else item.resolve(m.value)
  })
  host.on('close', code => { for (const item of pending.values()) item.reject(Error('fixture host exited ' + code)); pending.clear() })
  const append = b => { hostOutput += b; writeFileSync(runPath(run, 'logs', 'web-host.log'), hostOutput.replace(/token=\S+/g, 'token=<redacted>')) }
  host.stdout.on('data', append); host.stderr.on('data', append)
  host.send({ run })
  const url = await until(() => { if (host.exitCode !== null) throw Error('Host startup failed; inspect run-owned web-host.log'); return ready && hostOutput.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/)?.[1] }, 'official Web readiness')
  const setup = await rpc('fixtures')
  const { chromium } = await import(pathToFileURL(playwright).href)
  // Spawn without detaching: the task browser remains in the wrapper's process group.
  chromeChild = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--use-mock-keychain', '--password-store=basic',
    '--disable-background-networking', '--disable-component-update', '--remote-debugging-port=0',
    '--user-data-dir=' + attemptProfile, 'about:blank'], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] })
  let chromeLog = ''; chromeChild.stderr.on('data', b => { chromeLog += b; writeFileSync(runPath(run, 'logs', 'chrome.log'), chromeLog) })
  const activePort = join(attemptProfile, 'DevToolsActivePort')
  await until(() => existsSync(activePort), 'task CFT debugging listener')
  const port = readFileSync(activePort, 'utf8').split('\n')[0]
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port)
  const context = browser.contexts()[0]
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue()
    externalBrowserRequests++; return route.abort()
  })
  page = await context.newPage(); await page.setViewportSize({ width: 1440, height: 1000 })
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(() => {
    window.__ux02aClicks = {}
    document.addEventListener('click', event => {
      const node = event.target.closest?.('button,[role="menuitem"]')
      if (node?.textContent.trim() === '总结') window.__ux02aClicks.choice = performance.now()
      if (node?.textContent.trim() === '生成草稿') window.__ux02aClicks.generate = performance.now()
    }, true)
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  // Fresh Profiles have no current Workspace selection. Pick the registered
  // fixture Workspace through the ordinary UI, never a native directory picker.
  await page.getByRole('button', { name: '选择工作区', exact: true }).last().click()
  await page.getByText('workspace', { exact: true }).last().click()
  await page.getByText(setup.fixtures[0].label, { exact: true }).first().waitFor()
  cdp = await context.newCDPSession(page)
  async function open(fixture) {
    await page.getByText(fixture.label, { exact: true }).first().click()
    const action = page.getByRole('button', { name: '保存为 Idea', exact: true }).last()
    await action.waitFor(); await action.click()
    await page.getByRole('menuitem', { name: '总结', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    return metricsHandle()
  }
  for (const [index, fixture] of setup.fixtures.entries()) {
    const name = `case-${index + 1}`, before = await rpc('stats')
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.screenshot', transferMode: 'ReturnAsStream' }); traceOpen = true
    const handle = await open(fixture), choice = await screenshot(name, 'choice')
    assert.equal((await rpc('stats')).calls, before.calls, 'choice must be zero-model')
    if (fixture.mode === 'update') {
      await page.getByRole('button', { name: '更新已有 Idea', exact: true }).click()
      await page.getByRole('button', { name: /UX02A synthetic draft/ }).click()
      await page.getByRole('region', { name: '当前内容摘要' }).waitFor()
    }
    assert.equal((await rpc('source', { id: fixture.id })).live, fixture.availability === 'live', 'real source availability before prepare')
    await page.getByRole('button', { name: '生成草稿', exact: true }).click()
    await page.getByRole('status').filter({ hasText: '正在生成' }).waitFor()
    await until(async () => (await rpc('stats')).calls === before.calls + 1, 'single model dispatch')
    const pendingImage = await screenshot(name, 'pending'), first = await rpc('stats')
    assert.equal(first[fixture.mode]['host.model-first-text']?.count ?? 0, before[fixture.mode]['host.model-first-text']?.count ?? 0)
    await rpc('release-text')
    await until(async () => (await rpc('stats')).textSent > before.textSent, 'first text')
    assert.equal(await page.getByRole('form').count(), 0, 'partial JSON is not an editable proposal')
    await rpc('release-finish')
    await page.getByRole('form').waitFor()
    const preview = await screenshot(name, 'preview'), after = await rpc('stats')
    assert.equal(after.calls, before.calls + 1)
    const sample = { size: fixture.size, availability: fixture.availability, mode: fixture.mode, sessionEvents: fixture.events,
      client: await clientMetrics(handle), host: delta(before[fixture.mode], after[fixture.mode]),
      coldAtModelDispatch: after.coldCalls > before.coldCalls,
      visual: { choice, pending: pendingImage, preview }, trace: await traceEnd(name) }
    assert.equal(sample.coldAtModelDispatch, fixture.availability === 'cold')
    assert.ok(sample.trace.paints > 0 && sample.trace.compositorScreenshots > 0)
    evidence.cases.push(sample)
    console.log('UX02A_CASE=' + JSON.stringify(sample))
    await page.getByRole('button', { name: '取消', exact: true }).click()
  }
  for (const fixture of [setup.fixtures[0], setup.fixtures.at(-1)]) {
    const before = await rpc('stats'), handle = await open(fixture), clientBefore = await clientMetrics(handle)
    if (fixture.mode === 'update') {
      await page.getByRole('button', { name: '更新已有 Idea', exact: true }).click()
      await page.getByRole('button', { name: /UX02A synthetic draft/ }).click()
      await page.getByRole('region', { name: '当前内容摘要' }).waitFor()
    }
    await page.getByRole('button', { name: '生成草稿', exact: true }).click()
    await until(async () => (await rpc('stats')).calls === before.calls + 1, 'cancellation dispatch')
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await until(async () => (await rpc('stats')).aborted > before.aborted, 'real Host abort')
    await rpc('release-text'); await rpc('release-finish')
    await until(async () => ((await rpc('stats'))[fixture.mode]['host.prepare-total']?.count ?? 0) > (before[fixture.mode]['host.prepare-total']?.count ?? 0), 'late response settled')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.getByRole('dialog').count(), 0)
    const client = delta(clientBefore, await clientMetrics(handle))
    assert.equal(client['client.preview-commit'], undefined)
    evidence.cancellations.push({ mode: fixture.mode, size: fixture.size, availability: fixture.availability, realAbort: true, lateResponseIgnored: true, client })
  }
  assert.equal(await rpc('unchanged', { id: setup.ideaId }), true, 'no prepare/cancel modified persistent Idea')
  const final = await rpc('stats')
  assert.equal(final.calls, 10); assert.equal(final.blockedFetch, 0); assert.equal(externalBrowserRequests, 0)
  assert.deepEqual(pageErrors, [])
  evidence.final = { modelDoubleCalls: final.calls, realAborts: final.aborted, blockedFetch: final.blockedFetch, externalBrowserRequests, pageErrors: pageErrors.length }
  writeFileSync(runPath(run, 'logs', 'ux02a-browser-evidence.json'), JSON.stringify(evidence, null, 2))
  console.log('UX02A_BROWSER_PASS=' + JSON.stringify(evidence.final))
} catch (error) {
  if (page) {
    await page.screenshot({ path: runPath(run, 'screenshots', 'browser-failure.png') }).catch(() => {})
    writeFileSync(runPath(run, 'logs', 'browser-failure-dom.txt'), await page.locator('body').innerText().catch(() => 'unavailable'))
    writeFileSync(runPath(run, 'logs', 'browser-failure-a11y.txt'), await page.locator('body').ariaSnapshot().catch(() => 'unavailable'))
  }
  console.error(String(error.stack).replace(/token=\S+/g, 'token=<redacted>')); process.exitCode = 1
} finally {
  if (traceOpen) await traceEnd('interrupted').catch(() => {})
  await browser?.close().catch(() => {})
  if (chromeChild && chromeChild.exitCode === null && chromeChild.signalCode === null) { const closed = once(chromeChild, 'close'); chromeChild.kill('SIGTERM'); await closed }
  if (host && host.exitCode === null && host.signalCode === null) {
    await rpc('stop').catch(() => {}); const closed = once(host, 'close'); host.kill('SIGTERM'); await closed
  }
  for (const item of pending.values()) item.reject(Error('fixture disposed')); pending.clear()
  console.log('UX02A_BROWSER_DISPOSED')
}
