/**
 * The T8 lifecycle verbs of the `idea` Remote namespace over the real
 * storage stack: the two library views partition cleanly with zero writes;
 * `manualEdit` validates the draft on the wire boundary and returns the
 * canonical current version plus whether a change was committed (a no-op is
 * `committed: false` with zero durable writes); archive/restore flip the
 * status and map domain failures onto the wire vocabulary; `deleteIdea`
 * removes the idea and its bindings for good, a stale expectation fails
 * with zero delete work, and a repeated delete is `idea/not-found`. No
 * provider, network, or model call.
 * @module tests/remote-lifecycle.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { cleanup, draft, harness, sourceDraft, storedBytes } from './helpers/harness.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import type { IdeaListRow, IdeaManualEditResult } from '../src/remote-host/types.ts'
import { IdeaVersionId } from '../src/types.ts'

afterEach(cleanup)

/** Real storage stack, real IdeaService, plus the mounted remote controller. */
async function readHarness() {
  const env = await harness()
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('lifecycle tests never resolve preparations') } },
  } as never)
  env.ctx.provide('ideaEvolutions', {
    prepare: () => { throw new Error('lifecycle tests never prepare evolution') },
    commit: () => { throw new Error('lifecycle tests never commit evolution') },
  } as never)
  env.ctx.provide('ideaRelated', {
    relatedFromMessage: () => { throw new Error('lifecycle tests never judge related ideas') },
  } as never)
  await env.ctx.plugin(IdeaRemoteService)
  return { ...env, idea: env.ctx.idea }
}

/** The stable code of the RemoteError a call rejects with. */
const remoteCodeOf = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run()
  } catch (error) {
    return remoteErrorOf(error)?.code
  }
  throw new Error('expected the call to reject with a RemoteError')
}

describe('idea.list views', () => {
  it('partitions active, dormant, and archived ideas across the two views', async () => {
    const env = await readHarness()
    const active = await env.service.create(draft({ title: 'Active' }), sourceDraft())
    const dormant = await env.service.create(draft({ title: 'Dormant' }), sourceDraft({ sessionId: 'session-2' }))
    const archived = await env.service.create(draft({ title: 'Archived' }), sourceDraft({ sessionId: 'session-3' }))
    await env.service.archive(archived.idea.ideaId, archived.idea.currentVersionId)

    const current = await env.idea.list({ view: 'current' })
    expect(current.map(row => row.id).sort()).toEqual([active.idea.ideaId, dormant.idea.ideaId].sort())
    expect(current.every(row => row.status !== 'archived')).toBe(true)

    const archivedRows = await env.idea.list({ view: 'archived' })
    expect(archivedRows.map(row => row.id)).toEqual([archived.idea.ideaId])
    expect(archivedRows[0]!.status).toBe('archived')
  })

  it('never writes: listing either view leaves every stored document byte-identical', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)
    await env.idea.list({ view: 'current' })
    await env.idea.list({ view: 'archived' })
    expect(await storedBytes(env.root, created.idea.ideaId)).toEqual(before)
  })
})

describe('idea.manualEdit', () => {
  it('commits the edit as one new version and reports it as committed', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())

    const result: IdeaManualEditResult = await env.idea.manualEdit({
      id: created.idea.ideaId,
      expectedCurrentVersionId: created.idea.currentVersionId,
      draft: draft({ title: 'Wire-edited title' }),
    })
    expect(result).toEqual({
      ideaId: created.idea.ideaId,
      currentVersionId: expect.any(String),
      ordinal: 2,
      title: 'Wire-edited title',
      status: 'active',
      committed: true,
    })
    expect(result.currentVersionId).not.toBe(created.idea.currentVersionId)

    // The canonical state is visible through the read path.
    const rows = await env.idea.list({ view: 'current' })
    expect(rows[0]!.title).toBe('Wire-edited title')
    expect(rows[0]!.currentVersionId).toBe(result.currentVersionId)

    const aggregate = env.service.get(created.idea.ideaId)
    expect(aggregate.versions).toHaveLength(2)
    expect(aggregate.versions.at(-1)!.reason).toBe('manual-edit')
    expect(aggregate.versions.at(-1)!.sourceDiscussionIds).toEqual([])
    // No fabricated source snapshot.
    expect(aggregate.sourceDiscussions).toHaveLength(1)
  })

  it('reports a normalized no-op as uncommitted with zero durable writes', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)

    const result = await env.idea.manualEdit({
      id: created.idea.ideaId,
      expectedCurrentVersionId: created.idea.currentVersionId,
      draft: draft({ title: `  ${draft().title}  ` }),
    })
    expect(result).toEqual({
      ideaId: created.idea.ideaId,
      currentVersionId: created.idea.currentVersionId,
      ordinal: 1,
      title: draft().title,
      status: 'active',
      committed: false,
    })
    expect(await storedBytes(env.root, created.idea.ideaId)).toEqual(before)
  })

  it('maps a stale expectation onto idea/version-conflict', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    expect(await remoteCodeOf(() => env.idea.manualEdit({
      id: created.idea.ideaId,
      expectedCurrentVersionId: IdeaVersionId('idea_ver_stale'),
      draft: draft({ title: 'Too late' }),
    }))).toBe('idea/version-conflict')
  })

  it('maps an archived idea onto idea/archived', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    await env.service.archive(created.idea.ideaId, created.idea.currentVersionId)

    expect(await remoteCodeOf(() => env.idea.manualEdit({
      id: created.idea.ideaId,
      expectedCurrentVersionId: created.idea.currentVersionId,
      draft: draft({ title: 'Edited while archived' }),
    }))).toBe('idea/archived')
  })

  it('rejects an invalid draft with idea/invalid-draft before any domain call', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)

    expect(await remoteCodeOf(() => env.idea.manualEdit({
      id: created.idea.ideaId,
      expectedCurrentVersionId: created.idea.currentVersionId,
      draft: draft({ title: '   ' }),
    }))).toBe('idea/invalid-draft')
    expect(await storedBytes(env.root, created.idea.ideaId)).toEqual(before)
  })
})

describe('idea.archive and idea.restore', () => {
  it('archives at the expected version, preserves the version identity, and moves the row between views', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())

    const result = await env.idea.archive({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })
    expect(result).toEqual({
      ideaId: created.idea.ideaId,
      currentVersionId: created.idea.currentVersionId,
      status: 'archived',
      updatedAt: expect.any(Number),
    })

    expect((await env.idea.list({ view: 'current' }))).toHaveLength(0)
    const archivedRows = await env.idea.list({ view: 'archived' })
    expect(archivedRows.map(row => row.id)).toEqual([created.idea.ideaId])

    const aggregate = env.service.get(created.idea.ideaId)
    expect(aggregate.versions).toHaveLength(1)
    expect(aggregate.evolutionEvents).toHaveLength(1)
  })

  it('is idempotent at the expected version with zero durable writes', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    await env.idea.archive({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })
    const before = await storedBytes(env.root, created.idea.ideaId)

    const again = await env.idea.archive({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })
    expect(again.status).toBe('archived')
    expect(await storedBytes(env.root, created.idea.ideaId)).toEqual(before)
  })

  it('maps a stale expectation onto idea/version-conflict and an unknown id onto idea/not-found', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    expect(await remoteCodeOf(() => env.idea.archive({ id: created.idea.ideaId, expectedCurrentVersionId: IdeaVersionId('idea_ver_stale') })))
      .toBe('idea/version-conflict')
    expect(await remoteCodeOf(() => env.idea.archive({ id: 'idea_missing', expectedCurrentVersionId: IdeaVersionId('idea_ver_x') })))
      .toBe('idea/not-found')
  })

  it('restores an archived idea to active and lands it back in the current view', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    await env.idea.archive({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })

    const restored = await env.idea.restore({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })
    expect(restored.status).toBe('active')

    const current = await env.idea.list({ view: 'current' })
    expect(current.map(row => row.id)).toEqual([created.idea.ideaId])
    expect(await env.idea.list({ view: 'archived' })).toHaveLength(0)
  })

  it('produces JSON-representable lifecycle results with no storage leakage', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const result = await env.idea.archive({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })
    expect(Object.keys(result).sort()).toEqual(['currentVersionId', 'ideaId', 'status', 'updatedAt'])
    expect(JSON.parse(JSON.stringify(result)) as unknown).toEqual(result)
  })
})

describe('idea.deleteIdea', () => {
  it('removes the idea and its discussion bindings for good', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const discussion = await env.service.continueDiscussion(created.idea.ideaId, async () => 'session-continue')

    const result = await env.idea.deleteIdea({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })
    expect(result).toEqual({ ideaId: created.idea.ideaId })

    expect(await remoteCodeOf(() => env.idea.get({ id: created.idea.ideaId }))).toBe('idea/not-found')
    expect(await env.idea.list({ view: 'current' })).toHaveLength(0)
    expect(await storedBytes(env.root, created.idea.ideaId)).toBeUndefined()
    expect(() => env.service.getDiscussion(discussion.discussionId)).toThrow()
  })

  it('fails a stale expectation with zero delete work', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())

    expect(await remoteCodeOf(() => env.idea.deleteIdea({ id: created.idea.ideaId, expectedCurrentVersionId: IdeaVersionId('idea_ver_stale') })))
      .toBe('idea/version-conflict')
    // Nothing destructive happened: the idea is still fully readable.
    await expect(env.idea.get({ id: created.idea.ideaId })).resolves.toMatchObject({ id: created.idea.ideaId })
  })

  it('maps a repeated delete onto idea/not-found', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    await env.idea.deleteIdea({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })

    expect(await remoteCodeOf(() => env.idea.deleteIdea({ id: created.idea.ideaId, expectedCurrentVersionId: created.idea.currentVersionId })))
      .toBe('idea/not-found')
  })

  it('never exposes a raw storage record through any lifecycle result', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const rows: IdeaListRow[] = await env.idea.list({ view: 'current' })
    for (const row of rows) {
      expect(JSON.parse(JSON.stringify(row)) as unknown).toEqual(row)
      expect(Object.keys(row)).not.toContain('versions')
      expect(Object.keys(row)).not.toContain('sourceDiscussions')
      expect(Object.keys(row)).not.toContain('evolutionEvents')
    }
    const edited = await env.idea.manualEdit({
      id: created.idea.ideaId,
      expectedCurrentVersionId: created.idea.currentVersionId,
      draft: draft({ title: 'Projection check' }),
    })
    expect(Object.keys(edited).sort()).toEqual(['committed', 'currentVersionId', 'ideaId', 'ordinal', 'status', 'title'])
    expect(JSON.parse(JSON.stringify(edited)) as unknown).toEqual(edited)
  })
})
