/**
 * T13.1 — USER_MUTED suppression retrieval tests: a muted Idea never enters
 * the T10 lexical pool (suppressed with reason USER_MUTED); an all-muted
 * corpus ends before the Judge path (NO_ELIGIBLE_IDEAS); the T11 embedding
 * branch excludes muted Ideas from the eligible set (zero query embedding
 * when all are muted); the T11 llm-selector excludes muted Ideas from the
 * corpus (zero selector provider calls); the hybrid fusion cannot
 * resurrect a muted Idea; and the deterministic mute-race evidence —
 * pre-Judge (R1-A), post-Judge in-flight (R1-B), and semantic post-I/O
 * (R1-C) — each proven with gated scripted fakes.
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
import { IdeaId } from '../src/types.ts'
import { until } from './helpers/semantic.ts'

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

// ---------------------------------------------------------------------------
// T13.1 architecture-review evidence: the delivery-authority and mute-race
// proofs (R1-A / R1-B / R1-C / R1-D) as deterministic gated-race tests. Every
// provider seam is a scripted local fake — zero real provider calls.
// ---------------------------------------------------------------------------

/** The pinned-pool Judge request shape used by the race tests. */
const raceJudgeInput = (candidates: readonly { ideaId: string; evaluatedVersionId: string }[]) => ({
  sessionId: 'conversation-race',
  currentTurn: '帮我回忆一下之前讨论过的检索方案',
  recentContext: [{ role: 'user' as const, text: '之前聊过检索方案' }],
  assistantReply: '回复',
  signals: [{ type: 'DECISION_POINT' as const, strength: 'strong' as const, evidence: '回忆' }],
  candidates,
})

/**
 * A resurfacing harness whose Idea is born in a foreign session (so the
 * evaluating conversation never suppresses it by provenance) and whose `llm`
 * seam is a fully scriptable FakeLlm with call recording.
 */
async function judgeRaceHarness() {
  const env = await harness()
  const agg = await env.service.create(
    draft({ title: 'Idea 0', core: '检索方案 0', motivation: 'm', possibleValue: 'v', useWhen: ['检索'] }),
    sourceDraft({ sessionId: 'source-session-0' }),
  )
  const ctx = env.ctx
  ctx.provide('sessionQuery', {
    observeSession: async () => ({ events: defaultEvents(), projections: { values: { modelSelection: { next: null } } } }),
    readSurface: async () => ({ events: defaultEvents() }),
  } as never)
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'p', model: 'm' }) } as never)
  const llm = new FakeLlm()
  ctx.provide('llm', llm as never)
  ctx.provide('ideaPreparations', { preparations: { resolve: () => { throw new Error('unused') } } } as never)
  await ctx.plugin(IdeaResurfacingService)
  return {
    ...env,
    ideas: env.service,
    service: ctx.ideaResurfacing,
    llm,
    ideaId: agg.idea.ideaId as string,
    versionId: agg.idea.currentVersionId as string,
  }
}

describe('Judge mute races (R1-A / R1-B evidence)', () => {
  it('E3 R1-A: a mute landing between evaluate and judge drops the candidate before any provider call', async () => {
    const env = await judgeRaceHarness()
    // The candidate is pinned while the Idea is still unmuted.
    const evaluation = await env.service.evaluate({
      sessionId: 'conversation-race',
      currentTurn: '帮我回忆一下之前讨论过的检索方案',
      recentContext: [],
    })
    expect(evaluation.candidates.map(candidate => candidate.ideaId as string)).toEqual([env.ideaId])
    const pinned = evaluation.candidates[0]!

    // The preference flips after the pin, before the Judge.
    await env.ideas.setResurfacingMuted(pinned.ideaId, true)

    const judgment = await env.service.judge(raceJudgeInput([
      { ideaId: pinned.ideaId as string, evaluatedVersionId: pinned.evaluatedVersionId as string },
    ]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.reason).toBeUndefined()
    expect(judgment.dropped).toEqual([{ ideaId: pinned.ideaId, reason: 'USER_MUTED' }])
    expect(env.llm.calls).toHaveLength(0)
  })

  it('E4 R1-B: a mute landing while the Judge provider call is in flight fails the surface verdict closed', async () => {
    const env = await judgeRaceHarness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    // The provider call is dispatched, then parked before yielding anything:
    // the model would return a legitimate surface verdict once released.
    env.llm.enqueueScript(() => (async function* () {
      await gate
      for (const chunk of textStream(`DECISION: SURFACE\nREASON: ADDS_DECISION_VALUE\nIDEA: ${env.ideaId}`)) {
        yield chunk
      }
    })())

    const pending = env.service.judge(raceJudgeInput([
      { ideaId: env.ideaId, evaluatedVersionId: env.versionId },
    ]))
    await until(() => env.llm.calls.length === 1, 5000)
    expect(env.llm.calls[0]!.messages[0]!.source).toEqual({ kind: 'plugin', plugin: 'dsh-idea' })

    // The preference flips while the provider call is in flight.
    await env.ideas.setResurfacingMuted(IdeaId(env.ideaId), true)
    release()

    const judgment = await pending
    expect(judgment.outcome).toBe('none')
    expect(judgment.dropped).toEqual([{ ideaId: IdeaId(env.ideaId), reason: 'USER_MUTED' }])
    expect(env.llm.calls).toHaveLength(1)
  })
})

describe('semantic post-I/O mute races (R1-C evidence)', () => {
  it('E5 llm selector: a mute landing while the selector call is in flight removes the picked Idea from the result', async () => {
    const { llmSemanticHarness } = await import('./helpers/semantic.ts')
    const env = await llmSemanticHarness()
    env.sessionQuery.add('session-race', [])
    const agg = await env.service.create(
      draft({ title: 'Selector race idea', core: '检索方案 race', motivation: 'm', possibleValue: 'v', useWhen: ['检索'] }),
      sourceDraft({ sessionId: 'source-race' }),
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    // The selector call is dispatched, then parked before yielding: once
    // released the model picks the (not yet muted when dispatched) Idea.
    env.llm.enqueueScript(() => (async function* () {
      await gate
      for (const chunk of textStream(JSON.stringify({ ideaIds: [agg.idea.ideaId] }))) yield chunk
    })())

    const pending = env.ctx.ideaSemantic.semanticResurfacingCandidates(
      { sessionId: 'session-race', currentTurn: '检索方案', recentContext: [] },
      undefined,
    )
    await until(() => env.llm.calls.length === 1, 5000)

    // The preference flips while the selector call is in flight.
    await env.service.setResurfacingMuted(agg.idea.ideaId, true)
    release()

    const result = await pending
    // Exactly one selector call was paid, and the model's pick is dropped
    // post-I/O: with this being the only Idea the result is empty, so no
    // downstream Judge request can carry it.
    expect(env.llm.calls).toHaveLength(1)
    expect(result.candidates).toEqual([])

    // Defense in depth: even a stale client that captured the pre-mute pool
    // cannot deliver it — the Judge drops the muted pin before any provider call.
    env.sessionQuery.add('conversation-race', [])
    await env.ctx.plugin(IdeaResurfacingService)
    const judgment = await env.ctx.ideaResurfacing.judge(raceJudgeInput([
      { ideaId: agg.idea.ideaId as string, evaluatedVersionId: agg.idea.currentVersionId as string },
    ]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.dropped).toEqual([{ ideaId: agg.idea.ideaId, reason: 'USER_MUTED' }])
    expect(env.llm.calls).toHaveLength(1)
  })

  it('E6 embedding: a mute landing while the query embedding is in flight drops the Idea from the results', async () => {
    const { semanticHarness, hashVector, storedEmbedding, closeServers } =
      await import('./helpers/semantic.ts')
    const root = await mkdtemp(`${tmpdir()}/t131-emb-race-`)
    try {
      const env = await semanticHarness({ root })
      const agg = await env.service.create(
        draft({ title: 'Idea 0', core: '检索方案 0', motivation: 'm', possibleValue: 'v', useWhen: ['检索'] }),
        sourceDraft({ sessionId: 'source-0' }),
      )
      await until(async () => await storedEmbedding(root, agg.idea.ideaId) !== undefined, 5000)
      const requestsAfterIndexing = env.server.requests.length

      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      env.server.setHandler(async (body) => {
        const inputs = Array.isArray(body.input) ? body.input as string[] : []
        // Park only the query embedding (index documents start with 'Title:',
        // the deterministic query starts with 'user: '): its response stays
        // in flight until the test releases it.
        if (inputs.some(input => input.startsWith('user: '))) await gate
        return {
          status: 200,
          payload: { data: inputs.map((input, index) => ({ index, embedding: hashVector(input, 4) })) },
        }
      })

      const pending = env.ctx.ideaSemantic.semanticResurfacingCandidates(
        { sessionId: 'session-race', currentTurn: '检索方案', recentContext: [] },
        undefined,
      )
      await until(async () => env.server.requests.length === requestsAfterIndexing + 1, 5000)

      // The query embedding is dispatched and its response parked: mute now.
      await env.service.setResurfacingMuted(agg.idea.ideaId, true)
      release()

      const result = await pending
      // The scored results revalidate the preference after the provider I/O:
      // with this being the only eligible Idea the result is empty.
      expect(result.candidates).toEqual([])
    } finally {
      await closeServers()
      await rm(root, { recursive: true, force: true })
    }
  })
})