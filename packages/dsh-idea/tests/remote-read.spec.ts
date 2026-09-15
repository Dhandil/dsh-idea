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
import type { IdeaDetail, IdeaSummary } from '../src/remote-host/types.ts'

afterEach(cleanup)

/** Real storage stack, real IdeaService, plus the mounted remote controller. */
async function readHarness() {
  const env = await harness()
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('reads never resolve preparations') } },
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
  it('projects saved ideas into summaries with source linkage, newest update first', async () => {
    const env = await readHarness()
    const first = await env.service.create(draft({ title: 'First' }), sourceDraft({ sessionId: 'session-a', anchorMessageId: 'msg-a' }))
    // Distinct updatedAt: the listing order is most recently updated first.
    await new Promise(resolve => setTimeout(resolve, 5))
    const second = await env.service.create(draft({ title: 'Second' }), sourceDraft({ sessionId: 'session-b' }))

    const listed = await env.idea.list()
    expect(listed.map(row => row.id)).toEqual([second.idea.ideaId, first.idea.ideaId])
    const row: IdeaSummary = listed[1]!
    expect(row).toEqual({
      id: first.idea.ideaId,
      title: 'First',
      core: draft().core,
      motivation: draft().motivation,
      createdAt: first.idea.createdAt,
      updatedAt: first.idea.updatedAt,
      source: { sessionId: 'session-a', anchorMessageId: 'msg-a' },
    })
  })

  it('produces JSON-representable summaries with no storage record leakage', async () => {
    const env = await readHarness()
    await env.service.create(draft(), sourceDraft())
    const listed = await env.idea.list()
    expect(listed).toHaveLength(1)
    for (const row of listed) {
      expect(typeof row.id).toBe('string')
      expect(Object.keys(row).sort()).toEqual([
        'core', 'createdAt', 'id', 'motivation', 'source', 'title', 'updatedAt',
      ])
      expect(JSON.parse(JSON.stringify(row)) as unknown).toEqual(row)
    }
  })

  it('excludes archived ideas from the list while they stay readable', async () => {
    const env = await readHarness()
    const kept = await env.service.create(draft({ title: 'Kept' }), sourceDraft())
    const archived = await env.service.create(draft({ title: 'Archived' }), sourceDraft())
    await env.service.archive(archived.idea.ideaId, archived.idea.currentVersionId)

    const listed = await env.idea.list()
    expect(listed.map(row => row.id)).toEqual([kept.idea.ideaId])

    const detail = await env.idea.get({ id: archived.idea.ideaId })
    expect(detail.title).toBe('Archived')
  })

  it('never writes: list leaves every stored document byte-identical', async () => {
    const env = await readHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)
    await env.idea.list()
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
