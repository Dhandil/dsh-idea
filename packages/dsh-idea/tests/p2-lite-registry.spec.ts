import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IdeaUpdateRegistry } from '../src/preparation/update-registry.ts'
import type { IdeaUpdateId, PreparedUpdate } from '../src/preparation/update-types.ts'
import { IdeaId, IdeaVersionId } from '../src/types.ts'
import { draft, sourceDraft } from './helpers/harness.ts'
import { cleanupUpdates, noNetwork } from './helpers/update.ts'

beforeEach(noNetwork); afterEach(cleanupUpdates)
const request = (key: string) => ({ requestKey: key, sessionId: 'session', messageId: 'anchor', ideaId: 'idea', expectedCurrentVersionId: 'base' })
const prepared = (): PreparedUpdate => ({
  target: { ideaId: IdeaId('idea'), currentVersionId: IdeaVersionId('base'), title: 'Host title', status: 'active' },
  currentDraft: draft(), draft: draft({ title: 'Proposed' }), source: sourceDraft(),
  sourceStats: { sessionId: 'session', anchorMessageId: 'anchor', startSeq: 1, endSeq: 2, messageCount: 2, characterCount: 20, truncated: false },
})
const result = () => ({ ideaId: IdeaId('idea'), currentVersionId: IdeaVersionId('next'), title: 'Approved', status: 'active' as const, updated: true })

describe('P2-Lite bounded Host update registry', () => {
  it('R01 same binding joins one prepare and returns detached previews; other bindings reject', async () => {
    const registry = new IdeaUpdateRegistry(), gate = Promise.withResolvers<PreparedUpdate>()
    let calls = 0
    const work = () => { calls++; return gate.promise }
    const a = registry.prepare(request('a'), work), b = registry.prepare(request('a'), work)
    expect(() => registry.prepare({ ...request('a'), ideaId: 'other' }, work)).toThrow(/different binding/)
    gate.resolve(prepared())
    const [left, right] = await Promise.all([a, b])
    expect(calls).toBe(1); expect(left).toEqual(right)
    left.draft.title = 'Caller tampering'
    expect((await registry.prepare(request('a'), work)).draft.title).toBe('Proposed')
  })

  it('R02 active prepares cannot be evicted even after TTL; full capacity rejects before work', async () => {
    let now = 0, rejectedCalls = 0
    const registry = new IdeaUpdateRegistry({ capacity: 1, ttlMs: 10, now: () => now }), gate = Promise.withResolvers<PreparedUpdate>()
    const pending = registry.prepare(request('a'), () => gate.promise)
    const expired = expect(pending).rejects.toMatchObject({ code: 'update-not-found' })
    now = 20
    expect(() => registry.prepare(request('b'), async () => { rejectedCalls++; return prepared() })).toThrow(/slots/)
    expect(rejectedCalls).toBe(0)
    gate.resolve(prepared()); await expired
    expect((await registry.prepare(request('b'), async () => prepared())).updateId).toMatch(/^upd_/)
  })

  it('R03 expiration/eviction rejects old tickets and never turns commit into a new write', async () => {
    let now = 0, writes = 0
    const registry = new IdeaUpdateRegistry({ capacity: 1, ttlMs: 10, now: () => now })
    const a = await registry.prepare(request('a'), async () => prepared())
    await registry.prepare(request('b'), async () => prepared())
    const work = async () => { writes++; return result() }
    expect(() => registry.commit(a.updateId, 'payload', work, () => false)).toThrow(/expired/)
    const c = await registry.prepare(request('c'), async () => prepared())
    now = 11
    expect(() => registry.commit(c.updateId, 'payload', work, () => false)).toThrow(/expired/)
    expect(() => registry.commit('prep_old' as IdeaUpdateId, 'payload', work, () => false)).toThrow(/expired/)
    expect(writes).toBe(0)
  })

  it('R04 committing slot is protected; same payload joins/replays a detached result, others reject', async () => {
    const registry = new IdeaUpdateRegistry({ capacity: 1 }), preview = await registry.prepare(request('a'), async () => prepared())
    const gate = Promise.withResolvers<ReturnType<typeof result>>()
    let writes = 0
    const work = async () => { writes++; return gate.promise }
    const a = registry.commit(preview.updateId, 'same', work, () => false), b = registry.commit(preview.updateId, 'same', work, () => false)
    expect(() => registry.commit(preview.updateId, 'different', work, () => false)).toThrow(/different approved draft/)
    expect(() => registry.prepare(request('b'), async () => prepared())).toThrow(/slots/)
    gate.resolve(result())
    const [left, right] = await Promise.all([a, b]); expect(writes).toBe(1); expect(left).toEqual(right)
    left.title = 'Caller mutation'
    expect((await registry.commit(preview.updateId, 'same', work, () => false)).title).toBe('Approved')
    expect(writes).toBe(1)
  })

  it('R05 known-not-written can explicitly retry the same payload; unknown outcome never rewrites', async () => {
    const registry = new IdeaUpdateRegistry(), a = await registry.prepare(request('a'), async () => prepared())
    let calls = 0
    const work = async () => { if (++calls === 1) throw Error('known'); return result() }
    await expect(registry.commit(a.updateId, 'payload', work, () => true)).rejects.toThrow('known')
    await expect(registry.commit(a.updateId, 'payload', work, () => true)).resolves.toEqual(result())
    expect(calls).toBe(2)
    const b = await registry.prepare(request('b'), async () => prepared())
    let unknownCalls = 0
    const uncertain = async () => { unknownCalls++; throw Error('uncertain') }
    await expect(registry.commit(b.updateId, 'payload', uncertain, () => false)).rejects.toMatchObject({ code: 'update-result-uncertain' })
    expect(() => registry.commit(b.updateId, 'payload', uncertain, () => false)).toThrow(/must be checked/)
    expect(unknownCalls).toBe(1)
  })

  it('R06 failed preparation is retained within the window, never implicitly regenerated', async () => {
    const registry = new IdeaUpdateRegistry(); let calls = 0
    const work = async () => { calls++; throw Error('controlled prepare failure') }
    await expect(registry.prepare(request('a'), work)).rejects.toThrow('controlled prepare failure')
    await expect(registry.prepare(request('a'), work)).rejects.toThrow('controlled prepare failure')
    expect(calls).toBe(1)
  })

  it('R07 a joining caller can abort waiting; it cannot cancel the original caller flight', async () => {
    const registry = new IdeaUpdateRegistry(), gate = Promise.withResolvers<PreparedUpdate>(), abort = new AbortController()
    const first = registry.prepare(request('a'), () => gate.promise)
    const joined = registry.prepare(request('a'), () => gate.promise, abort.signal)
    const rejected = expect(joined).rejects.toMatchObject({ code: 'request-cancelled' })
    abort.abort(); await rejected; gate.resolve(prepared())
    expect((await first).draft.title).toBe('Proposed')
  })

  it('R08 disposal invalidates tickets and late prepare cannot register a ticket', async () => {
    const registry = new IdeaUpdateRegistry(), gate = Promise.withResolvers<PreparedUpdate>()
    const a = await registry.prepare(request('a'), async () => prepared())
    const late = registry.prepare(request('b'), () => gate.promise)
    const rejected = expect(late).rejects.toMatchObject({ code: 'update-not-found' })
    registry.dispose(); gate.resolve(prepared()); await rejected
    expect(() => registry.commit(a.updateId, 'payload', async () => result(), () => false)).toThrow(/expired/)
  })
})
