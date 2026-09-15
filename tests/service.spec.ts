/**
 * IdeaService behavior over a real json-backed storage stack: create commits
 * v1 with its source snapshot in one durable record; listing yields one view
 * per Idea with archived filtering; evolve appends one version and one
 * snapshot with optimistic conflict protection (a stale expectation writes
 * nothing); archive keeps history; and everything survives a full dispose
 * and reopen of the same backend root.
 * @module tests/service.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
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

describe('create', () => {
  it('commits version 1 as the single durable aggregate record', async () => {
    const { root, service } = await harness()
    const aggregate = await service.create(draft(), sourceDraft())

    expect(aggregate.idea.status).toBe('active')
    expect(aggregate.versions).toHaveLength(1)
    const v1 = aggregate.versions[0]!
    expect(v1.ordinal).toBe(1)
    expect(aggregate.idea.currentVersionId).toBe(v1.versionId)
    expect(aggregate.idea.createdAt).toBeLessThanOrEqual(aggregate.idea.updatedAt)
    expect(v1.sourceDiscussionIds).toHaveLength(1)
    const discussion = aggregate.sourceDiscussions[0]!
    expect(discussion.sourceDiscussionId).toBe(v1.sourceDiscussionIds[0])
    expect(discussion.ideaId).toBe(aggregate.idea.ideaId)
    expect(discussion.sessionId).toBe('session-1')

    // The medium holds exactly one canonical record, and it parses.
    const stored = await storedAggregate(root, aggregate.idea.ideaId)
    expect(stored).toEqual(aggregate)
  })

  it('rejects invalid input before anything is persisted', async () => {
    const { root, service } = await harness()
    await expect(errorCode(() => service.create(draft({ title: '   ' }), sourceDraft())))
      .resolves.toBe('invalid-input')
    expect(await storedBytes(root, 'anything')).toBeUndefined()
    expect(service.list()).toHaveLength(0)
  })
})

describe('read and list', () => {
  it('rejects reads of unknown ideas', async () => {
    const { service } = await harness()
    expect(() => service.get(IdeaId('idea-absent'))).toThrow(IdeaError)
  })

  it('lists one current view per idea, not one row per version', async () => {
    const { service } = await harness()
    const first = await service.create(draft(), sourceDraft())
    const second = await service.create(draft({ title: 'Second idea' }), sourceDraft({ sessionId: 'session-2' }))
    await service.evolve(first.idea.ideaId, draft({ title: 'First idea v2' }), sourceDraft(), first.idea.currentVersionId)

    const views = service.list()
    expect(views).toHaveLength(2)
    const firstView = views.find(view => view.idea.ideaId === first.idea.ideaId)!
    expect(firstView.currentVersion.title).toBe('First idea v2')
    expect(firstView.currentVersion.ordinal).toBe(2)
    expect(second.idea.status).toBe('active')
  })

  it('excludes archived ideas by default and includes them on request', async () => {
    const { service } = await harness()
    const kept = await service.create(draft(), sourceDraft())
    const archived = await service.create(draft({ title: 'Archived idea' }), sourceDraft())
    await service.archive(archived.idea.ideaId, archived.idea.currentVersionId)

    expect(service.list().map(view => view.idea.ideaId)).toEqual([kept.idea.ideaId])
    const including = service.list({ includeArchived: true })
    expect(including).toHaveLength(2)
    expect(including.find(view => view.idea.ideaId === archived.idea.ideaId)?.idea.status).toBe('archived')
    // Archived is retrieval filtering, not deletion.
    expect(() => service.get(archived.idea.ideaId)).not.toThrow()
  })
})

describe('evolve', () => {
  it('appends v2 and preserves v1 unchanged in one record update', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const v1Before = structuredClone(created.versions[0])
    const before = await storedBytes(root, created.idea.ideaId)

    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'Evolved title', currentConclusion: 'Now with more evidence' }),
      sourceDraft({ sessionId: 'session-2', startSeq: 20, endSeq: 30 }),
      created.idea.currentVersionId,
    )

    expect(evolved.versions).toHaveLength(2)
    const v1 = evolved.versions[0]!
    const v2 = evolved.versions[1]!
    expect(v1).toEqual(v1Before)
    expect(v2.ordinal).toBe(2)
    expect(v2.title).toBe('Evolved title')
    expect(v2.createdAt).toBeGreaterThanOrEqual(v1.createdAt)
    expect(evolved.idea.currentVersionId).toBe(v2.versionId)
    expect(evolved.idea.ideaId).toBe(created.idea.ideaId)
    expect(evolved.sourceDiscussions).toHaveLength(2)
    expect(v2.sourceDiscussionIds).toEqual([evolved.sourceDiscussions[1]!.sourceDiscussionId])
    // One aggregate record, updated in place on the medium.
    expect(evolved).toEqual(await storedAggregate(root, created.idea.ideaId))
    expect((await storedBytes(root, created.idea.ideaId))?.equals(before ?? Buffer.alloc(0))).toBe(false)
  })

  it('rejects a stale expected version with zero writes', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
    )
    const bytesBefore = await storedBytes(root, created.idea.ideaId)

    await expect(errorCode(() => service.evolve(
      created.idea.ideaId,
      draft({ title: 'stale v3' }),
      sourceDraft(),
      created.idea.currentVersionId, // stale: v2 already superseded it
    ))).resolves.toBe('version-conflict')

    // Zero writes: the medium and the memory both still hold v2 state.
    expect((await storedBytes(root, created.idea.ideaId))?.equals(bytesBefore ?? Buffer.alloc(0))).toBe(true)
    const current = service.get(created.idea.ideaId)
    expect(current.idea.currentVersionId).toBe(evolved.idea.currentVersionId)
    expect(current.versions).toHaveLength(2)
    expect(current.versions.at(-1)?.title).toBe('v2')
  })

  it('rejects evolve of an unknown idea with idea-not-found', async () => {
    const { service } = await harness()
    await expect(errorCode(() => service.evolve(
      IdeaId('idea-absent'),
      draft(),
      sourceDraft(),
      IdeaVersionId('idea-ver-absent'),
    ))).resolves.toBe('idea-not-found')
  })
})

describe('archive', () => {
  it('archives atomically and retains the full history', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
    )

    const archived = await service.archive(created.idea.ideaId, evolved.idea.currentVersionId)

    expect(archived.idea.status).toBe('archived')
    expect(archived.versions).toEqual(evolved.versions)
    expect(archived.sourceDiscussions).toEqual(evolved.sourceDiscussions)
    expect(archived).toEqual(await storedAggregate(root, created.idea.ideaId))
    // Status change moved updatedAt; the versions' own history stands.
    expect(archived.idea.updatedAt).toBeGreaterThanOrEqual(evolved.idea.updatedAt)
  })

  it('rejects a stale expected version with zero writes', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const bytesBefore = await storedBytes(root, created.idea.ideaId)

    await expect(errorCode(() => service.archive(
      created.idea.ideaId,
      IdeaVersionId('idea-ver-stale'),
    ))).resolves.toBe('version-conflict')

    expect((await storedBytes(root, created.idea.ideaId))?.equals(bytesBefore ?? Buffer.alloc(0))).toBe(true)
    expect(service.get(created.idea.ideaId).idea.status).toBe('active')
  })
})

describe('persistence across reopen', () => {
  it('survives a full service dispose and reopen of the same root', async () => {
    const { ctx, root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft({ sessionId: 'session-2' }),
      created.idea.currentVersionId,
    )
    const second = await service.create(draft({ title: 'Second idea' }), sourceDraft())
    await service.archive(second.idea.ideaId, second.idea.currentVersionId)

    // Full teardown: drains the write chain and closes the domain and unit.
    await ctx.fiber.dispose()

    const reopened = await harness(root)
    expect(reopened.service.list()).toHaveLength(1)

    const aggregate = reopened.service.get(created.idea.ideaId)
    expect(aggregate.idea.currentVersionId).toBe(evolved.idea.currentVersionId)
    expect(aggregate.versions).toHaveLength(2)
    expect(aggregate.versions[0]).toEqual(created.versions[0])
    expect(aggregate.versions[1]).toEqual(evolved.versions[1])
    expect(aggregate.sourceDiscussions).toHaveLength(2)
    expect(aggregate.idea.status).toBe('active')

    const archivedAggregate = reopened.service.get(second.idea.ideaId)
    expect(archivedAggregate.idea.status).toBe('archived')
    expect(archivedAggregate.versions).toHaveLength(1)

    // Evolve still works on the reopened domain.
    const evolvedAgain = await reopened.service.evolve(
      created.idea.ideaId,
      draft({ title: 'v3' }),
      sourceDraft(),
      aggregate.idea.currentVersionId,
    )
    expect(evolvedAgain.versions).toHaveLength(3)
    expect(evolvedAgain.versions[2]!.ordinal).toBe(3)
    expect(evolvedAgain.idea.currentVersionId).toBe(evolvedAgain.versions[2]!.versionId)
  })
})
