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
import type { IdeaCurrentView } from '../index.ts'
import { IdeaId } from '../types.ts'
import type { IdeaAggregate } from '../types.ts'
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

/** The detached resurfacing candidate one stored Idea contributes. */
function candidateOf(view: IdeaCurrentView, aggregate: IdeaAggregate, sessionId: string): ResurfacingCandidate {
  return {
    ideaId: view.idea.ideaId,
    evaluatedVersionId: view.idea.currentVersionId,
    title: view.currentVersion.draft.title,
    core: view.currentVersion.draft.core,
    motivation: view.currentVersion.draft.motivation,
    currentConclusion: view.currentVersion.draft.currentConclusion,
    possibleValue: view.currentVersion.draft.possibleValue,
    useWhen: [...view.currentVersion.draft.useWhen],
    openQuestions: [...view.currentVersion.draft.openQuestions],
    updatedAt: view.idea.updatedAt,
    score: 0,
    status: view.idea.status,
    createdInConversation: aggregate.sourceDiscussions.some(discussion => discussion.sessionId === sessionId),
  }
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
    for (const view of this.ctx.ideaService.list({ includeArchived: true })) {
      try {
        const aggregate = this.ctx.ideaService.get(view.idea.ideaId)
        corpus.push(candidateOf(view, aggregate, sessionId))
      } catch {
        // Deleted between list and get: the Idea is gone, so it is simply no
        // candidate — never an error surfaced to a client that asked about a
        // conversation, not about storage internals.
      }
    }
    if (corpus.length === 0) {
      return { stop: { reason: 'NO_ELIGIBLE_IDEAS' }, candidates: [], suppressed: [] }
    }

    const features = extractQueryFeatures(currentTurn)
    const scored = corpus.map(candidate => ({ candidate, score: scoreResurfacingCandidate(candidate, features) }))
    const discussionIdeaId = this.ctx.ideaService.findDiscussionByConversationId(sessionId)?.ideaId
    const { kept, suppressed } = suppressResurfacingCandidates(scored, {
      ...(discussionIdeaId !== undefined ? { discussionIdeaId } : {}),
    })
    const { pool, belowFloor } = selectResurfacingPool(kept)
    const allSuppressed = [
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
    const dropped: ResurfacingJudgment['dropped'] = [...input.candidates].map((pinned) => {
      try {
        const aggregate = this.ctx.ideaService.get(IdeaId(pinned.ideaId))
        if (aggregate.idea.status !== 'active') {
          return { ideaId: IdeaId(pinned.ideaId), reason: 'CANDIDATE_BECAME_INELIGIBLE' as const }
        }
        if (aggregate.idea.currentVersionId !== pinned.evaluatedVersionId) {
          return { ideaId: IdeaId(pinned.ideaId), reason: 'CANDIDATE_VERSION_CHANGED' as const }
        }
        return undefined
      } catch {
        return { ideaId: IdeaId(pinned.ideaId), reason: 'CANDIDATE_BECAME_INELIGIBLE' as const }
      }
    }).filter((entry): entry is { ideaId: IdeaId; reason: 'CANDIDATE_BECAME_INELIGIBLE' | 'CANDIDATE_VERSION_CHANGED' } => entry !== undefined)

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
    return { ...parseResurfacingJudgment(text, poolIds), dropped }
  }
}
