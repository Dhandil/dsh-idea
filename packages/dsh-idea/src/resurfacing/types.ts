/**
 * Frozen vocabulary, limits, and shapes of Contextual Idea Resurfacing (T10).
 * A candidate is one Idea's pinned current version projected for judging; a
 * signal is one deterministic detector observation; suppression and delivery
 * reasons are closed vocabularies. Resurfacing never mutates an Idea and
 * never injects into a prompt: until the user explicitly chooses Reference,
 * the whole pipeline only ever decides whether one lightweight suggestion
 * may appear above the composer.
 * @module @dsh-external/dsh-idea/src/resurfacing/types
 */

import type { IdeaId, IdeaStatus, IdeaVersionId } from '../types.ts'

/**
 * Whether T10 runs at all. The whole pipeline sits behind this single
 * switch: when false the client Pre-Delivery Gate stops with
 * `FEATURE_DISABLED` before any detector, retrieval, or model work.
 */
export const RESURFACING_FEATURE_ENABLED = true

/** Most candidates one Judge call may receive. */
export const RESURFACING_CANDIDATE_LIMIT = 3

/**
 * Minimum lexical score one candidate needs to stay eligible: at least two
 * independent field evidences (or two distinct title features). Zero-score
 * candidates never fill the pool — resurfacing has no recency fallback.
 */
export const RESURFACING_RETRIEVAL_FLOOR = 8

/** Longest bounded current-turn text accepted from the client, in characters. */
export const RESURFACING_TURN_TEXT_LIMIT = 2_000

/** Most recent-context messages one request may carry. */
export const RESURFACING_RECENT_CONTEXT_LIMIT = 6

/** Longest bounded recent-context message text, in characters. */
export const RESURFACING_CONTEXT_TEXT_LIMIT = 400

/** Longest bounded assistant reply text one Judge request may carry. */
export const RESURFACING_REPLY_TEXT_LIMIT = 4_000

/**
 * Frozen lexical field weights of the T10 retrieval stage. The same scoring
 * mechanics as T9 Search/Related (distinct feature count per field × weight,
 * summed), with T10's own frozen values.
 */
export const RESURFACING_FIELD_WEIGHTS = {
  title: 5,
  core: 4,
  motivation: 3,
  currentConclusion: 3,
  useWhen: 3,
  possibleValue: 2,
  openQuestions: 2,
} as const

/** Longest serialized candidate payload one Judge call may carry. */
export const RESURFACING_PAYLOAD_LIMIT = 12_000

/** Longest accepted signal evidence snippet, in characters. */
export const RESURFACING_SIGNAL_EVIDENCE_LIMIT = 80

/** Strength of one detector observation. */
export type ResurfacingSignalStrength = 'strong' | 'medium'

/** Strong atomic signals: each one alone satisfies the admission threshold. */
export type ResurfacingStrongAtomicSignal =
  | 'GOAL_DECLARATION'
  | 'DECISION_POINT'
  | 'PROBLEM_RECURRENCE'
  | 'MEMORY_GAP'

/**
 * Strong compound signals: equally admitting, but observed through their
 * atomic components, which are reported as derivations instead of counted
 * twice.
 */
export type ResurfacingStrongCompoundSignal = 'TOPIC_REENTRY' | 'STRATEGY_RESET'

/**
 * Medium atomic signals: real but weaker observations. They never admit an
 * evaluation alone and are recorded only as observability.
 */
export type ResurfacingMediumAtomicSignal =
  | 'TOPIC_SHIFT'
  | 'FRUSTRATION'
  | 'ATTITUDE_REOPENING'
  | 'STAGE_TRANSITION'
  | 'PARTIAL_RECALL'

/** Every signal type the detector may report. */
export type ResurfacingSignalType =
  | ResurfacingStrongAtomicSignal
  | ResurfacingStrongCompoundSignal
  | ResurfacingMediumAtomicSignal

/** One deterministic detector observation: a signal type plus its evidence. */
export interface ResurfacingSignal {
  type: ResurfacingSignalType
  strength: ResurfacingSignalStrength
  /** Bounded verbatim snippet that triggered the rule. */
  evidence: string
  /** Atomic signals a compound was observed through (never double-counted). */
  derivedFrom?: readonly ResurfacingMediumAtomicSignal[]
}

/** The deterministic detector verdict for one completed turn. */
export interface ResurfacingDetection {
  /** Whether at least one strong signal admits the evaluation. */
  admitted: boolean
  signals: readonly ResurfacingSignal[]
}

/** Deterministic candidate suppression reasons (host side). */
export type ResurfacingHostSuppressionReason =
  | 'IDEA_LIFECYCLE_INACTIVE'
  | 'CURRENT_DISCUSSION_DESCENDS_FROM_IDEA'
  | 'CREATED_IN_CURRENT_CONVERSATION'
  | 'BELOW_RETRIEVAL_FLOOR'

/**
 * One candidate of the T10 retrieval: exactly the pinned current version the
 * score was computed over. Each Idea contributes at most one candidate.
 */
export interface ResurfacingCandidate {
  ideaId: IdeaId
  evaluatedVersionId: IdeaVersionId
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
  updatedAt: number
  score: number
  /** Canonical lifecycle status of the Idea at evaluation time. */
  status: IdeaStatus
  /** Canonical provenance: the Idea's source discussion is this conversation. */
  createdInConversation: boolean
}

/** Why the whole evaluation stopped before producing candidates. */
export type ResurfacingEvaluateStopReason = 'NO_ELIGIBLE_IDEAS'

/** The zero-model Host evaluation result. */
export interface ResurfacingEvaluation {
  stop?: { reason: ResurfacingEvaluateStopReason }
  candidates: readonly ResurfacingCandidate[]
  suppressed: readonly { ideaId: IdeaId; reason: ResurfacingHostSuppressionReason }[]
}

/** Positive Judge outcomes: why one Idea genuinely helps right now. */
export type ResurfacingJudgePositiveReason =
  | 'ADDS_MISSING_OPTION'
  | 'RESTORES_FORGOTTEN_DIRECTION'
  | 'ADDS_DECISION_VALUE'
  | 'ADDS_VALUE_TO_RECURRENT_PROBLEM'

/** Negative Judge outcomes, including every fail-closed reason. */
export type ResurfacingJudgeNegativeReason =
  | 'NOT_RELEVANT'
  | 'REDUNDANT_WITH_CONTEXT'
  | 'INTERESTING_BUT_NOT_USEFUL_NOW'
  | 'STALE_FOR_CURRENT_SITUATION'
  | 'TOO_WEAKLY_CONNECTED'
  | 'MULTIPLE_AMBIGUOUS_CANDIDATES'
  | 'JUDGE_UNAVAILABLE'
  | 'JUDGE_INVALID_OUTPUT'
  | 'JUDGE_FAILED'

/** Why a surfaced-pool candidate was dropped before the model saw it. */
export type ResurfacingDropReason = 'CANDIDATE_BECAME_INELIGIBLE' | 'CANDIDATE_VERSION_CHANGED'

/** The one-model-call Judge result. Failure modes fail closed to `none`. */
export interface ResurfacingJudgment {
  outcome: 'none' | 'surface'
  /**
   * The closed-vocabulary decision reason. Present whenever the model ran;
   * absent only when every candidate was already dropped by pre-Judge
   * revalidation, in which case `dropped` carries the facts.
   */
  reason?: ResurfacingJudgePositiveReason | ResurfacingJudgeNegativeReason
  /** Set only with `outcome: 'surface'`; Host-verified identity. */
  ideaId?: IdeaId
  /** Candidates dropped by pre-Judge revalidation, with reasons. */
  dropped: readonly { ideaId: IdeaId; reason: ResurfacingDropReason }[]
}

/** One bounded recent-context message the client contributes. */
export interface ResurfacingContextMessage {
  role: 'user' | 'assistant'
  text: string
}

/** Input of the zero-model Host evaluation. */
export interface ResurfacingEvaluateInput {
  sessionId: string
  /** The completed user turn text the detector admitted. */
  currentTurn: string
  recentContext: readonly ResurfacingContextMessage[]
}

/** Input of the one-call semantic Judge. */
export interface ResurfacingJudgeInput {
  sessionId: string
  currentTurn: string
  recentContext: readonly ResurfacingContextMessage[]
  /** The settled Assistant reply of the triggering turn (bounded). */
  assistantReply: string
  signals: readonly ResurfacingSignal[]
  /** The pinned pool the client still holds: canonical ids only. */
  candidates: readonly { ideaId: string; evaluatedVersionId: string }[]
}
