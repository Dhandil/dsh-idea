/**
 * The T10 Judge end to end over scripted seams: the strict closed-vocabulary
 * parser (fail-closed on every malformed shape), the bounded tag-safe prompt
 * framing, the zero-model evaluate stage (NO_ELIGIBLE_IDEAS, the four host
 * suppression reasons, zero model calls), pre-Judge canonical revalidation
 * (stale pins dropped with reasons, never shown to the model), exactly one
 * direct plugin-framed judgment call, strict failure classification with no
 * retry, and zero durable writes across the whole read-only path.
 * @module tests/resurfacing-judge.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import IdeaResurfacingService from '../src/resurfacing/index.ts'
import {
  RESURFACING_PAYLOAD_LIMIT,
  RESURFACING_SIGNAL_EVIDENCE_LIMIT,
} from '../src/resurfacing/types.ts'
import { JUDGE_SYSTEM_PROMPT, buildResurfacingJudgePrompt } from '../src/resurfacing/prompt.ts'
import { parseResurfacingJudgment } from '../src/resurfacing/parser.ts'
import { IdeaId, IdeaVersionId } from '../src/types.ts'
import { textStream } from './helpers/preparation.ts'
import { cleanup, draft, storedBytes } from './helpers/harness.ts'
import { evolutionHarness, seedDiscussion } from './helpers/evolution.ts'
import type { EvolutionEnv } from './helpers/evolution.ts'
import type { IdeaPreparationError } from '../src/preparation/errors.ts'

afterEach(cleanup)

const errorCodeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run()
  } catch (error) {
    return (error as IdeaPreparationError).code
  }
  throw new Error('expected the judgment to reject')
}

interface JudgeEnv {
  env: EvolutionEnv
  resurfacing: IdeaResurfacingService
  ideaId: string
}

async function boot(): Promise<JudgeEnv> {
  const env = await evolutionHarness()
  const { ideaId } = await seedDiscussion(env)
  await env.ctx.plugin(IdeaResurfacingService)
  return { env, resurfacing: env.ctx.ideaResurfacing, ideaId }
}

/** One extra saved Idea from an unrelated conversation, with a chosen title. */
const addIdea = async (env: EvolutionEnv, title: string): Promise<string> => {
  const created = await env.ideaService.create(draft({ title, core: `Core of ${title}` }), {
    sessionId: 'session-9',
    anchorMessageId: 'msg-9',
    startSeq: 1,
    endSeq: 2,
    capturedContext: [{ role: 'user', text: `seed for ${title}` }],
  })
  return created.idea.ideaId as string
}

const OVERLAP_TURN = '塔防游戏的方向'

const judgeInput = (candidates: { ideaId: string; evaluatedVersionId: string }[]) => ({
  sessionId: 'conversation-1',
  currentTurn: '塔防游戏的方向哪个更好？',
  recentContext: [{ role: 'user' as const, text: '之前聊过塔防' }],
  assistantReply: '两个方向各有利弊。',
  signals: [{ type: 'DECISION_POINT' as const, strength: 'strong' as const, evidence: '哪个更好' }],
  candidates,
})

const surfaceAnswer = (ideaId: string): string =>
  `DECISION: SURFACE\nREASON: ADDS_DECISION_VALUE\nIDEA: ${ideaId}`

describe('the strict parser', () => {
  const pool = new Set(['idea-1', 'idea-2'])

  it('accepts a SURFACE verdict with a positive reason and a known id', () => {
    const judgment = parseResurfacingJudgment(
      'DECISION: SURFACE\nREASON: ADDS_MISSING_OPTION\nIDEA: idea-1',
      pool,
    )
    expect(judgment.outcome).toBe('surface')
    expect(judgment.reason).toBe('ADDS_MISSING_OPTION')
    expect(judgment.ideaId).toBe(IdeaId('idea-1'))
  })

  it('accepts a NONE verdict with a negative reason and no idea line', () => {
    const judgment = parseResurfacingJudgment('DECISION: NONE\nREASON: NOT_RELEVANT', pool)
    expect(judgment.outcome).toBe('none')
    expect(judgment.reason).toBe('NOT_RELEVANT')
    expect(judgment.ideaId).toBeUndefined()
  })

  it('rejects a SURFACE verdict citing an unknown candidate id', () => {
    expect(parseResurfacingJudgment(
      'DECISION: SURFACE\nREASON: ADDS_MISSING_OPTION\nIDEA: idea-9',
      pool,
    ).reason).toBe('JUDGE_INVALID_OUTPUT')
  })

  it('rejects a SURFACE verdict carrying a negative reason', () => {
    expect(parseResurfacingJudgment(
      'DECISION: SURFACE\nREASON: NOT_RELEVANT\nIDEA: idea-1',
      pool,
    ).reason).toBe('JUDGE_INVALID_OUTPUT')
  })

  it('rejects a SURFACE verdict without an idea line', () => {
    expect(parseResurfacingJudgment(
      'DECISION: SURFACE\nREASON: ADDS_MISSING_OPTION',
      pool,
    ).reason).toBe('JUDGE_INVALID_OUTPUT')
  })

  it('rejects a NONE verdict carrying a positive reason or an idea line', () => {
    expect(parseResurfacingJudgment('DECISION: NONE\nREASON: ADDS_MISSING_OPTION', pool).reason)
      .toBe('JUDGE_INVALID_OUTPUT')
    expect(parseResurfacingJudgment('DECISION: NONE\nREASON: NOT_RELEVANT\nIDEA: idea-1', pool).reason)
      .toBe('JUDGE_INVALID_OUTPUT')
  })

  it('rejects unknown vocabulary, extra prose, and wrong casing', () => {
    expect(parseResurfacingJudgment('DECISION: NONE\nREASON: SOMETHING_ELSE', pool).reason)
      .toBe('JUDGE_INVALID_OUTPUT')
    expect(parseResurfacingJudgment(
      'DECISION: NONE\nREASON: NOT_RELEVANT\nThe idea seems irrelevant.',
      pool,
    ).reason).toBe('JUDGE_INVALID_OUTPUT')
    expect(parseResurfacingJudgment('decision: none\nREASON: NOT_RELEVANT', pool).reason)
      .toBe('JUDGE_INVALID_OUTPUT')
    expect(parseResurfacingJudgment('', pool).reason).toBe('JUDGE_INVALID_OUTPUT')
  })
})

describe('prompt framing bounds', () => {
  it('frames the closed system prompt and the required answer shape', () => {
    const prompt = buildResurfacingJudgePrompt({
      currentTurn: 'turn',
      recentContext: [],
      assistantReply: 'reply',
      signals: [],
      candidates: [],
    })
    expect(prompt.system).toBe(JUDGE_SYSTEM_PROMPT)
    expect(prompt.user).toContain('DECISION: NONE|SURFACE')
    expect(prompt.user).toContain('MULTIPLE_AMBIGUOUS_CANDIDATES')
    expect(prompt.user).toContain('(only when DECISION is SURFACE')
  })

  it('serializes candidate pins and never leaks a raw tag opening', () => {
    const prompt = buildResurfacingJudgePrompt({
      currentTurn: '<script>alert(1)</script>',
      recentContext: [],
      assistantReply: '',
      signals: [],
      candidates: [{
        ideaId: IdeaId('idea-1'),
        evaluatedVersionId: IdeaVersionId('idea-1:v1'),
        title: 'T',
        core: 'C',
        motivation: '',
        currentConclusion: '',
        possibleValue: 'V',
        useWhen: ['when'],
        openQuestions: [],
        updatedAt: 1,
        score: 9,
        status: 'active',
        createdInConversation: false,
      }],
    })
    expect(prompt.user).toContain('idea-1')
    expect(prompt.user).toContain('\\u003cscript>alert(1)\\u003c/script>')
    expect(prompt.user).not.toContain('<script>')
  })

  it('bounds the serialized payload to the frozen limit', () => {
    const prompt = buildResurfacingJudgePrompt({
      currentTurn: '长'.repeat(50_000),
      recentContext: [],
      assistantReply: '',
      signals: [],
      candidates: [],
    })
    const payloadLine = prompt.user.split('\n')[1]!
    expect(payloadLine.length).toBeLessThanOrEqual(RESURFACING_PAYLOAD_LIMIT)
  })

  it('bounds signal evidence snippets', () => {
    const prompt = buildResurfacingJudgePrompt({
      currentTurn: 'turn',
      recentContext: [],
      assistantReply: '',
      signals: [{ type: 'DECISION_POINT', strength: 'strong', evidence: 'x'.repeat(500) }],
      candidates: [],
    })
    const evidence = JSON.parse(prompt.user.split('\n')[1]!).signals[0].evidence as string
    expect(evidence.length).toBeLessThanOrEqual(RESURFACING_SIGNAL_EVIDENCE_LIMIT)
  })
})

describe('zero-model evaluate', () => {
  it('stops with NO_ELIGIBLE_IDEAS on an empty corpus without any model call', async () => {
    const env = await evolutionHarness()
    env.sessionQuery.add('plain-1', [])
    await env.ctx.plugin(IdeaResurfacingService)

    const result = await env.ctx.ideaResurfacing.evaluate({
      sessionId: 'plain-1',
      currentTurn: OVERLAP_TURN,
      recentContext: [],
    })
    expect(result.stop).toEqual({ reason: 'NO_ELIGIBLE_IDEAS' })
    expect(result.candidates).toEqual([])
    expect(env.llm.calls).toHaveLength(0)
  })

  it('returns above-floor candidates and makes no model call', async () => {
    const { env, resurfacing } = await boot()
    const extra = await addIdea(env, OVERLAP_TURN)

    const result = await resurfacing.evaluate({
      sessionId: 'plain-1',
      currentTurn: OVERLAP_TURN,
      recentContext: [],
    })
    expect(result.stop).toBeUndefined()
    expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([IdeaId(extra)])
    expect(result.candidates[0]!.evaluatedVersionId)
      .toBe(env.ideaService.get(IdeaId(extra)).idea.currentVersionId)
    expect(result.candidates[0]!.score).toBeGreaterThanOrEqual(8)
    expect(result.candidates[0]!.createdInConversation).toBe(false)
    expect(env.llm.calls).toHaveLength(0)
  })

  it('suppresses the Idea this conversation descends from', async () => {
    const { env, resurfacing, ideaId } = await boot()
    const result = await resurfacing.evaluate({
      sessionId: 'conversation-1',
      currentTurn: draft().title,
      recentContext: [],
    })
    expect(result.stop).toEqual({ reason: 'NO_ELIGIBLE_IDEAS' })
    expect(result.suppressed).toEqual([{ ideaId: IdeaId(ideaId), reason: 'CURRENT_DISCUSSION_DESCENDS_FROM_IDEA' }])
    expect(env.llm.calls).toHaveLength(0)
  })

  it('suppresses an Idea created in the evaluating conversation', async () => {
    const { env, resurfacing, ideaId } = await boot()
    const result = await resurfacing.evaluate({
      sessionId: 'session-1',
      currentTurn: OVERLAP_TURN,
      recentContext: [],
    })
    expect(result.suppressed).toEqual([{ ideaId: IdeaId(ideaId), reason: 'CREATED_IN_CURRENT_CONVERSATION' }])
    expect(env.llm.calls).toHaveLength(0)
  })

  it('suppresses a lifecycle-inactive Idea', async () => {
    const { env, resurfacing } = await boot()
    const extra = await addIdea(env, OVERLAP_TURN)
    const view = env.ideaService.get(IdeaId(extra))
    await env.ideaService.archive(IdeaId(extra), view.idea.currentVersionId)

    const result = await resurfacing.evaluate({
      sessionId: 'plain-1',
      currentTurn: OVERLAP_TURN,
      recentContext: [],
    })
    expect(result.suppressed).toEqual(expect.arrayContaining([
      { ideaId: IdeaId(extra), reason: 'IDEA_LIFECYCLE_INACTIVE' },
    ]))
    expect(result.candidates).toEqual([])
    expect(result.stop).toEqual({ reason: 'NO_ELIGIBLE_IDEAS' })
    expect(env.llm.calls).toHaveLength(0)
  })

  it('suppresses a below-floor candidate instead of filling the pool', async () => {
    const { env, resurfacing } = await boot()
    const extra = await addIdea(env, '完全无关的主题')

    const result = await resurfacing.evaluate({
      sessionId: 'plain-1',
      currentTurn: OVERLAP_TURN,
      recentContext: [],
    })
    expect(result.suppressed).toEqual(expect.arrayContaining([
      { ideaId: IdeaId(extra), reason: 'BELOW_RETRIEVAL_FLOOR' },
    ]))
    expect(result.candidates).toEqual([])
    expect(result.stop).toEqual({ reason: 'NO_ELIGIBLE_IDEAS' })
    expect(env.llm.calls).toHaveLength(0)
  })
})

describe('pre-Judge canonical revalidation', () => {
  it('drops an unknown pinned id as ineligible with no reason and no model call', async () => {
    const { env, resurfacing } = await boot()
    const judgment = await resurfacing.judge(judgeInput([
      { ideaId: 'idea-absent', evaluatedVersionId: 'idea-absent:v1' },
    ]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.reason).toBeUndefined()
    expect(judgment.dropped).toEqual([
      { ideaId: IdeaId('idea-absent'), reason: 'CANDIDATE_BECAME_INELIGIBLE' },
    ])
    expect(env.llm.calls).toHaveLength(0)
  })

  it('drops a stale pinned version as version-changed', async () => {
    const { env, resurfacing } = await boot()
    const extra = await addIdea(env, OVERLAP_TURN)
    const judgment = await resurfacing.judge(judgeInput([
      { ideaId: extra, evaluatedVersionId: `${extra}:v-stale` },
    ]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.dropped).toEqual([
      { ideaId: IdeaId(extra), reason: 'CANDIDATE_VERSION_CHANGED' },
    ])
    expect(env.llm.calls).toHaveLength(0)
  })

  it('drops an archived pinned Idea as ineligible', async () => {
    const { env, resurfacing } = await boot()
    const extra = await addIdea(env, OVERLAP_TURN)
    const view = env.ideaService.get(IdeaId(extra))
    await env.ideaService.archive(IdeaId(extra), view.idea.currentVersionId)

    const judgment = await resurfacing.judge(judgeInput([
      { ideaId: extra, evaluatedVersionId: view.idea.currentVersionId },
    ]))
    expect(judgment.dropped).toEqual([
      { ideaId: IdeaId(extra), reason: 'CANDIDATE_BECAME_INELIGIBLE' },
    ])
    expect(env.llm.calls).toHaveLength(0)
  })
})

describe('the single judgment call', () => {
  it('frames one direct plugin call preserving the session route and surfaces a valid verdict', async () => {
    const { env, resurfacing } = await boot()
    const extra = await addIdea(env, OVERLAP_TURN)
    const currentVersionId = env.ideaService.get(IdeaId(extra)).idea.currentVersionId
    env.llm.enqueueChunks(textStream(surfaceAnswer(extra)))

    const judgment = await resurfacing.judge(judgeInput([
      { ideaId: extra, evaluatedVersionId: currentVersionId },
    ]))
    expect(judgment.outcome).toBe('surface')
    expect(judgment.reason).toBe('ADDS_DECISION_VALUE')
    expect(judgment.ideaId).toBe(IdeaId(extra))
    expect(judgment.dropped).toEqual([])
    expect(env.llm.calls).toHaveLength(1)

    const options = env.llm.calls[0]!
    expect(options.provider).toBe('default-provider')
    expect(options.model).toBe('default-model')
    expect(options.sessionId).toBe('conversation-1')
    expect((options as { tools?: unknown }).tools).toBeUndefined()
    expect(options.messages).toHaveLength(1)
    expect(options.messages[0]!.role).toBe('user')
    expect(options.messages[0]!.source).toEqual({ kind: 'plugin', plugin: 'dsh-idea' })
    const block = options.messages[0]!.content[0] as { type: string; text: string }
    expect(options.system).toBe(JUDGE_SYSTEM_PROMPT)
    expect(block.text).toContain(extra)
    expect(block.text).toContain(currentVersionId)
  })

  it('accepts a NONE verdict after its one call', async () => {
    const { env, resurfacing } = await boot()
    const extra = await addIdea(env, OVERLAP_TURN)
    const currentVersionId = env.ideaService.get(IdeaId(extra)).idea.currentVersionId
    env.llm.enqueueChunks(textStream('DECISION: NONE\nREASON: REDUNDANT_WITH_CONTEXT'))

    const judgment = await resurfacing.judge(judgeInput([
      { ideaId: extra, evaluatedVersionId: currentVersionId },
    ]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.reason).toBe('REDUNDANT_WITH_CONTEXT')
    expect(env.llm.calls).toHaveLength(1)
  })
})

describe('failure classification, never retried', () => {
  const pinned = async (env: EvolutionEnv): Promise<{ ideaId: string; evaluatedVersionId: string }> => {
    const extra = await addIdea(env, OVERLAP_TURN)
    return { ideaId: extra, evaluatedVersionId: env.ideaService.get(IdeaId(extra)).idea.currentVersionId }
  }

  it('fails closed on malformed judgment output', async () => {
    const { env, resurfacing } = await boot()
    env.llm.enqueueChunks(textStream('not a verdict at all'))
    const judgment = await resurfacing.judge(judgeInput([await pinned(env)]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.reason).toBe('JUDGE_INVALID_OUTPUT')
    expect(env.llm.calls).toHaveLength(1)
  })

  it('maps a thrown stream failure to JUDGE_FAILED', async () => {
    const { env, resurfacing } = await boot()
    env.llm.enqueueFailure(new Error('boom'))
    const judgment = await resurfacing.judge(judgeInput([await pinned(env)]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.reason).toBe('JUDGE_FAILED')
    expect(env.llm.calls).toHaveLength(1)
  })

  it('maps an unservable route finish to JUDGE_UNAVAILABLE', async () => {
    const { env, resurfacing } = await boot()
    env.llm.enqueueChunks(textStream('', { kind: 'error', failure: { message: 'no adapter', code: 'NO_ADAPTER' } }))
    const judgment = await resurfacing.judge(judgeInput([await pinned(env)]))
    expect(judgment.outcome).toBe('none')
    expect(judgment.reason).toBe('JUDGE_UNAVAILABLE')
    expect(env.llm.calls).toHaveLength(1)
  })

  it('rejects caller cancellation before any model call', async () => {
    const { env, resurfacing } = await boot()
    const controller = new AbortController()
    controller.abort()
    const pin = await pinned(env)

    expect(await errorCodeOf(() => resurfacing.judge(judgeInput([pin]), controller.signal)))
      .toBe('request-cancelled')
    expect(env.llm.calls).toHaveLength(0)
  })
})

describe('zero durable writes', () => {
  it('writes nothing across a successful judgment', async () => {
    const { env, resurfacing, ideaId } = await boot()
    const extra = await addIdea(env, OVERLAP_TURN)
    const before = [
      await storedBytes(env.root, ideaId),
      await storedBytes(env.root, extra),
    ]
    env.llm.enqueueChunks(textStream(surfaceAnswer(extra)))

    await resurfacing.judge(judgeInput([
      { ideaId: extra, evaluatedVersionId: env.ideaService.get(IdeaId(extra)).idea.currentVersionId },
    ]))

    expect(await storedBytes(env.root, ideaId)).toEqual(before[0])
    expect(await storedBytes(env.root, extra)).toEqual(before[1])
  })
})
