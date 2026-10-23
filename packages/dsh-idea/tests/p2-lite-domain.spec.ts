import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { draft, sourceDraft, storedBytes, harness } from './helpers/harness.ts'
import { cleanupUpdates, noNetwork, recordsOf, updateHarness } from './helpers/update.ts'

beforeEach(noNetwork)
afterEach(cleanupUpdates)
const opt = { skipUnchanged: true }

describe('P2-Lite Domain opt-in evolution', () => {
  it.each([undefined, { skipUnchanged: false }])('D01 legacy identical evolution still appends with options %j', async options => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const result = await env.service.evolve(initial.idea.ideaId, draft(), sourceDraft({ sessionId: 'new-source' }), initial.idea.currentVersionId, 'continued-discussion', options)
    expect(result.versions).toHaveLength(2)
    expect(result.sourceDiscussions).toHaveLength(2)
    expect(result.evolutionEvents).toHaveLength(2)
    expect(result.versions[1]!.sourceDiscussionIds).toEqual([result.sourceDiscussions[1]!.sourceDiscussionId])
  })

  it('D02 changed opt-in writes one aggregate with one source/version/event, preserving the past', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const update = vi.spyOn(recordsOf(env.service), 'update'), put = vi.spyOn(recordsOf(env.service), 'put')
    const source = sourceDraft({ sessionId: 'ordinary-discussion', anchorMessageId: 'chosen-anchor' })
    const result = await env.service.evolve(initial.idea.ideaId, draft({ title: 'Approved update' }), source, initial.idea.currentVersionId, 'continued-discussion', opt)
    expect(update).toHaveBeenCalledTimes(1); expect(put).not.toHaveBeenCalled()
    expect(result.versions[0]).toEqual(initial.versions[0])
    expect(result.sourceDiscussions[0]).toEqual(initial.sourceDiscussions[0])
    expect(result.evolutionEvents[0]).toEqual(initial.evolutionEvents[0])
    expect(result.versions).toHaveLength(2); expect(result.sourceDiscussions).toHaveLength(2); expect(result.evolutionEvents).toHaveLength(2)
    expect(result.sourceDiscussions[1]).toMatchObject(source)
    expect(result.versions[1]!.sourceDiscussionIds).toEqual([result.sourceDiscussions[1]!.sourceDiscussionId])
    expect(result.versions[1]!.reason).toBe('continued-discussion')
  })

  it('D03 normalized no-op with a different source is zero update/put/bytes/time/metadata', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const bytes = await storedBytes(env.root, initial.idea.ideaId)
    const update = vi.spyOn(recordsOf(env.service), 'update'), put = vi.spyOn(recordsOf(env.service), 'put')
    const result = await env.service.evolve(initial.idea.ideaId, draft({ title: `  ${draft().title}  ` }), sourceDraft({ sessionId: 'different-evidence' }), initial.idea.currentVersionId, 'continued-discussion', opt)
    expect(result).toEqual(initial)
    expect(update).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled()
    expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(bytes)
    result.versions[0]!.draft.title = 'detached return mutation'
    expect(env.service.get(initial.idea.ideaId)).toEqual(initial)
  })

  it('D04 stale but identical-to-latest content conflicts before no-op with no source or update', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const latest = await env.service.manualEdit(initial.idea.ideaId, draft({ title: 'Latest' }), initial.idea.currentVersionId)
    const bytes = await storedBytes(env.root, initial.idea.ideaId), update = vi.spyOn(recordsOf(env.service), 'update')
    await expect(env.service.evolve(initial.idea.ideaId, latest.versions[1]!.draft, sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)).rejects.toMatchObject({ code: 'version-conflict' })
    expect(update).not.toHaveBeenCalled(); expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(bytes)
  })

  it('D05 source validation and archived gates are not bypassed by identical content', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    await expect(env.service.evolve(initial.idea.ideaId, draft(), sourceDraft({ capturedContext: [] }), initial.idea.currentVersionId, 'continued-discussion', opt)).rejects.toMatchObject({ code: 'invalid-input' })
    await env.service.archive(initial.idea.ideaId, initial.idea.currentVersionId)
    const update = vi.spyOn(recordsOf(env.service), 'update')
    await expect(env.service.evolve(initial.idea.ideaId, draft(), sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)).rejects.toMatchObject({ code: 'archived' })
    expect(update).not.toHaveBeenCalled()
  })

  it('D06 two same-base changed updates share the original queue; only one source commits', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
    const table = recordsOf(env.service), original = table.update.bind(table)
    const update = vi.spyOn(table, 'update').mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return original(...args) })
    const first = env.service.evolve(initial.idea.ideaId, draft({ title: 'First' }), sourceDraft({ sessionId: 'first-source' }), initial.idea.currentVersionId, 'continued-discussion', opt)
    await entered.promise
    const second = env.service.evolve(initial.idea.ideaId, draft({ title: 'Second' }), sourceDraft({ sessionId: 'second-source' }), initial.idea.currentVersionId, 'continued-discussion', opt)
    const outcomes = Promise.allSettled([first, second])
    await Promise.resolve(); expect(update).toHaveBeenCalledTimes(1)
    gate.resolve()
    const results = await outcomes
    expect(results[0]!.status).toBe('fulfilled'); expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'version-conflict' } })
    expect(update).toHaveBeenCalledTimes(1)
    const result = env.service.get(initial.idea.ideaId)
    expect(result.sourceDiscussions).toHaveLength(2); expect(result.sourceDiscussions[1]!.sessionId).toBe('first-source')
    expect(result.versions).toHaveLength(2); expect(result.evolutionEvents).toHaveLength(2)
  })

  it('D07 queued manual edit makes a matching AI draft stale, rather than a false no-op', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
    const table = recordsOf(env.service), original = table.update.bind(table)
    vi.spyOn(table, 'update').mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return original(...args) })
    const manual = env.service.manualEdit(initial.idea.ideaId, draft({ title: 'Manual wins' }), initial.idea.currentVersionId)
    await entered.promise
    const ai = env.service.evolve(initial.idea.ideaId, draft({ title: 'Manual wins' }), sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)
    const outcomes = Promise.allSettled([manual, ai]); gate.resolve()
    expect((await outcomes)[1]).toMatchObject({ status: 'rejected', reason: { code: 'version-conflict' } })
    expect(env.service.get(initial.idea.ideaId).sourceDiscussions).toHaveLength(1)
  })

  it('D08 a valid no-op does not block a subsequent same-base manual change', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const [noop, changed] = await Promise.all([
      env.service.evolve(initial.idea.ideaId, draft(), sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt),
      env.service.manualEdit(initial.idea.ideaId, draft({ title: 'After no-op' }), initial.idea.currentVersionId),
    ])
    expect(noop).toEqual(initial); expect(changed.versions).toHaveLength(2)
    expect(changed.versions[1]!.reason).toBe('manual-edit'); expect(changed.versions[1]!.sourceDiscussionIds).toEqual([])
  })

  it('D09 archive and delete admission retain their original queue/guard behavior', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const archived = env.service.archive(initial.idea.ideaId, initial.idea.currentVersionId)
    const ai = env.service.evolve(initial.idea.ideaId, draft(), sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)
    const outcomes = await Promise.allSettled([archived, ai])
    expect(outcomes[1]).toMatchObject({ status: 'rejected', reason: { code: 'archived' } })
    await env.service.restore(initial.idea.ideaId, initial.idea.currentVersionId)
    const deletion = env.service.deleteIdea(initial.idea.ideaId, initial.idea.currentVersionId)
    await expect(env.service.evolve(initial.idea.ideaId, draft(), sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)).rejects.toMatchObject({ code: 'deleting' })
    await deletion
  })

  it('D10 a controlled pre-write failure creates no orphan source and does not poison the queue', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const bytes = await storedBytes(env.root, initial.idea.ideaId)
    vi.spyOn(recordsOf(env.service), 'update').mockRejectedValueOnce(Error('controlled pre-write failure'))
    await expect(env.service.evolve(initial.idea.ideaId, draft({ title: 'Update' }), sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)).rejects.toThrow('controlled pre-write failure')
    expect(env.service.get(initial.idea.ideaId)).toEqual(initial)
    expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(bytes)
    expect((await env.service.evolve(initial.idea.ideaId, draft({ title: 'Update' }), sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)).sourceDiscussions).toHaveLength(2)
  })

  it('D11 changed content and its source survive dispose/reopen without tickets', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const result = await env.service.evolve(initial.idea.ideaId, draft({ title: 'Durable update' }), sourceDraft({ sessionId: 'durable-source' }), initial.idea.currentVersionId, 'continued-discussion', opt)
    await env.ctx.fiber.dispose()
    const reopened = await harness(env.root)
    expect(reopened.service.get(initial.idea.ideaId)).toEqual(result)
  })

  it('D12 list order remains meaningful content in the opt-in path', async () => {
    const env = await updateHarness(), original = draft({ useWhen: ['First scenario', 'Second scenario'] })
    const initial = await env.service.create(original, sourceDraft())
    const update = vi.spyOn(recordsOf(env.service), 'update')
    const result = await env.service.evolve(initial.idea.ideaId, { ...original, useWhen: [...original.useWhen].reverse() }, sourceDraft(), initial.idea.currentVersionId, 'continued-discussion', opt)
    expect(update).toHaveBeenCalledTimes(1)
    expect(result.versions[1]!.draft.useWhen).toEqual(['Second scenario', 'First scenario'])
    expect(result.sourceDiscussions).toHaveLength(2)
  })
})
