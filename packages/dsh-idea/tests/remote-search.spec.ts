/**
 * The `idea.search` Remote path: scope filtering, blank-query recency,
 * positive-score-only ranking with no zero-score fill, the exact wire row
 * shape, and the Host-owned canonical reference descriptor that pins the
 * row's current version. Read-only: zero durable writes, zero model calls.
 * @module tests/remote-search.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { evolutionHarness } from './helpers/evolution.ts'
import type { EvolutionEnv } from './helpers/evolution.ts'
import { cleanup, draft, storedBytes } from './helpers/harness.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import IdeaRelatedService from '../src/related/index.ts'
import { decodeIdeaReferenceUri } from '../src/reference/uri.ts'
import { IDEA_SEARCH_RESULT_LIMIT } from '../src/search/types.ts'

afterEach(cleanup)

/** Search stack plus the mounted remote controller. */
async function searchHarness() {
  const env = await evolutionHarness()
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('search never resolves preparations') } },
  } as never)
  await env.ctx.plugin(IdeaRelatedService)
  await env.ctx.plugin(IdeaRemoteService)
  return { ...env, idea: env.ctx.idea }
}

/** One saved Idea; returns its wire-visible identity. */
const addIdea = async (env: EvolutionEnv, title: string, core = `Core of ${title}`) => {
  const created = await env.ideaService.create(draft({ title, core }), {
    sessionId: 'session-9',
    anchorMessageId: 'msg-9',
    startSeq: 1,
    endSeq: 2,
    capturedContext: [{ role: 'user', text: `seed for ${title}` }],
  })
  return { id: created.idea.ideaId, currentVersionId: created.idea.currentVersionId }
}

describe('idea.search', () => {
  it('surfaces every non-archived Idea on a blank current query', async () => {
    const env = await searchHarness()
    const one = await addIdea(env, 'One idea')
    const two = await addIdea(env, 'Two idea')

    const rows = await env.idea.search({ query: '', scope: 'current' })

    expect(rows.map(row => row.id).sort()).toEqual([one.id, two.id].sort())
    expect(rows.every(row => row.status !== 'archived')).toBe(true)
  })

  it('includes archived Ideas only under the all scope, marked archived', async () => {
    const env = await searchHarness()
    const kept = await addIdea(env, 'Kept idea')
    const gone = await addIdea(env, 'Gone idea')
    await env.ideaService.archive(gone.id, gone.currentVersionId)

    const current = await env.idea.search({ query: '', scope: 'current' })
    const all = await env.idea.search({ query: '', scope: 'all' })

    expect(current.map(row => row.id)).toEqual([kept.id])
    expect(all.map(row => row.id).sort()).toEqual([kept.id, gone.id].sort())
    expect(all.find(row => row.id === gone.id)!.status).toBe('archived')
    expect(all.find(row => row.id === kept.id)!.status).toBe('active')
  })

  it('surfaces only positive-score rows for a non-blank query, best first', async () => {
    const env = await searchHarness()
    await addIdea(env, 'Gardening notes', 'soil and seeds')
    const weak = await addIdea(env, 'Vector notes', 'soil and seeds')
    const strong = await addIdea(env, 'Vector database ranking', 'vector database storage')

    const rows = await env.idea.search({ query: 'vector database', scope: 'current' })

    expect(rows.map(row => row.id)).toEqual([strong.id, weak.id])
  })

  it('projects the exact wire row with a canonical pinned reference', async () => {
    const env = await searchHarness()
    const seeded = await addIdea(env, 'Row idea', 'row core')
    await env.ideaService.manualEdit(seeded.id, draft({
      title: 'Row idea',
      core: 'row core',
      openQuestions: ['How now?'],
    }), seeded.currentVersionId)
    const current = env.ideaService.get(seeded.id).idea.currentVersionId as string

    const [row] = await env.idea.search({ query: 'row idea', scope: 'current' })

    expect(row).toBeDefined()
    expect(Object.keys(row!).sort()).toEqual([
      'core',
      'currentConclusion',
      'currentVersionId',
      'id',
      'openQuestionsCount',
      'reference',
      'status',
      'title',
      'updatedAt',
      'useWhen',
    ])
    expect(row!.currentVersionId).toBe(current)
    expect(row!.title).toBe('Row idea')
    expect(row!.core).toBe('row core')
    expect(row!.openQuestionsCount).toBe(1)
    expect(row!.reference).toEqual({
      ideaId: seeded.id,
      versionId: current,
      label: 'Row idea',
      mention: row!.reference.mention,
    })
    expect(row!.reference.mention.startsWith(`@[Row idea](dsh-idea:`)).toBe(true)
    expect(decodeIdeaReferenceUri(
      row!.reference.mention.slice(`@[Row idea](`.length, -1),
    )).toEqual({ ideaId: seeded.id, versionId: current })
  })

  it('caps results at the explicit search limit', async () => {
    const env = await searchHarness()
    for (let index = 0; index < IDEA_SEARCH_RESULT_LIMIT + 10; index += 1) {
      await addIdea(env, `Shared token ${index}`)
    }

    const rows = await env.idea.search({ query: 'shared token', scope: 'all' })

    expect(rows).toHaveLength(IDEA_SEARCH_RESULT_LIMIT)
  })

  it('writes nothing durable and makes zero model calls', async () => {
    const env = await searchHarness()
    const seeded = await addIdea(env, 'Quiet idea')
    const before = await storedBytes(env.root, seeded.id)

    await env.idea.search({ query: '', scope: 'all' })
    await env.idea.search({ query: 'quiet', scope: 'current' })

    expect(await storedBytes(env.root, seeded.id)).toEqual(before)
    expect(env.llm.calls).toHaveLength(0)
  })
})
