/** Offline real-Web fixture host. Invoke only through ux02a-browser.mjs. */
import assert from 'node:assert/strict'
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { runPath, repositoryRoot } from './dev-runtime.mjs'

assert.ok(process.send, 'fixture requires an owning IPC process')
// The owning browser driver calls requireRun() before spawning this Seatbelt
// worker. Seatbelt cannot inspect the unsandboxed owner's birth time with ps.
// Transfer its authenticated run over private parent IPC; runPath still checks
// matching marker/receipt, token and filesystem identity on every fixture write.
const [{ run }] = await once(process, 'message')
assert.equal(run.path, process.env.DSH_IDEA_RUN_DIR)
assert.equal(run.owner.token, process.env.DSH_IDEA_RUN_TOKEN)
runPath(run, 'build', 'ux02a-host-handoff')
const harness = resolve(realpathSync(join(repositoryRoot, 'packages/dsh-idea/node_modules/@deepseek-ai/dsh-session')), '../../..')
const req = createRequire(join(harness, 'apps/cli/package.json'))
const load = name => import(pathToFileURL(req.resolve(name)).href)
let blockedFetch = 0
const fetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    blockedFetch++; throw Error('UX02A forbids non-loopback fetch')
  }
  return fetch(input, options)
}
const { initProfile } = await load('@deepseek-ai/dsh-app-boot')
const { createLaunchEnvironmentSnapshot } = await load('@deepseek-ai/dsh-launch-environment')
const { LlmAdapter, createAssistantMessage, createUserMessage } = await load('@deepseek-ai/dsh-llm')
const { SessionId, SessionSeq, snapshotSessionEvent } = await load('@deepseek-ai/dsh-session')
const { runProfile } = await import(pathToFileURL(join(harness, 'apps/cli/lib/profile-boot.js')).href)
assert.ok(process.env.DSH_HOME.startsWith(run.paths.dshHome + '/'))
const profile = join(process.env.DSH_HOME, 'profiles', 'ux02a')
initProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@dsh-external/dsh-idea'])
mkdirSync(join(profile, 'node_modules/@dsh-external'), { recursive: true })
symlinkSync(join(repositoryRoot, 'packages/dsh-idea'), join(profile, 'node_modules/@dsh-external/dsh-idea'))

const draft = { title: 'UX02A synthetic draft', core: 'Synthetic product value, kept editable.', motivation: 'Synthetic context only.',
  currentConclusion: 'Review before saving.', possibleValue: 'Understand response stages.', useWhen: ['Controlled validation'], openQuestions: ['Next observation?'] }
const calls = []
let root
class ControlledAdapter extends LlmAdapter {
  listModels() { return Promise.resolve([{ id: 'controlled', name: 'UX02A controlled' }]) }
  async *stream(options) {
    assert.equal(options.provider, 'ux02a-offline')
    const call = { text: Promise.withResolvers(), finish: Promise.withResolvers(), aborted: false,
      cold: root.sessions.get(options.sessionId) === undefined, textSent: false, done: false }
    calls.push(call)
    options.signal?.addEventListener('abort', () => { call.aborted = true }, { once: true })
    yield { type: 'block-start', index: 0, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index: 0, text: 'Synthetic reasoning, never persisted in metrics.' }
    await call.text.promise // Deliberately release after abort to test late output.
    yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'Synthetic reasoning.' } }
    const text = JSON.stringify(draft), split = Math.floor(text.length / 2)
    call.textSent = true
    yield { type: 'block-start', index: 1, blockType: 'text' }
    yield { type: 'text-delta', index: 1, text: text.slice(0, split) }
    await call.finish.promise
    yield { type: 'text-delta', index: 1, text: text.slice(split) }
    yield { type: 'block-end', index: 1, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
    call.done = true
  }
}
// The inserted fixture uses the existing LLM service, not a replacement Host/RPC.
globalThis.__ux02aAdapter = new ControlledAdapter()
const adapterPath = runPath(run, 'build', 'ux02a-adapter.mjs')
writeFileSync(adapterPath, `export const inject=['llm'];export function apply(ctx){ctx.effect(()=>ctx.llm.registerAdapter(['ux02a-offline'],globalThis.__ux02aAdapter))}`)
const patch = runPath(run, 'build', 'ux02a.patch.json')
writeFileSync(patch, JSON.stringify([
  ...['llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'session-title-llm'].map(id => ({ id, disabled: true })),
  { id: 'agent-default-model', config: { provider: 'ux02a-offline', model: 'controlled' } },
  { id: 'dsh-idea-semantic', config: { mode: 'off' } },
  { id: 'workspace-controller', config: { documentsDirectory: run.paths.workspace } },
  { insert: [{ id: 'ux02a-model', name: pathToFileURL(adapterPath).href }] },
]))
const app = await runProfile({
  profile: 'ux02a', patchFiles: [patch], args: ['--host', '127.0.0.1', '--port', '0', '--no-open'],
  environment: createLaunchEnvironmentSnapshot([{ source: 'process', values: process.env }]),
})
root = app.ctx
const fixtures = []
let originalIdea
const stats = () => ({ calls: calls.length, aborted: calls.filter(x => x.aborted).length,
  coldCalls: calls.filter(x => x.cold).length, textSent: calls.filter(x => x.textSent).length,
  blockedFetch, new: root.ideaPreparations.performance.snapshot(), update: root.ideaPreparations.updates.performance.snapshot() })
async function command(m) {
  if (m.op === 'fixtures') {
    // Official Workspace Remote owner, no native directory picker.
    const created = await root.workspaceController.create({ path: run.paths.workspace })
    const workspace = root.workspaceRegistry.get(created.workspace.workspaceId)
    for (const size of ['short', 'long']) for (const availability of ['live', 'cold']) for (const mode of ['new', 'update']) {
      const label = `UX02A ${size} ${availability} ${mode}`, id = SessionId(`ux02a-${size}-${availability}-${mode}`)
      const session = root.sessions.prepare(id, { meta: { cwd: run.paths.workspace, delegationDepth: 0 } })
      let anchor
      for (let turn = 1; turn <= (size === 'short' ? 2 : 120); turn++) {
        session.append('turn/start', { turn }); session.append('step/start', { turn, step: 1 })
        session.append('user/message', createUserMessage({ content: [{ type: 'text', text: label + ' synthetic discussion. '.repeat(size === 'short' ? 3 : 60) }], source: { kind: 'user' } }), { surfaceOp: 'append' })
        const event = session.append('assistant/message', { turn, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: 'Synthetic finalized answer. '.repeat(size === 'short' ? 2 : 40) }], source: { provider: 'ux02a-offline', model: 'controlled' } }) }, { surfaceOp: 'append' })
        anchor = event.data.message.id
        session.append('step/end', { turn, step: 1 }); session.append('turn/end', { turn, reason: { kind: 'completed' } })
      }
      session.append('session/title', { title: label, messageSeqs: [], source: { kind: 'user' } })
      if (availability === 'cold') {
        const handle = await root.sessionPersistence.create(session.header)
        try { await handle.append(Array.from({ length: session.seq }, (_, seq) => snapshotSessionEvent(session.eventAt(SessionSeq(seq))))); await handle.flush() }
        finally { await handle.close() }
      } else { root.sessions.enter(session); root.sessions.announce(session) }
      await workspace.attachSession(id)
      fixtures.push({ label, id, anchor, size, availability, mode, events: session.seq })
    }
    const first = fixtures[0]
    const idea = await root.ideaService.create(draft, { sessionId: first.id, anchorMessageId: first.anchor, startSeq: 1, endSeq: 2,
      capturedContext: [{ role: 'user', text: 'Synthetic fixture seed.' }, { role: 'assistant', text: 'Synthetic fixture seed answer.' }] })
    originalIdea = JSON.stringify(idea)
    return { fixtures, ideaId: idea.idea.ideaId }
  }
  if (m.op === 'stats') return stats()
  if (m.op === 'release-text') { calls.at(-1).text.resolve(); return true }
  if (m.op === 'release-finish') { calls.at(-1).finish.resolve(); return true }
  if (m.op === 'source') return { live: root.sessions.get(SessionId(m.id)) !== undefined }
  if (m.op === 'unchanged') return JSON.stringify(root.ideaService.get(m.id)) === originalIdea
  if (m.op === 'stop') {
    for (const c of calls) { c.text.resolve(); c.finish.resolve() }
    return stats()
  }
  throw Error('unsupported UX02A command')
}
process.on('message', async m => {
  try { process.send({ request: m.request, value: await command(m) }) }
  catch (error) { process.send({ request: m.request, error: error.stack }) }
})
process.send({ ready: true })
