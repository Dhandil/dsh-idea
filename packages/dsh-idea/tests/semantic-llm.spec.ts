/**
 * The Harness-LLM selector end to end over the real IdeaSemanticService
 * (T11.1 §24–§30): the current Session's projected route reused for exactly
 * one plugin-framed, tools-free call; small-corpus all-candidate semantics
 * with zero-lexical-overlap recovery; the deterministic broad top-12; the
 * strict output handling; mid-stream canonical revalidation; cancellation
 * versus ordinary degradation; backend isolation; the hybrid hand-off to the
 * unchanged Judge with its durable claim; and the egress boundary of the
 * actual selector request. Every model stream is a scripted fake — no real
 * provider, network, or model call.
 * @module tests/semantic-llm.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { FinishReason, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import IdeaResurfacingService from '../src/resurfacing/index.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import { fuseHybridCandidates } from '../src/resurfacing/hybrid.ts'
import { SELECTOR_SYSTEM_PROMPT } from '../src/semantic/selector-prompt.ts'
import type { IdeaDraft } from '../src/types.ts'
import { IdeaId } from '../src/types.ts'
import type { IdeaPreparationError } from '../src/preparation/errors.ts'
import { textStream } from './helpers/preparation.ts'
import { closeServers, llmSemanticHarness } from './helpers/semantic.ts'
import { cleanup, draft, sourceDraft } from './helpers/harness.ts'

afterEach(closeServers)
afterEach(cleanup)

const SESSION = 'session-live'

type LlmEnv = Awaited<ReturnType<typeof llmSemanticHarness>>

/** One llm-mode semantic harness with the retrieval session registered. */
async function bootLlm(): Promise<LlmEnv> {
  const env = await llmSemanticHarness()
  env.sessionQuery.add(SESSION, [])
  return env
}

/** One saved Idea from an unrelated birth conversation. */
const addIdea = async (
  env: LlmEnv,
  overrides: Partial<IdeaDraft> = {},
  sourceSession = 'session-birth',
): Promise<Awaited<ReturnType<LlmEnv['service']['create']>>> =>
  await env.service.create(draft(overrides), sourceDraft({ sessionId: sourceSession }))

/** Script the selector's selection verdict. */
const scriptSelection = (env: LlmEnv, ids: readonly string[]): void => {
  env.llm.enqueueChunks(textStream(JSON.stringify({ ideaIds: ids })))
}

/** Script a selector stream that mutates canonical state mid-stream. */
const scriptSelectionWithMutation = (
  env: LlmEnv,
  ids: readonly string[],
  mutate: () => Promise<void>,
): void => {
  env.llm.enqueueScript(() => (async function* () {
    const text = JSON.stringify({ ideaIds: ids })
    yield { type: 'block-start', index: 0, blockType: 'text' } as unknown as StreamChunk
    yield { type: 'text-delta', index: 0, text } as unknown as StreamChunk
    await mutate()
    yield { type: 'block-end', index: 0, block: { type: 'text', text } } as unknown as StreamChunk
    yield { type: 'finish', reason: { kind: 'stop' } } as unknown as StreamChunk
  })())
}

const select = (
  env: LlmEnv,
  currentTurn = 'What should we look at next?',
  recentContext: readonly { role: 'user' | 'assistant'; text: string }[] = [],
  sessionId = SESSION,
  signal?: AbortSignal,
): Promise<unknown> =>
  env.ctx.ideaSemantic.semanticResurfacingCandidates({ sessionId, currentTurn, recentContext }, signal)

/** The selector request's plugin-authored user message text. */
const userTextOf = (call: GenerateOptions): string =>
  (call.messages[0] as { content: { type: string; text: string }[] }).content[0]!.text

/** The candidate projections inside one selector request payload. */
const payloadOf = (call: GenerateOptions): { currentTurn: string; recentContext: unknown[]; candidates: { ideaId: string }[] } =>
  JSON.parse(userTextOf(call).split('\n')[1]!)

const errorCodeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run()
  } catch (error) {
    return (error as IdeaPreparationError).code
  }
  throw new Error('expected the operation to reject')
}

describe('llm route reuse', () => {
  it('reuses the current Session projected provider and model', async () => {
    const env = await bootLlm()
    const created = await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'session-provider', model: 'session-model' })
    scriptSelection(env, [created.idea.ideaId])
    const result = await select(env) as { candidates: { ideaId: string }[] }
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([created.idea.ideaId])
    expect(env.llm.calls).toHaveLength(1)
    expect(env.llm.calls[0]!.provider).toBe('session-provider')
    expect(env.llm.calls[0]!.model).toBe('session-model')
  })

  it('preserves the projected reasoningEffort', async () => {
    const env = await bootLlm()
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm', reasoningEffort: 'high' })
    scriptSelection(env, [])
    await select(env)
    expect(env.llm.calls[0]!.reasoningEffort).toBe('high')
  })

  it('falls back to the host default when the Session has no projected next selection', async () => {
    const env = await bootLlm()
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, null)
    scriptSelection(env, [])
    await select(env)
    expect(env.llm.calls[0]!.provider).toBe('default-provider')
    expect(env.llm.calls[0]!.model).toBe('default-model')
  })

  it('makes exactly one selector call: plugin-sourced user message, no tools, selector system prompt', async () => {
    const env = await bootLlm()
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelection(env, [])
    await select(env)
    expect(env.llm.calls).toHaveLength(1)
    const call = env.llm.calls[0]!
    expect(call.system).toBe(SELECTOR_SYSTEM_PROMPT)
    expect('tools' in call).toBe(false)
    const message = call.messages[0] as unknown as { source: unknown; content: { type: string }[] }
    expect(message.source).toEqual({ kind: 'plugin', plugin: 'dsh-idea' })
    expect(message.content[0]!.type).toBe('text')
    expect(String(call.sessionId)).toBe(SESSION)
  })
})

describe('selector corpus and pool', () => {
  it('sends every eligible idea to the selector when the corpus is within twelve', async () => {
    const env = await bootLlm()
    const a = await addIdea(env, { title: 'Alpha notes' })
    const b = await addIdea(env, { title: 'Beta notes' })
    const c = await addIdea(env, { title: 'Gamma notes' })
    scriptSelection(env, [c.idea.ideaId, a.idea.ideaId, b.idea.ideaId])
    const result = await select(env) as { candidates: { ideaId: string; evaluatedVersionId: string; semanticRank: number; title: string }[] }
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([
      c.idea.ideaId, a.idea.ideaId, b.idea.ideaId,
    ])
    expect(result.candidates.map(candidate => candidate.semanticRank)).toEqual([1, 2, 3])
    // The model order becomes the rank order; canonical fields come from the Host.
    expect(result.candidates[0]!.evaluatedVersionId).toBe(c.idea.currentVersionId)
    expect(result.candidates[0]!.title).toBe('Gamma notes')
    const payload = payloadOf(env.llm.calls[0]!)
    expect(payload.candidates).toHaveLength(3)
  })

  it('recovers a zero-lexical-overlap candidate in a small corpus', async () => {
    const env = await bootLlm()
    const created = await addIdea(env, { title: 'Orchid greenhouse humidity control' })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelection(env, [created.idea.ideaId])
    const result = await select(env, 'quantum flux capacitor calibration debate') as { candidates: { ideaId: string; semanticRank: number }[] }
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]!.ideaId).toBe(created.idea.ideaId)
    expect(result.candidates[0]!.semanticRank).toBe(1)
  })

  it('never sends ideas created in the current conversation or descended from it', async () => {
    const env = await bootLlm()
    const born = await addIdea(env, { title: 'Born here' }, SESSION)
    const host = await addIdea(env, { title: 'Discussion host' })
    await env.service.continueDiscussion(host.idea.ideaId, async () => SESSION)
    const eligible = await addIdea(env, { title: 'Eligible stranger' })
    scriptSelection(env, [eligible.idea.ideaId])
    await select(env)
    const text = userTextOf(env.llm.calls[0]!)
    expect(text).toContain(eligible.idea.ideaId)
    expect(text).not.toContain(born.idea.ideaId)
    expect(text).not.toContain(host.idea.ideaId)
  })

  it('caps a corpus larger than twelve at exactly twelve, positive-score first', async () => {
    const env = await bootLlm()
    const hit = await addIdea(env, { title: 'Postgres indexing strategies', core: 'Postgres needs vacuum discipline' })
    for (let index = 0; index < 12; index += 1) {
      await addIdea(env, { title: `Unrelated topic number ${index}` })
    }
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelection(env, [hit.idea.ideaId])
    const result = await select(env, 'postgres indexing help please') as { candidates: { ideaId: string }[] }
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([hit.idea.ideaId])
    const payload = payloadOf(env.llm.calls[0]!)
    expect(payload.candidates).toHaveLength(12)
    expect(payload.candidates[0]!.ideaId).toBe(hit.idea.ideaId)
  })
})

describe('strict selector output handling', () => {
  it.each([
    ['an empty selection', '{"ideaIds":[]}'],
    ['malformed JSON', 'not json at all'],
    ['a Markdown wrapper', '```json\n{"ideaIds":[]}\n```'],
    ['an extra root field', '{"ideaIds":[],"confidence":0.9}'],
    ['a duplicate id', null],
    ['an unknown id', '{"ideaIds":["ghost"]}'],
    ['extra prose', 'Sure! {"ideaIds":[]}'],
  ])('degrades to an empty semantic branch on %s', async (_label, text) => {
    const env = await bootLlm()
    const created = await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    const ids = [created.idea.ideaId, created.idea.ideaId]
    env.llm.enqueueChunks(textStream(text ?? JSON.stringify({ ideaIds: ids })))
    const result = await select(env) as { candidates: unknown[] }
    expect(result.candidates).toEqual([])
    // No retry: exactly one selector call was paid.
    expect(env.llm.calls).toHaveLength(1)
  })

  it('degrades to an empty semantic branch when the selector returns more than twelve ids', async () => {
    const env = await bootLlm()
    const created = await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    const ids = [created.idea.ideaId, ...Array.from({ length: 12 }, (_, index) => `ghost-${index}`)]
    env.llm.enqueueChunks(textStream(JSON.stringify({ ideaIds: ids })))
    const result = await select(env) as { candidates: unknown[] }
    expect(result.candidates).toEqual([])
  })

  it('never touches the durable budget on any selector outcome', async () => {
    const env = await bootLlm()
    const created = await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelection(env, [created.idea.ideaId])
    await select(env)
    expect(env.service.getResurfacingBudget(SESSION).consumed).toBe(false)
    env.llm.enqueueChunks(textStream('broken'))
    await select(env)
    expect(env.service.getResurfacingBudget(SESSION).consumed).toBe(false)
  })
})

describe('post-selector canonical revalidation', () => {
  it('drops a deleted selection and keeps the surviving sibling at rank 1', async () => {
    const env = await bootLlm()
    const a = await addIdea(env, { title: 'Deleted later' })
    const b = await addIdea(env, { title: 'Survivor' })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelectionWithMutation(env, [a.idea.ideaId, b.idea.ideaId], async () => {
      await env.service.deleteIdea(IdeaId(a.idea.ideaId), a.idea.currentVersionId)
    })
    const result = await select(env) as { candidates: { ideaId: string; semanticRank: number }[] }
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([b.idea.ideaId])
    expect(result.candidates[0]!.semanticRank).toBe(1)
  })

  it('drops an archived selection and never fails its siblings', async () => {
    const env = await bootLlm()
    const a = await addIdea(env, { title: 'Archived later' })
    const b = await addIdea(env, { title: 'Survivor' })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelectionWithMutation(env, [a.idea.ideaId, b.idea.ideaId], async () => {
      await env.service.archive(IdeaId(a.idea.ideaId), a.idea.currentVersionId)
    })
    const result = await select(env) as { candidates: { ideaId: string }[] }
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([b.idea.ideaId])
  })

  it('drops a selection whose version changed and never remaps the stale pin', async () => {
    const env = await bootLlm()
    const a = await addIdea(env, { title: 'Edited later' })
    const b = await addIdea(env, { title: 'Survivor' })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelectionWithMutation(env, [a.idea.ideaId, b.idea.ideaId], async () => {
      await env.service.manualEdit(IdeaId(a.idea.ideaId), draft({ title: 'Edited now' }), a.idea.currentVersionId)
    })
    const result = await select(env) as { candidates: { ideaId: string; evaluatedVersionId: string; title: string }[] }
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([b.idea.ideaId])
    expect(result.candidates[0]!.evaluatedVersionId).toBe(b.idea.currentVersionId)
    expect(result.candidates[0]!.title).toBe('Survivor')
  })

  it('drops a selection the current conversation now descends from', async () => {
    const env = await bootLlm()
    const a = await addIdea(env, { title: 'Discussion host later' })
    const b = await addIdea(env, { title: 'Survivor' })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelectionWithMutation(env, [a.idea.ideaId, b.idea.ideaId], async () => {
      await env.service.continueDiscussion(IdeaId(a.idea.ideaId), async () => SESSION)
    })
    const result = await select(env) as { candidates: { ideaId: string }[] }
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([b.idea.ideaId])
  })
})

describe('cancellation and failure', () => {
  it('rejects an abort before the route as cancellation with zero LLM calls', async () => {
    const env = await bootLlm()
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    const controller = new AbortController()
    controller.abort()
    expect(await errorCodeOf(() => select(env, 'turn', [], SESSION, controller.signal))).toBe('request-cancelled')
    expect(env.llm.calls).toHaveLength(0)
  })

  it('rejects an abort during the stream as cancellation without retry', async () => {
    const env = await bootLlm()
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    const controller = new AbortController()
    env.llm.enqueueAbort(
      controller,
      { type: 'block-start', index: 0, blockType: 'text' } as unknown as StreamChunk,
      { type: 'text-delta', index: 0, text: 'partial' } as unknown as StreamChunk,
    )
    expect(await errorCodeOf(() => select(env, 'turn', [], SESSION, controller.signal))).toBe('request-cancelled')
    expect(env.llm.calls).toHaveLength(1)
  })

  it('degrades to an empty branch when no model route is servable', async () => {
    const env = await bootLlm()
    await addIdea(env)
    ;(env.agentDefaultModel as unknown as { currentSelection: () => never }).currentSelection = () => {
      throw new Error('no host default')
    }
    const result = await select(env) as { candidates: unknown[] }
    expect(result.candidates).toEqual([])
    expect(env.llm.calls).toHaveLength(0)
  })

  it('degrades to an empty branch on stream failure without retry', async () => {
    const env = await bootLlm()
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    env.llm.enqueueFailure(new Error('provider down'))
    const result = await select(env) as { candidates: unknown[] }
    expect(result.candidates).toEqual([])
    expect(env.llm.calls).toHaveLength(1)
  })

  it('degrades to an empty branch on a non-success finish without retry', async () => {
    const env = await bootLlm()
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    env.llm.enqueueChunks(textStream('{"ideaIds":[]}', { kind: 'max-tokens' } as FinishReason))
    const result = await select(env) as { candidates: unknown[] }
    expect(result.candidates).toEqual([])
    expect(env.llm.calls).toHaveLength(1)
  })

  it('maps selector cancellation onto gateway/cancelled at the Remote boundary', async () => {
    const env = await bootLlm()
    env.ctx.provide('ideaPreparations', {} as never)
    env.ctx.provide('ideaEvolutions', {} as never)
    env.ctx.provide('ideaRelated', {} as never)
    env.ctx.provide('ideaResurfacing', {} as never)
    await env.ctx.plugin(IdeaRemoteService)
    await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    const controller = new AbortController()
    env.llm.enqueueAbort(
      controller,
      { type: 'block-start', index: 0, blockType: 'text' } as unknown as StreamChunk,
      { type: 'text-delta', index: 0, text: 'partial' } as unknown as StreamChunk,
    )
    try {
      await env.ctx.idea.semanticResurfacingCandidates(
        { sessionId: SESSION, currentTurn: 'turn', recentContext: [] },
        controller.signal,
      )
      throw new Error('expected the remote call to reject')
    } catch (error) {
      expect(remoteErrorOf(error)?.code).toBe('gateway/cancelled')
    }
    expect(env.llm.calls).toHaveLength(1)
  })
})

describe('backend isolation', () => {
  it('llm mode performs zero embedding calls, zero reconciliation, and zero vector writes', async () => {
    const env = await bootLlm()
    const a = await addIdea(env)
    const b = await addIdea(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelection(env, [a.idea.ideaId])
    await select(env)
    expect(env.server.requests).toHaveLength(0)
    const { embeddingExists } = await import('./helpers/semantic.ts')
    expect(await embeddingExists(env.root, a.idea.ideaId)).toBe(false)
    expect(await embeddingExists(env.root, b.idea.ideaId)).toBe(false)
    expect(env.llm.calls).toHaveLength(1)
  })

  it('off mode performs zero selector calls and zero embedding calls', async () => {
    const env = await llmSemanticHarness({ config: { mode: 'off' } })
    env.sessionQuery.add(SESSION, [])
    await addIdea(env as never)
    const result = await select(env as never) as { candidates: unknown[] }
    expect(result.candidates).toEqual([])
    expect(env.llm.calls).toHaveLength(0)
    expect(env.server.requests).toHaveLength(0)
  })
})

describe('end-to-end hybrid resurfacing', () => {
  const LEXICAL_TURN = 'postgres indexing help please'

  /** One lexical-hitting Idea: postgres + indexing in the title alone clear the floor. */
  const addLexicalHit = async (env: LlmEnv): Promise<Awaited<ReturnType<LlmEnv['service']['create']>>> =>
    await addIdea(env, { title: 'Postgres indexing strategies', core: 'Postgres needs vacuum discipline' })

  it('fuses a lexical miss with an LLM semantic hit and hands it to the unchanged Judge', async () => {
    const env = await bootLlm()
    await env.ctx.plugin(IdeaResurfacingService)
    const semanticHit = await addIdea(env, { title: 'Orchid greenhouse humidity control' })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })

    // Lexical branch: zero overlap → below the floor → empty.
    const evaluation = await env.ctx.ideaResurfacing.evaluate({
      sessionId: SESSION,
      currentTurn: 'quantum capacitor brainstorm',
      recentContext: [],
    })
    expect(evaluation.candidates).toEqual([])

    // Semantic branch: the selector recovers the zero-overlap Idea.
    scriptSelection(env, [semanticHit.idea.ideaId])
    const semantic = await select(env) as { candidates: { ideaId: string; evaluatedVersionId: string }[] }
    expect(semantic.candidates).toHaveLength(1)

    // The unchanged RRF admits the semantic-only candidate.
    const fused = fuseHybridCandidates(
      evaluation.candidates.map(candidate => ({ ideaId: candidate.ideaId, evaluatedVersionId: candidate.evaluatedVersionId })),
      semantic.candidates,
    )
    expect(fused).toHaveLength(1)
    expect(fused[0]!.presentInSemantic).toBe(true)

    // The unchanged Judge receives it and surfaces it.
    env.llm.enqueueChunks(textStream(`DECISION: SURFACE\nREASON: ADDS_DECISION_VALUE\nIDEA: ${semanticHit.idea.ideaId}`))
    const judgment = await env.ctx.ideaResurfacing.judge({
      sessionId: SESSION,
      currentTurn: 'quantum capacitor brainstorm',
      recentContext: [],
      assistantReply: 'The settled reply.',
      signals: [],
      candidates: fused.map(entry => ({ ideaId: entry.ideaId, evaluatedVersionId: entry.evaluatedVersionId })),
    })
    expect(judgment.outcome).toBe('surface')
    expect(judgment.ideaId).toBe(IdeaId(semanticHit.idea.ideaId))

    // The Judge input carries no selector provenance.
    const judgeText = userTextOf(env.llm.calls[1]!)
    expect(judgeText).not.toContain('semanticRank')
    expect(judgeText).not.toContain('selector')

    // Final Delivery Gate seam: the durable claim lands CLAIMED and only once.
    expect(await env.service.claimResurfacingBudget(SESSION)).toBe('CLAIMED')
    expect(await env.service.claimResurfacingBudget(SESSION)).toBe('ALREADY_CONSUMED')
  })

  it('keeps the lexical candidate on the Judge when the selector fails', async () => {
    const env = await bootLlm()
    await env.ctx.plugin(IdeaResurfacingService)
    await addLexicalHit(env)
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })

    const evaluation = await env.ctx.ideaResurfacing.evaluate({
      sessionId: SESSION,
      currentTurn: LEXICAL_TURN,
      recentContext: [],
    })
    expect(evaluation.candidates).toHaveLength(1)

    env.llm.enqueueFailure(new Error('selector down'))
    const semantic = await select(env, LEXICAL_TURN) as { candidates: unknown[] }
    expect(semantic.candidates).toEqual([])

    const fused = fuseHybridCandidates(
      evaluation.candidates.map(candidate => ({ ideaId: candidate.ideaId, evaluatedVersionId: candidate.evaluatedVersionId })),
      semantic.candidates as never,
    )
    expect(fused).toHaveLength(1)
    env.llm.enqueueChunks(textStream(`DECISION: SURFACE\nREASON: ADDS_VALUE_TO_RECURRENT_PROBLEM\nIDEA: ${evaluation.candidates[0]!.ideaId}`))
    const judgment = await env.ctx.ideaResurfacing.judge({
      sessionId: SESSION,
      currentTurn: LEXICAL_TURN,
      recentContext: [],
      assistantReply: 'The settled reply.',
      signals: [],
      candidates: fused.map(entry => ({ ideaId: entry.ideaId, evaluatedVersionId: entry.evaluatedVersionId })),
    })
    expect(judgment.outcome).toBe('surface')
    expect(judgment.ideaId).toBe(evaluation.candidates[0]!.ideaId)
  })

  it('preserves the existing RRF behavior when both branches hit', async () => {
    const env = await bootLlm()
    await env.ctx.plugin(IdeaResurfacingService)
    const lexicalHit = await addLexicalHit(env)
    const semanticOnly = await addIdea(env, { title: 'Orchid greenhouse humidity control' })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })

    const evaluation = await env.ctx.ideaResurfacing.evaluate({
      sessionId: SESSION,
      currentTurn: LEXICAL_TURN,
      recentContext: [],
    })
    expect(evaluation.candidates.map(candidate => candidate.ideaId)).toEqual([lexicalHit.idea.ideaId])

    scriptSelection(env, [semanticOnly.idea.ideaId, lexicalHit.idea.ideaId])
    const semantic = await select(env, LEXICAL_TURN) as { candidates: { ideaId: string; evaluatedVersionId: string }[] }
    const fused = fuseHybridCandidates(
      evaluation.candidates.map(candidate => ({ ideaId: candidate.ideaId, evaluatedVersionId: candidate.evaluatedVersionId })),
      semantic.candidates,
    )
    // The double contribution wins; order, identities, and both-hit flags preserved.
    expect(fused[0]!.ideaId).toBe(lexicalHit.idea.ideaId)
    expect(fused[0]!.presentInLexical).toBe(true)
    expect(fused[0]!.presentInSemantic).toBe(true)
    expect(fused[1]!.ideaId).toBe(semanticOnly.idea.ideaId)
  })
})

describe('privacy and egress', () => {
  it('sends only the bounded context and the six-field candidate projection', async () => {
    const env = await bootLlm()
    const created = await addIdea(env, {
      title: 'Postgres indexing strategies',
      core: 'PG-CORE-MARKER',
      currentConclusion: 'PG-CONCLUSION-MARKER',
      useWhen: ['PG-USEWHEN-MARKER'],
      motivation: 'MOTIVATION-MARKER-EGRESS',
      possibleValue: 'POSSIBLE-MARKER-EGRESS',
      openQuestions: ['OPENQ-MARKER-EGRESS'],
    })
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelection(env, [created.idea.ideaId])
    await select(
      env,
      'TURN-MARKER-VISIBLE postgres indexing',
      [{ role: 'user', text: 'RECENT-MARKER-VISIBLE' }],
    )
    const text = userTextOf(env.llm.calls[0]!)
    expect(text).toContain('TURN-MARKER-VISIBLE')
    expect(text).toContain('RECENT-MARKER-VISIBLE')
    expect(text).toContain(created.idea.ideaId)
    expect(text).toContain(created.idea.currentVersionId)
    expect(text).toContain('Postgres indexing strategies')
    expect(text).toContain('PG-CORE-MARKER')
    expect(text).toContain('PG-CONCLUSION-MARKER')
    expect(text).toContain('PG-USEWHEN-MARKER')
    expect(text).not.toContain('MOTIVATION-MARKER-EGRESS')
    expect(text).not.toContain('POSSIBLE-MARKER-EGRESS')
    expect(text).not.toContain('OPENQ-MARKER-EGRESS')
    expect(text).not.toContain('CAPTURED-MARKER-EGRESS')
    expect(text).not.toContain('test-key')
    expect(text).not.toContain('budget')
    expect(text).not.toContain('assistantReply')
  })

  it('never sends captured source-discussion context or historical versions', async () => {
    const env = await bootLlm()
    const created = await env.service.create(
      draft({ title: 'Provenance guarded' }),
      {
        ...sourceDraft(),
        capturedContext: [{ role: 'user', text: 'CAPTURED-MARKER-EGRESS body' }],
      },
    )
    env.sessionQuery.addProjection(SESSION, { provider: 'p', model: 'm' })
    scriptSelection(env, [created.idea.ideaId])
    await select(env)
    const text = userTextOf(env.llm.calls[0]!)
    expect(text).not.toContain('CAPTURED-MARKER-EGRESS')
    expect(text).not.toContain('verbatim')
  })
})
