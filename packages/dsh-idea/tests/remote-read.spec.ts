/**
 * The `idea` Remote read path over the real storage stack: `list` and `get`
 * project storage aggregates onto the read-only wire vocabulary, archived
 * ideas are retrieval-filtered but stay readable, unknown ids map onto
 * `idea/not-found`, and no read ever writes. No provider, network, or model
 * call — the storage backend is local json over a temp root.
 * @module tests/remote-read.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { cleanup, draft, harness, sourceDraft, storedBytes } from './helpers/harness.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import type { IdeaDetail, IdeaListRow } from '../src/remote-host/types.ts'

afterEach(cleanup)

/** Real storage stack, real IdeaService, plus the mounted remote controller. */
async function readHarness() {
  const env = await harness()
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('reads never resolve preparations') } },
  } as never)
  env.ctx.provide('ideaEvolutions', {
    prepare: () => { throw new Error('reads never prepare evolution') },
    commit: () => { throw new Error('reads never commit evolution') },
  } as never)
  env.ctx.provide('ideaRelated', {
    relatedFromMessage: () => { throw new Error('reads never judge related ideas') },
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

describe('idea.list', () => {
  it('projects saved ideas into lightweight rows, newest update first', async () => {
    const env = await readHarness()
    const first = await env.service.create(draft({ title: 'First' }), sourceDraft({ sessionId: 'session-a', anchorMessageId: 'msg-a' }))
    // Distinct updatedAt: the listing order is most recently updated first.
    await new Promise(resolve => setTimeout(resolve, 5))
    const second = await env.service.create(draft({ title: 'Second' }), sourceDraft({ sessionId: 'session-b' }))

    const listed = await env.idea.list({ view: 'current' })
    expect(listed.map(row => row.id)).toEqual([second.idea.ideaId, first.idea.ideaId])
    const row: IdeaListRow = listed[1]!
    expect(row).toEqual({
      id: first.idea.ideaId,
      status: 'active',
      currentVersionId: first.idea.currentVersionId,
      title: 'First',
      core: draft().core,
      currentConclusion: draft().currentConclusion,
      useWhen: [...draft().useWhen],
      openQuestionsCount: draft().openQuestions.length,
      updatedAt: first.idea.updatedAt,
    })
  })

  it('produces JSON-representable rows with no storage record leakage and no history or source bodies', async () => {
    const env = await readHarness()
    await env.service.create(draft(), sourceDraft())
    const listed = await env.idea.list({ view: 'current' })
    expect(listed).toHaveLength(1)
    for (const row of listed) {
      expect(typeof row.id).toBe('string')
      expect(Object.keys(row).sort()).toEqual([
        'core', 'currentConclusion', 'currentVersionId', 'id', 'openQuestionsCount', 'status', 'title', 'updatedAt', 'useWhen',
      ])
      expect(JSON.parse(JSON.stringify(row)) as unknown).toEqual(row)
    }
  })

  it('splits the views: current carries non-archived only, archived carries archived only', async () => {
    const env = await readHarness()
    const kept = await env.service.create(draft({ title: 'Kept' }), sourceDraft())
    const archived = await env.service.create(draft({ title: 'Archived' }), sourceDraft())
    await env.service.archive(archived.idea.ideaId, archived.idea.currentVersionId)

    const current = await env.idea.list({ view: 'current' })
    expect(current.map(row => row.id)).toEqual([kept.idea.ideaId])
    const archivedRows = await env.idea.list({ view: 'archived' })
    expect(archivedRows.map(row => row.id)).toEqual([archived.idea.ideaId])
    expect(archivedRows[0]!.status).toBe('archived')

    const detail = await env.idea.get({ id: archived.idea.ideaId })
    expect(detail.title).toBe('Archived')
  })

  it('never writes: list leaves every stored document byte-identical', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)
    await env.idea.list({ view: 'current' })
    await env.idea.list({ view: 'archived' })
    expect(await storedBytes(env.root, created.idea.ideaId)).toEqual(before)
  })
})

describe('idea.get', () => {
  it('returns the full current-version detail with the version identity', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft({ sessionId: 'session-1', anchorMessageId: 'msg-1' }))

    const detail: IdeaDetail = await env.idea.get({ id: created.idea.ideaId })
    expect(detail).toEqual({
      id: created.idea.ideaId,
      status: 'active',
      title: draft().title,
      core: draft().core,
      motivation: draft().motivation,
      currentConclusion: draft().currentConclusion,
      possibleValue: draft().possibleValue,
      useWhen: [...draft().useWhen],
      openQuestions: [...draft().openQuestions],
      createdAt: created.idea.createdAt,
      updatedAt: created.idea.updatedAt,
      versionId: created.idea.currentVersionId,
      source: { sessionId: 'session-1', anchorMessageId: 'msg-1' },
    })
  })

  it('maps an unknown id onto idea/not-found', async () => {
    const env = await readHarness()
    expect(await remoteCodeOf(() => env.idea.get({ id: 'idea_missing' }))).toBe('idea/not-found')
  })

  it('never writes: get leaves the stored document byte-identical', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)
    await env.idea.get({ id: created.idea.ideaId })
    expect(await storedBytes(env.root, created.idea.ideaId)).toEqual(before)
  })
})

describe('idea.getVersions and idea.getVersion', () => {
  /** One idea evolved to v2 so the history has two rows. */
  async function evolvedHarness() {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft({ sessionId: 'session-1', anchorMessageId: 'msg-1' }))
    const evolved = await env.service.evolve(
      created.idea.ideaId,
      draft({ title: 'Second version' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'manual-edit',
    )
    return { env, created, evolved }
  }

  it('lists the version history v1 first with reasons and titles', async () => {
    const { env, created, evolved } = await evolvedHarness()

    const versions = await env.idea.getVersions({ id: created.idea.ideaId })
    expect(versions).toHaveLength(2)
    expect(versions.map(row => row.ordinal)).toEqual([1, 2])
    expect(versions[0]).toEqual({
      id: created.idea.currentVersionId,
      ordinal: 1,
      reason: 'initial-save',
      title: draft().title,
      createdAt: created.versions[0]!.createdAt,
    })
    expect(versions[1]!.reason).toBe('manual-edit')
    expect(versions[1]!.title).toBe('Second version')
    expect(versions[1]!.id).toBe(evolved.idea.currentVersionId)
  })

  it('produces JSON-representable version summaries with no storage record leakage', async () => {
    const { env, created } = await evolvedHarness()
    const versions = await env.idea.getVersions({ id: created.idea.ideaId })
    for (const row of versions) {
      expect(typeof row.id).toBe('string')
      expect(Object.keys(row).sort()).toEqual(['createdAt', 'id', 'ordinal', 'reason', 'title'])
      expect(JSON.parse(JSON.stringify(row)) as unknown).toEqual(row)
    }
  })

  it('returns one version in full detail', async () => {
    const { env, created, evolved } = await evolvedHarness()
    const v2 = evolved.versions[1]!

    const detail = await env.idea.getVersion({ id: created.idea.ideaId, versionId: v2.versionId })
    expect(detail).toEqual({
      id: v2.versionId,
      ordinal: 2,
      reason: 'manual-edit',
      title: 'Second version',
      createdAt: v2.createdAt,
      core: draft({ title: 'Second version' }).core,
      motivation: draft().motivation,
      currentConclusion: draft().currentConclusion,
      possibleValue: draft().possibleValue,
      useWhen: [...draft().useWhen],
      openQuestions: [...draft().openQuestions],
    })
  })

  it('maps unknown ideas and unknown versions onto their not-found codes', async () => {
    const { env, created } = await evolvedHarness()
    expect(await remoteCodeOf(() => env.idea.getVersions({ id: 'idea_missing' }))).toBe('idea/not-found')
    expect(await remoteCodeOf(() => env.idea.getVersion({ id: 'idea_missing', versionId: 'idea_ver_x' }))).toBe('idea/not-found')
    expect(await remoteCodeOf(() => env.idea.getVersion({ id: created.idea.ideaId, versionId: 'idea_ver_absent' })))
      .toBe('idea/version-not-found')
  })

  it('never writes: version queries leave the stored document byte-identical', async () => {
    const { env, created, evolved } = await evolvedHarness()
    const before = await storedBytes(env.root, created.idea.ideaId)
    await env.idea.getVersions({ id: created.idea.ideaId })
    await env.idea.getVersion({ id: created.idea.ideaId, versionId: evolved.versions[1]!.versionId })
    expect(await storedBytes(env.root, created.idea.ideaId)).toEqual(before)
  })
})
