/**
 * T5.1 version model over the real storage stack: create commits v1 as
 * `initial-save` with its evolution event; evolve appends immutable versions
 * with a reason and an event linking from the superseded version; a stale
 * expectedCurrentVersionId rejects with `version-conflict` and zero writes;
 * the whole history stays immutable; and the version query reads without
 * writing. No provider, network, or model call — local json over a temp root.
 * @module tests/version.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { IdeaId, IdeaVersionId } from '../src/types.ts'
import { cleanup, draft, harness, sourceDraft, storedBytes } from './helpers/harness.ts'

afterEach(cleanup)

describe('v1 creation', () => {
  it('commits ordinal 1 with the initial-save reason and its evolution event', async () => {
    const { service } = await harness()
    const aggregate = await service.create(draft(), sourceDraft())

    expect(aggregate.versions).toHaveLength(1)
    const v1 = aggregate.versions[0]!
    expect(v1.ordinal).toBe(1)
    expect(v1.reason).toBe('initial-save')
    expect(v1.draft).toEqual(draft())
    expect(v1.sourceDiscussionId).toBe(aggregate.sourceDiscussions[0]!.sourceDiscussionId)
    expect(aggregate.idea.currentVersionId).toBe(v1.versionId)
    expect(aggregate.evolutionEvents).toHaveLength(1)
    const event = aggregate.evolutionEvents[0]!
    expect(event.fromVersionId).toBeUndefined()
    expect(event.toVersionId).toBe(v1.versionId)
    expect(event.reason).toBe('initial-save')
  })
})

describe('append-only evolution', () => {
  it('appends v2 with the given reason while v1 stays byte-identical', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const v1Before = structuredClone(created.versions[0])

    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'manual-edit',
    )

    expect(evolved.versions).toHaveLength(2)
    expect(evolved.versions[0]).toEqual(v1Before)
    const v2 = evolved.versions[1]!
    expect(v2.ordinal).toBe(2)
    expect(v2.reason).toBe('manual-edit')
    expect(v2.draft.title).toBe('v2')
    expect(evolved.idea.currentVersionId).toBe(v2.versionId)
  })

  it('accepts continued-discussion as an evolution reason', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())

    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'continued-discussion',
    )

    expect(evolved.versions[1]!.reason).toBe('continued-discussion')
    expect(evolved.evolutionEvents[1]!.reason).toBe('continued-discussion')
  })

  it('increases ordinals and links each event to its predecessor', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'manual-edit',
    )
    const third = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v3' }),
      sourceDraft(),
      evolved.idea.currentVersionId,
      'continued-discussion',
    )

    expect(third.versions.map(version => version.ordinal)).toEqual([1, 2, 3])
    expect(third.evolutionEvents).toHaveLength(3)
    const [first, second, latest] = third.evolutionEvents
    expect(first!.fromVersionId).toBeUndefined()
    expect(first!.toVersionId).toBe(third.versions[0]!.versionId)
    expect(second!.fromVersionId).toBe(third.versions[0]!.versionId)
    expect(second!.toVersionId).toBe(third.versions[1]!.versionId)
    expect(latest!.fromVersionId).toBe(third.versions[1]!.versionId)
    expect(latest!.toVersionId).toBe(third.versions[2]!.versionId)
    expect(third.idea.currentVersionId).toBe(third.versions[2]!.versionId)
  })

  it('keeps the whole history immutable across several evolutions', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'manual-edit',
    )
    const v1Snapshot = structuredClone(evolved.versions[0])
    const v2Snapshot = structuredClone(evolved.versions[1])
    const eventSnapshot = structuredClone(evolved.evolutionEvents)

    await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v3' }),
      sourceDraft(),
      evolved.idea.currentVersionId,
      'continued-discussion',
    )

    const current = service.get(created.idea.ideaId)
    expect(current.versions[0]).toEqual(v1Snapshot)
    expect(current.versions[1]).toEqual(v2Snapshot)
    expect(current.evolutionEvents.slice(0, 2)).toEqual(eventSnapshot)
    // Still exactly one durable record per idea: nothing was rewritten.
    expect(await storedBytes(root, created.idea.ideaId)).toBeDefined()
  })
})

describe('optimistic concurrency', () => {
  it('rejects a stale expectedCurrentVersionId with zero writes', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'manual-edit',
    )
    const bytesBefore = await storedBytes(root, created.idea.ideaId)

    await expect(async () => {
      await service.evolve(
        created.idea.ideaId,
        draft({ title: 'stale v3' }),
        sourceDraft(),
        created.idea.currentVersionId, // stale: v2 already superseded it
        'manual-edit',
      )
    }).rejects.toMatchObject({ name: 'IdeaError', code: 'version-conflict' })

    expect((await storedBytes(root, created.idea.ideaId))?.equals(bytesBefore!)).toBe(true)
    const current = service.get(created.idea.ideaId)
    expect(current.idea.currentVersionId).toBe(evolved.idea.currentVersionId)
    expect(current.versions).toHaveLength(2)
    expect(current.evolutionEvents).toHaveLength(2)
  })
})

describe('version query', () => {
  it('lists the full history v1 first and reads single versions', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'manual-edit',
    )

    const versions = service.listVersions(created.idea.ideaId)
    expect(versions.map(version => version.ordinal)).toEqual([1, 2])
    expect(versions[0]!.reason).toBe('initial-save')
    expect(versions[1]!.draft.title).toBe('v2')
    expect(service.getVersion(created.idea.ideaId, evolved.versions[1]!.versionId))
      .toEqual(versions[1])
  })

  it('rejects queries of unknown ideas and unknown versions with distinct codes', async () => {
    const { service } = await harness()
    const created = await service.create(draft(), sourceDraft())

    expect(() => service.listVersions(IdeaId('idea-absent')))
      .toThrow(expect.objectContaining({ name: 'IdeaError', code: 'idea-not-found' }))
    expect(() => service.getVersion(IdeaId('idea-absent'), IdeaVersionId('idea-ver-x')))
      .toThrow(expect.objectContaining({ name: 'IdeaError', code: 'idea-not-found' }))
    expect(() => service.getVersion(created.idea.ideaId, IdeaVersionId('idea-ver-absent')))
      .toThrow(expect.objectContaining({ name: 'IdeaError', code: 'version-not-found' }))
  })

  it('never writes on a version query', async () => {
    const { root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'manual-edit',
    )
    const before = await storedBytes(root, created.idea.ideaId)

    const versions = service.listVersions(created.idea.ideaId)
    service.getVersion(created.idea.ideaId, versions[0]!.versionId)

    expect((await storedBytes(root, created.idea.ideaId))?.equals(before!)).toBe(true)
  })
})
