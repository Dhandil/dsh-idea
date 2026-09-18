/**
 * The T8 lifecycle verbs of IdeaService over the real json-backed storage
 * stack: `manualEdit` appends exactly one `manual-edit` version (no source
 * snapshot, one event) and treats a normalized no-op as zero writes;
 * archive/restore flip only the status (no version, no event) and are
 * idempotent at the expected version; archived ideas stay readable but
 * reject every mutation except restore and delete; `deleteIdea` removes the
 * aggregate and its discussion bindings — nothing else — behind a
 * process-local guard, with the expected-version check preceding any
 * destructive work. No provider, network, or model call.
 * @module tests/lifecycle.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdeaError } from '../src/errors.ts'
import { IdeaId, IdeaVersionId } from '../src/types.ts'
import { cleanup, draft, harness, sourceDraft, storedAggregate, storedBytes } from './helpers/harness.ts'

afterEach(cleanup)

const errorCode = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run()
  } catch (error) {
    if (error instanceof IdeaError) return error.code
    throw error
  }
  throw new Error('expected the operation to reject')
}

describe('manualEdit', () => {
  it('appends exactly one manual-edit version with no fabricated source', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const v1Before = structuredClone(created.versions[0])
    const sourcesBefore = structuredClone(created.sourceDiscussions)
    const eventsBefore = structuredClone(created.evolutionEvents)

    const edited = await service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Hand-tuned title', currentConclusion: 'Conclusion updated by hand' }),
      created.idea.currentVersionId,
    )

    expect(edited.versions).toHaveLength(2)
    const v2 = edited.versions.at(-1)!
    expect(edited.versions[0]).toEqual(v1Before)
    expect(v2.ordinal).toBe(2)
    expect(v2.reason).toBe('manual-edit')
    expect(v2.draft.title).toBe('Hand-tuned title')
    // No system metadata: the seven draft fields carry the whole edit.
    expect(v2.sourceDiscussionIds).toEqual([])
    expect(edited.sourceDiscussions).toEqual(sourcesBefore)
    expect(edited.evolutionEvents).toHaveLength(eventsBefore.length + 1)
    const event = edited.evolutionEvents.at(-1)!
    expect(event.fromVersionId).toBe(created.idea.currentVersionId)
    expect(event.toVersionId).toBe(v2.versionId)
    expect(event.reason).toBe('manual-edit')
    expect(edited.idea.currentVersionId).toBe(v2.versionId)
    expect(edited.idea.updatedAt).toBe(v2.createdAt)
  })

  it('rejects a stale expected version with zero writes', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const before = await storedBytes(root, created.idea.ideaId)

    await expect(errorCode(() => service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Too late' }),
      IdeaVersionId('idea_ver_stale'),
    ))).resolves.toBe('version-conflict')

    expect(await storedBytes(root, created.idea.ideaId)).toEqual(before)
  })

  it('treats a normalized no-op as zero durable writes and keeps updatedAt', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const before = await storedBytes(root, created.idea.ideaId)

    // Same content with padding and duplicate-shaped list entries:
    // normalization collapses it onto the current version.
    const noop = await service.manualEdit(
      created.idea.ideaId,
      draft({
        title: `  ${draft().title}  `,
        useWhen: [...draft().useWhen],
        openQuestions: [...draft().openQuestions],
      }),
      created.idea.currentVersionId,
    )

    expect(noop.idea.currentVersionId).toBe(created.idea.currentVersionId)
    expect(noop.versions).toHaveLength(1)
    expect(noop.idea.updatedAt).toBe(created.idea.updatedAt)
    expect(await storedBytes(root, created.idea.ideaId)).toEqual(before)
  })

  it('rejects an archived idea', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.archive(created.idea.ideaId, created.idea.currentVersionId)

    await expect(errorCode(() => service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Edited while archived' }),
      created.idea.currentVersionId,
    ))).resolves.toBe('archived')
  })

  it('survives a full dispose and reopen of the same root', async () => {
    const { ctx, root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const edited = await service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Durable edit' }),
      created.idea.currentVersionId,
    )
    await ctx.fiber.dispose()

    const reopened = await harness(root)
    const aggregate = reopened.service.get(created.idea.ideaId)
    expect(aggregate.idea.currentVersionId).toBe(edited.idea.currentVersionId)
    expect(aggregate.versions.at(-1)!.reason).toBe('manual-edit')
    expect(aggregate.versions.at(-1)!.draft.title).toBe('Durable edit')
  })
})

describe('archive and restore', () => {
  it('archive flips the status only: no version, no event, content untouched', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const versionsBefore = structuredClone(created.versions)
    const eventsBefore = structuredClone(created.evolutionEvents)

    const archived = await service.archive(created.idea.ideaId, created.idea.currentVersionId)

    expect(archived.idea.status).toBe('archived')
    expect(archived.versions).toEqual(versionsBefore)
    expect(archived.evolutionEvents).toEqual(eventsBefore)
    expect(archived.idea.updatedAt).toBeGreaterThan(created.idea.createdAt)
    // Retrieval filtering, not deletion: still readable, still listed on request.
    expect(() => service.get(created.idea.ideaId)).not.toThrow()
    expect(service.list().map(view => view.idea.ideaId)).not.toContain(created.idea.ideaId)
    expect(service.list({ includeArchived: true })).toHaveLength(1)
    expect(service.listVersions(created.idea.ideaId)).toHaveLength(1)
  })

  it('archiving twice at the same version is an idempotent zero-write', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.archive(created.idea.ideaId, created.idea.currentVersionId)
    const before = await storedBytes(root, created.idea.ideaId)

    const again = await service.archive(created.idea.ideaId, created.idea.currentVersionId)
    expect(again.idea.status).toBe('archived')
    expect(await storedBytes(root, created.idea.ideaId)).toEqual(before)
  })

  it('a stale archive expectation writes nothing', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const before = await storedBytes(root, created.idea.ideaId)

    await expect(errorCode(() => service.archive(created.idea.ideaId, IdeaVersionId('idea_ver_stale'))))
      .resolves.toBe('version-conflict')
    expect(await storedBytes(root, created.idea.ideaId)).toEqual(before)
  })

  it('restore flips an archived idea back to active and is idempotent when active', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.archive(created.idea.ideaId, created.idea.currentVersionId)

    const restored = await service.restore(created.idea.ideaId, created.idea.currentVersionId)
    expect(restored.idea.status).toBe('active')
    expect(service.list().map(view => view.idea.ideaId)).toEqual([created.idea.ideaId])

    const before = await storedBytes(root, created.idea.ideaId)
    const again = await service.restore(created.idea.ideaId, created.idea.currentVersionId)
    expect(again.idea.status).toBe('active')
    expect(await storedBytes(root, created.idea.ideaId)).toEqual(before)
  })
})

describe('archived behavior', () => {
  async function archivedHarness() {
    const env = await harness()
    const created = await env.service.create(draft(), sourceDraft())
    await env.service.archive(created.idea.ideaId, created.idea.currentVersionId)
    return { ...env, created }
  }

  it('rejects continueDiscussion, evolve, and manualEdit while reads stay intact', async () => {
    const { service, created } = await archivedHarness()

    await expect(errorCode(() => service.continueDiscussion(created.idea.ideaId, async () => 'session-x')))
      .resolves.toBe('archived')
    await expect(errorCode(() => service.evolve(
      created.idea.ideaId,
      draft({ title: 'Evolved while archived' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'continued-discussion',
    ))).resolves.toBe('archived')
    await expect(errorCode(() => service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Edited while archived' }),
      created.idea.currentVersionId,
    ))).resolves.toBe('archived')

    expect(() => service.getVersion(created.idea.ideaId, created.idea.currentVersionId)).not.toThrow()
  })
})

describe('deleteIdea', () => {
  it('removes the aggregate and its own discussion bindings, nothing else', async () => {
    const { service } = await harness()
    const victim = await service.create(draft(), sourceDraft())
    const survivor = await service.create(draft({ title: 'Survivor' }), sourceDraft({ sessionId: 'session-2' }))
    const victimDiscussion = await service.continueDiscussion(victim.idea.ideaId, async () => 'session-victim')
    const survivorDiscussion = await service.continueDiscussion(survivor.idea.ideaId, async () => 'session-survivor')

    await service.deleteIdea(victim.idea.ideaId, victim.idea.currentVersionId)

    expect(() => service.get(victim.idea.ideaId)).toThrow(IdeaError)
    expect(() => service.listVersions(victim.idea.ideaId)).toThrow(IdeaError)
    expect(() => service.getDiscussion(victimDiscussion.discussionId)).toThrow(IdeaError)
    // The survivor keeps its aggregate and its own binding.
    expect(service.get(survivor.idea.ideaId).idea.ideaId).toBe(survivor.idea.ideaId)
    expect(service.getDiscussion(survivorDiscussion.discussionId).conversationId).toBe('session-survivor')
  })

  it('works on archived ideas and leaves no tombstone', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.archive(created.idea.ideaId, created.idea.currentVersionId)

    await service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)
    expect(await storedAggregate(root, created.idea.ideaId)).toBeUndefined()
    expect(service.list({ includeArchived: true })).toHaveLength(0)
  })

  it('a stale expected version deletes nothing', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.continueDiscussion(created.idea.ideaId, async () => 'session-x')

    await expect(errorCode(() => service.deleteIdea(created.idea.ideaId, IdeaVersionId('idea_ver_stale'))))
      .resolves.toBe('version-conflict')
    // Nothing destructive happened.
    expect(() => service.get(created.idea.ideaId)).not.toThrow()
    expect(service.list()).toHaveLength(1)
  })

  it('a repeated delete reports not-found', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)

    await expect(errorCode(() => service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)))
      .resolves.toBe('idea-not-found')
  })

  it('rejects a competing mutation while the delete is in flight, then releases the guard', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.continueDiscussion(created.idea.ideaId, async () => 'session-before')

    // The guard is taken synchronously before the delete's first await, so
    // every mutation invoked in the same synchronous block sees it — each is
    // rejected with `deleting`, never partially applied.
    const inFlight = service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)
    const racing = await Promise.all([
      service.manualEdit(created.idea.ideaId, draft({ title: 'Racing edit' }), created.idea.currentVersionId),
      service.archive(created.idea.ideaId, created.idea.currentVersionId),
      service.restore(created.idea.ideaId, created.idea.currentVersionId),
      service.evolve(created.idea.ideaId, draft({ title: 'Racing evolve' }), sourceDraft(), created.idea.currentVersionId, 'continued-discussion'),
      service.continueDiscussion(created.idea.ideaId, async () => 'session-racing'),
    ].map(async run => {
      try {
        await run
        return 'no-rejection'
      } catch (error) {
        return error instanceof IdeaError ? error.code : 'other-error'
      }
    }))
    expect(racing).toEqual(['deleting', 'deleting', 'deleting', 'deleting', 'deleting'])

    await inFlight
    // The idea is gone and the guard released in the finally: the next
    // competing mutation is simply not-found.
    expect(() => service.get(created.idea.ideaId)).toThrow(IdeaError)
    await expect(errorCode(() => service.manualEdit(created.idea.ideaId, draft(), created.idea.currentVersionId)))
      .resolves.toBe('idea-not-found')
  })

  it('deleteIdea of an absent idea reports not-found', async () => {
    const { service } = await harness()
    await expect(errorCode(() => service.deleteIdea(IdeaId('idea_absent'), IdeaVersionId('idea_ver_x'))))
      .resolves.toBe('idea-not-found')
  })

  it('a forced storage delete failure rejects, never reports success, and releases the guard for a retry', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.continueDiscussion(created.idea.ideaId, async () => 'session-x')

    // Inject one discussion-store delete failure through the instance's
    // table handle; production code is untouched.
    const tables = service as unknown as { workspaces: { delete: (id: string) => Promise<void> } }
    const spy = vi.spyOn(tables.workspaces, 'delete').mockRejectedValueOnce(new Error('forced storage failure'))

    await expect(service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId))
      .rejects.toThrow('forced storage failure')

    // The failure surfaced instead of a success return and the idea survives
    // intact; the finally released the guard, so the retry completes.
    expect(() => service.get(created.idea.ideaId)).not.toThrow()
    expect(service.list({ includeArchived: true })).toHaveLength(1)
    spy.mockRestore()
    await service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)
    expect(() => service.get(created.idea.ideaId)).toThrow(IdeaError)
  })
})

describe('per-idea mutation serialization', () => {
  it('a continue admitted before a delete settles first: delete removes the new binding, no orphan (R1)', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())

    let reachedConversation!: () => void
    const atConversation = new Promise<void>(resolve => { reachedConversation = resolve })
    let releaseConversation!: () => void
    const conversationGate = new Promise<void>(resolve => { releaseConversation = resolve })

    // Continue is admitted first and parks at the Host createConversation
    // seam while holding its queue slot.
    const started = service.continueDiscussion(created.idea.ideaId, async () => {
      reachedConversation()
      await conversationGate
      return 'conversation-race'
    })
    await atConversation

    const deletion = service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)
    let deleteSettled = false
    void deletion.then(() => { deleteSettled = true }, () => { deleteSettled = true })
    for (let tick = 0; tick < 5; tick++) await Promise.resolve()
    expect(deleteSettled).toBe(false)

    // A third mutation arriving after delete admission is rejected, not queued.
    await expect(errorCode(() => service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Too late' }),
      created.idea.currentVersionId,
    ))).resolves.toBe('deleting')

    releaseConversation()
    const discussion = await started
    expect(discussion.conversationId).toBe('conversation-race')
    await deletion

    // Both succeeded, and the delete accounted for the binding created in
    // the continue's turn: no orphan IdeaDiscussion can resurface context.
    expect(() => service.get(created.idea.ideaId)).toThrow(IdeaError)
    expect(service.list({ includeArchived: true })).toHaveLength(0)
    expect(service.findDiscussionByConversationId('conversation-race')).toBeUndefined()
  })

  it('a stale delete after an admitted manual edit conflicts instead of erasing v2 (R2)', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())

    // Gate the record update so the un-serialized implementation would let
    // the delete read the pre-edit version and pass its expectation.
    const tables = service as unknown as {
      records: { update: (id: IdeaId, transform: (current: unknown) => unknown) => Promise<unknown> }
    }
    const originalUpdate = tables.records.update.bind(tables.records)
    let releaseEdit!: () => void
    const editGate = new Promise<void>(resolve => { releaseEdit = resolve })
    const spy = vi.spyOn(tables.records, 'update')
      .mockImplementation(async (id, transform) => {
        await editGate
        return originalUpdate(id, transform)
      })

    const edit = service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Committed v2' }),
      created.idea.currentVersionId,
    )
    const deletion = service.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)

    releaseEdit()
    await edit
    await expect(errorCode(() => deletion)).resolves.toBe('version-conflict')

    // The v2 edit survives: zero discussion cleanup, zero aggregate delete.
    expect(service.get(created.idea.ideaId).idea.currentVersionId).not.toBe(created.idea.currentVersionId)
    expect(service.listVersions(created.idea.ideaId)).toHaveLength(2)
    spy.mockRestore()
  })

  it('one rejected mutation does not poison the idea queue (R4)', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())

    await expect(errorCode(() => service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'Too late' }),
      IdeaVersionId('idea_ver_stale'),
    ))).resolves.toBe('version-conflict')

    const edited = await service.manualEdit(
      created.idea.ideaId,
      draft({ title: 'After failure' }),
      created.idea.currentVersionId,
    )
    expect(edited.versions).toHaveLength(2)
    expect(edited.versions.at(-1)!.draft.title).toBe('After failure')
  })

  it('a slow mutation on one idea never blocks another idea (R6)', async () => {
    const { service } = await harness()
    const first = await service.create(draft(), sourceDraft())
    const second = await service.create(draft({ title: 'Independent' }), sourceDraft({ sessionId: 'session-2' }))

    let reachedA!: () => void
    const atA = new Promise<void>(resolve => { reachedA = resolve })
    let releaseA!: () => void
    const gateA = new Promise<void>(resolve => { releaseA = resolve })

    const slowA = service.continueDiscussion(first.idea.ideaId, async () => {
      reachedA()
      await gateA
      return 'conversation-slow'
    })
    await atA

    // While idea A's queue slot is parked at the Host seam, idea B's
    // mutation completes immediately.
    const edited = await service.manualEdit(
      second.idea.ideaId,
      draft({ title: 'B edited' }),
      second.idea.currentVersionId,
    )
    expect(edited.versions).toHaveLength(2)

    releaseA()
    const discussion = await slowA
    expect(discussion.conversationId).toBe('conversation-slow')
  })
})
