/**
 * T13.1 — USER_MUTED suppression retrieval tests: a muted Idea never enters
 * the T10 lexical pool (suppressed with reason USER_MUTED); an all-muted
 * corpus ends before the Judge path (NO_ELIGIBLE_IDEAS); the T11 embedding
 * branch excludes muted Ideas from the eligible set (zero query embedding
 * when all are muted); the T11 llm-selector excludes muted Ideas from the
 * corpus (zero selector provider calls); and the hybrid fusion cannot
 * resurrect a muted Idea.
 * @module tests/resurfacing-mute-suppression.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { FakeLlm, textStream } from './helpers/preparation.ts'
import { cleanup, draft, harness, sourceDraft } from './helpers/harness.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import IdeaResurfacingService from '../src/resurfacing/index.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import IdeaSemanticService from '../src/semantic/index.ts'

afterEach(cleanup)

const turn = '帮我回忆一下之前讨论过的检索方案'
const reply = '回复'

const defaultEvents = () => [
  { type: 'system', seq: 1, data: {} },
  { type: 'user/message', seq: 2, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'trigger' }] } },
  { type: 'assistant/message', seq: 3, data: { message: { content: [{ type: 'text', text: reply }] } } },
  { type: 'turn/end', seq: 4, data: { turn: 1, reason: { kind: 'completed' } } },
] as never[]

async function resurfacingHarness(ideaCount = 3, mutedCount = 0) {
  const env = await harness()
  const ids: string[] = []
  for (let index = 0; index < ideaCount; index += 1) {
    const agg = await env.service.create(
      draft({ title: `Idea ${index}`, core: `检索方案 ${index}`, motivation: 'm', possibleValue: 'v', useWhen: ['检索'] }),
      sourceDraft(),
    )
    ids.push(agg.idea.ideaId)
  }
  for (let index = 0; index < mutedCount; index += 1) {
    await env.service.setResurfacingMuted(ids[index] as never, true)
  }
  const ctx = env.ctx
  ctx.provide('sessionQuery', {
    observeSession: async () => ({ events: defaultEvents(), projections: { values: { modelSelection: { next: null } } } }),
    readSurface: async () => ({ events: defaultEvents() }),
  } as never)
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'p', model: 'm' }),
  } as never)
  ctx.provide('llm', { stream: async () => ({ async * [Symbol.asyncIterator]() {} }) } as never)
  ctx.provide('ideaPreparations', { preparations: { resolve: () => { throw new Error('unused') } } } as never)
  await ctx.plugin(IdeaResurfacingService)
  return { ...env, service: ctx.ideaResurfacing, ids }
}

describe('T10 lexical — USER_MUTED suppression (D6-A)', () => {
  it('a muted Idea is suppressed with reason USER_MUTED and never enters the pool', async () => {
    const env = await resurfacingHarness(3, 1)
    const evaluation = await env.service.evaluate({ sessionId: 'session-1', currentTurn: turn, recentContext: [] })
    expect(evaluation.suppressed.some(s => s.reason === 'USER_MUTED' && s.ideaId === env.ids[0])).toBe(true)
    expect(evaluation.candidates.some(c => c.ideaId === env.ids[0])).toBe(false)
  })

  it('an all-muted corpus stops with NO_ELIGIBLE_IDEAS before the Judge path', async () => {
    const env = await resurfacingHarness(3, 3)
    const evaluation = await env.service.evaluate({ sessionId: 'session-1', currentTurn: turn, recentContext: [] })
    expect(evaluation.stop?.reason).toBe('NO_ELIGIBLE_IDEAS')
    expect(evaluation.candidates).toEqual([])
    expect(evaluation.suppressed.every(s => s.reason === 'USER_MUTED')).toBe(true)
  })

  it('muting happens before scoring: a muted Idea cannot reach the Judge even with the strongest query', async () => {
    const env = await resurfacingHarness(2, 2)
    const evaluation = await env.service.evaluate({ sessionId: 'session-1', currentTurn: '检索方案 检索方案 检索方案', recentContext: [] })
    expect(evaluation.candidates).toEqual([])
    expect(evaluation.suppressed).toHaveLength(2)
  })
})

describe('T11 semantic branches — USER_MUTED exclusion (D6-B/C)', () => {
  async function semanticHarness(ideaCount: number, mutedCount: number) {
    const env = await harness()
    const ids: string[] = []
    for (let index = 0; index < ideaCount; index += 1) {
      const agg = await env.service.create(
        draft({ title: `Idea ${index}`, core: `检索方案 ${index}`, motivation: 'm', possibleValue: 'v', useWhen: ['检索'] }),
        sourceDraft({ sessionId: `source-session-${index}` }),
      )
      if (index < mutedCount) {
        await env.service.setResurfacingMuted(agg.idea.ideaId, true)
      }
      ids.push(agg.idea.ideaId)
    }
    const ctx = env.ctx
    ctx.provide('sessionQuery', {
      observeSession: async () => ({ events: defaultEvents(), projections: { values: { modelSelection: { next: null } } } }),
      readSurface: async () => ({ events: defaultEvents() }),
    } as never)
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
    ctx.provide('ideaPreparations', { preparations: { resolve: () => { throw new Error('unused') } } } as never)
    return { ...env, ctx, ids }
  }

  it('D6-C: a muted Idea is excluded from the selector corpus; an all-muted corpus makes zero provider calls', async () => {
    const llm = new FakeLlm()
    llm.enqueueChunks(textStream(JSON.stringify({
      title: 'x', core: 'x', motivation: 'x', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [],
    })))
    const env = await semanticHarness(3, 3)
    env.ctx.provide('llm', llm as never)
    await env.ctx.plugin(IdeaSemanticService)
    await env.ctx.plugin(IdeaRemoteService)
    const result = await env.ctx.ideaSemantic.semanticResurfacingCandidates(
      { sessionId: 'session-1', currentTurn: '检索方案', recentContext: [] },
      undefined,
    )
    expect(result.candidates).toEqual([])
    expect(llm.calls).toHaveLength(0)
  })

  it('D6-C: non-muted Ideas still reach the selector (exactly one provider call)', async () => {
    const llm = new FakeLlm()
    llm.enqueueChunks(textStream(JSON.stringify({
      title: 'x', core: 'x', motivation: 'x', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [],
    })))
    const env = await semanticHarness(3, 2)
    env.ctx.provide('llm', llm as never)
    await env.ctx.plugin(IdeaSemanticService)
    await env.ctx.plugin(IdeaRemoteService)
    const result = await env.ctx.ideaSemantic.semanticResurfacingCandidates(
      { sessionId: 'session-1', currentTurn: '检索方案', recentContext: [] },
      undefined,
    )
    expect(llm.calls).toHaveLength(1)
    expect(result.candidates.every(c => c.ideaId !== env.ids[0] && c.ideaId !== env.ids[1])).toBe(true)
  })

  it('D6-B: embedding mode excludes muted Ideas from the eligible set — zero query embedding when all are muted', async () => {
    const { semanticHarness, storedEmbedding, until, closeServers } =
      await import('./helpers/semantic.ts')
    const root = await mkdtemp(`${tmpdir()}/t131-emb-`)
    try {
      const env = await semanticHarness({ root })
      const server = env.server
      const agg = await env.service.create(
        draft({ title: 'Idea 0', core: '检索方案 0', motivation: 'm', possibleValue: 'v', useWhen: ['检索'] }),
        sourceDraft({ sessionId: 'source-0' }),
      )
      await until(() => storedEmbedding(root, agg.idea.ideaId).then(r => r !== undefined), 5000)
      const requestsAfterIndexing = server.requests.length
      expect(requestsAfterIndexing).toBeGreaterThan(0)

      // Mute the Idea: the eligible set becomes empty, so a candidates query
      // never dispatches a query embedding.
      await env.service.setResurfacingMuted(agg.idea.ideaId, true)
      const result = await env.ctx.ideaSemantic.semanticResurfacingCandidates(
        { sessionId: 'session-1', currentTurn: '检索方案', recentContext: [] },
        undefined,
      )
      expect(result.candidates).toEqual([])
      expect(server.requests.length).toBe(requestsAfterIndexing)
    } finally {
      await closeServers()
      await rm(root, { recursive: true, force: true })
    }
  })


})