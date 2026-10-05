/**
 * The Contextual Resurfacing host service (`ctx.ideaResurfacing`). Two entry
 * points, both read-only over the canonical Idea domain. `evaluate` is the
 * zero-model deterministic stage: it pins each Idea's current version,
 * scores the corpus with the shared lexical mechanics under a positive-
 * evidence floor, and suppresses lifecycle, continued-discussion, and
 * same-conversation provenance conflicts before returning at most three
 * candidates. `judge` is the single model point of the whole feature: it
 * revalidates the pinned pool against canonical state, frames a strictly
 * bounded prompt, makes exactly one direct `ctx.llm.stream()` call (no
 * Agent Loop, no tools, no retry), parses the closed-vocabulary answer
 * strictly, and fails closed to silence on every failure mode. Neither
 * entry point ever writes, and neither ever alters a conversation.
 * @module @dsh-external/dsh-idea/src/resurfacing/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { IdeaPreparationError } from '../preparation/errors.ts'
import { checkCancelled, extractModelText, resolveModelRoute } from '../preparation/pipeline.ts'
import { extractQueryFeatures } from '../retrieval/lexical.ts'
import { candidateOf } from './candidate.ts'
import { IdeaId } from '../types.ts'
import { parseResurfacingJudgment } from './parser.ts'
import { buildResurfacingJudgePrompt } from './prompt.ts'
import { scoreResurfacingCandidate, selectResurfacingPool } from './retrieval.ts'
import { suppressResurfacingCandidates } from './suppression.ts'
import {
  RESURFACING_CONTEXT_TEXT_LIMIT,
  RESURFACING_REPLY_TEXT_LIMIT,
  RESURFACING_RECENT_CONTEXT_LIMIT,
  RESURFACING_SIGNAL_EVIDENCE_LIMIT,
  RESURFACING_TURN_TEXT_LIMIT,
} from './types.ts'
import type {
  ResurfacingCandidate,
  ResurfacingContextMessage,
  ResurfacingEvaluateInput,
  ResurfacingEvaluation,
  ResurfacingJudgeInput,
  ResurfacingJudgment,
  ResurfacingSignal,
  ResurfacingSignalType,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaResurfacing: IdeaResurfacingService
  }
}

const SIGNAL_TYPES = new Set<ResurfacingSignalType>([
  'GOAL_DECLARATION', 'DECISION_POINT', 'PROBLEM_RECURRENCE', 'MEMORY_GAP',
  'TOPIC_REENTRY', 'STRATEGY_RESET',
  'TOPIC_SHIFT', 'FRUSTRATION', 'ATTITUDE_REOPENING', 'STAGE_TRANSITION', 'PARTIAL_RECALL',
])

/** Client-supplied text is bounded again at the trust boundary. */
function boundContext(messages: readonly ResurfacingContextMessage[]): ResurfacingContextMessage[] {
  return messages
    .slice(0, RESURFACING_RECENT_CONTEXT_LIMIT)
    .map(message => ({
      role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      text: message.text.slice(0, RESURFACING_CONTEXT_TEXT_LIMIT),
    }))
    .filter(message => message.text.length > 0)
}

/** Only known signal types with bounded evidence survive the boundary. */
function boundSignals(signals: readonly ResurfacingSignal[]): ResurfacingSignal[] {
  return signals
    .filter(signal => SIGNAL_TYPES.has(signal.type) && (signal.strength === 'strong' || signal.strength === 'medium'))
    .slice(0, RESURFACING_RECENT_CONTEXT_LIMIT * 2)
    .map(signal => ({
      type: signal.type,
      strength: signal.strength,
      evidence: signal.evidence.slice(0, RESURFACING_SIGNAL_EVIDENCE_LIMIT),
      ...(signal.derivedFrom !== undefined
        ? { derivedFrom: signal.derivedFrom.filter(atomic => SIGNAL_TYPES.has(atomic)) }
        : {}),
    }))
}

export class IdeaResurfacingService extends Service {
  static inject = ['ideaService', 'sessionQuery', 'agentDefaultModel', 'llm']

  constructor(ctx: Context) {
    super(ctx, 'ideaResurfacing')
  }

  /**
   * The deterministic, zero-model evaluation: pin every Idea's current
   * version, score the corpus over the completed turn's features, suppress
   * deterministically, and return at most three candidates. No model call
   * ever happens here — an empty corpus and an empty pool are both honest
   * stops.
   */
  async evaluate(input: ResurfacingEvaluateInput): Promise<ResurfacingEvaluation> {
    const sessionId = input.sessionId
    const currentTurn = input.currentTurn.slice(0, RESURFACING_TURN_TEXT_LIMIT)
    const corpus: ResurfacingCandidate[] = []
    const muted: ResurfacingCandidate[] = []
    const mutedIds = this.ctx.ideaService.listResurfacingMutedIds()
    for (const view of this.ctx.ideaService.list({ includeArchived: true })) {
      try {
        const aggregate = this.ctx.ideaService.get(view.idea.ideaId)
        const candidate = candidateOf(view, aggregate, sessionId)
        // T13.1 D6: a muted Idea never enters scoring, the pool, or the
        // Judge — deterministic suppression before anything else.
        if (mutedIds.has(candidate.ideaId)) {
          muted.push(candidate)
          continue
        }
        corpus.push(candidate)
      } catch {
        // Deleted between list and get: the Idea is gone, so it is simply no
        // candidate — never an error surfaced to a client that asked about a
        // conversation, not about storage internals.
      }
    }
    if (corpus.length === 0) {
      return {
        stop: { reason: 'NO_ELIGIBLE_IDEAS' },
        candidates: [],
        suppressed: muted.map(candidate => ({ ideaId: candidate.ideaId, reason: 'USER_MUTED' as const })),
      }
    }

    const features = extractQueryFeatures(currentTurn)
    const scored = corpus.map(candidate => ({ candidate, score: scoreResurfacingCandidate(candidate, features) }))
    const discussionIdeaId = this.ctx.ideaService.findDiscussionByConversationId(sessionId)?.ideaId
    const { kept, suppressed } = suppressResurfacingCandidates(scored, {
      ...(discussionIdeaId !== undefined ? { discussionIdeaId } : {}),
    })
    const { pool, belowFloor } = selectResurfacingPool(kept)
    const allSuppressed = [
      ...muted.map(candidate => ({ ideaId: candidate.ideaId, reason: 'USER_MUTED' as const })),
      ...suppressed,
      ...belowFloor.map(candidate => ({ ideaId: candidate.ideaId, reason: 'BELOW_RETRIEVAL_FLOOR' as const })),
    ]
    if (pool.length === 0) {
      return { stop: { reason: 'NO_ELIGIBLE_IDEAS' }, candidates: [], suppressed: allSuppressed }
    }
    return { candidates: pool, suppressed: allSuppressed }
  }

  /**
   * The one-call semantic Judge. The pinned pool is revalidated against
   * canonical state first (stale versions and ineligible Ideas are dropped
   * with reasons and never reach the model), the prompt is framed from
   * canonical data only, and exactly one bounded call runs. Every failure
   * mode — unservable route, stream failure, malformed output, unknown
   * vocabulary — fails closed to `none`: there is never a lexical fallback.
   */
  async judge(input: ResurfacingJudgeInput, signal?: AbortSignal): Promise<ResurfacingJudgment> {
    checkCancelled(signal)

    const sessionId = input.sessionId
    // T13.1 R1-A: Host-authoritative mute revalidation BEFORE any model
    // dispatch — a preference changed between evaluate and judge drops the
    // candidate here, so it never reaches the provider.
    const mutedIds = this.ctx.ideaService.listResurfacingMutedIds()
    const dropped: ResurfacingJudgment['dropped'] = [...input.candidates].map((pinned) => {
      try {
        const aggregate = this.ctx.ideaService.get(IdeaId(pinned.ideaId))
        if (aggregate.idea.status !== 'active') {
          return { ideaId: IdeaId(pinned.ideaId), reason: 'CANDIDATE_BECAME_INELIGIBLE' as const }
        }
        if (mutedIds.has(aggregate.idea.ideaId)) {
          return { ideaId: IdeaId(pinned.ideaId), reason: 'USER_MUTED' as const }
        }
        if (aggregate.idea.currentVersionId !== pinned.evaluatedVersionId) {
          return { ideaId: IdeaId(pinned.ideaId), reason: 'CANDIDATE_VERSION_CHANGED' as const }
        }
        return undefined
      } catch {
        return { ideaId: IdeaId(pinned.ideaId), reason: 'CANDIDATE_BECAME_INELIGIBLE' as const }
      }
    }).filter((entry): entry is { ideaId: IdeaId; reason: 'CANDIDATE_BECAME_INELIGIBLE' | 'CANDIDATE_VERSION_CHANGED' | 'USER_MUTED' } => entry !== undefined)

    const droppedIds = new Set(dropped.map(entry => entry.ideaId as string))
    const survivors = this.ctx.ideaService.list({ includeArchived: true })
      .filter(view => !droppedIds.has(view.idea.ideaId as string) && input.candidates.some(pinned => pinned.ideaId === (view.idea.ideaId as string)))
      .map(view => candidateOf(view, this.ctx.ideaService.get(view.idea.ideaId), sessionId))
    if (survivors.length === 0) {
      return { outcome: 'none', dropped }
    }

    const route = await resolveModelRoute(this.ctx.sessionQuery, this.ctx.agentDefaultModel, sessionId, signal)
    checkCancelled(signal)

    const prompt = buildResurfacingJudgePrompt({
      currentTurn: input.currentTurn.slice(0, RESURFACING_TURN_TEXT_LIMIT),
      recentContext: boundContext(input.recentContext),
      assistantReply: input.assistantReply.slice(0, RESURFACING_REPLY_TEXT_LIMIT),
      signals: boundSignals(input.signals),
      candidates: survivors,
    })
    const options: GenerateOptions = {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort !== undefined ? { reasoningEffort: ReasoningEffortId(route.reasoningEffort) } : {}),
      messages: [createUserMessage({
        content: [{ type: 'text', text: prompt.user }],
        source: { kind: 'plugin', plugin: 'dsh-idea' },
      })],
      system: prompt.system,
      sessionId: SessionId(sessionId),
      ...(signal !== undefined ? { signal } : {}),
    }

    let text: string
    try {
      text = await extractModelText(this.ctx.llm, options, sessionId, signal)
    } catch (error) {
      if (error instanceof IdeaPreparationError && error.code === 'request-cancelled') throw error
      if (error instanceof IdeaPreparationError && error.code === 'model-unavailable') {
        return { outcome: 'none', reason: 'JUDGE_UNAVAILABLE', dropped }
      }
      return { outcome: 'none', reason: 'JUDGE_FAILED', dropped }
    }
    checkCancelled(signal)

    const poolIds = new Set(survivors.map(candidate => candidate.ideaId as string))
    const judgment = parseResurfacingJudgment(text, poolIds)

    // T13.1 R1-B: post-Judge mute revalidation — the preference may have
    // changed while the provider call was in flight. A muted winning Idea
    // never surfaces: the outcome becomes none (fail-closed silence).
    if (judgment.outcome === 'surface' && judgment.ideaId !== undefined && this.ctx.ideaService.listResurfacingMutedIds().has(judgment.ideaId)) {
      // Fail-closed silence: the reason is absent (the model's verdict was
      // discarded), and the dropped list carries the canonical fact.
      return {
        outcome: 'none',
        dropped: [...dropped, { ideaId: judgment.ideaId, reason: 'USER_MUTED' as const }],
      }
    }
    return { ...judgment, dropped }
  }
}
