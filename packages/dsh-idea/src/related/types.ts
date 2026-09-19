/**
 * Frozen vocabulary and limits of the Related Ideas pipeline. A candidate is
 * one non-archived Idea's current version projected for judging; a judgment
 * is one validated model claim; a match is the canonical Host-owned result
 * row — model output never carries title, core, or version identity.
 * @module @dsh-external/dsh-idea/src/related/types
 */

import type { IdeaReferenceDescriptor } from '../reference/types.ts'
import type { IdeaId, IdeaVersionId } from '../types.ts'

/** Most candidates one judge call may receive. */
export const RELATED_CANDIDATE_LIMIT = 12

/** Longest serialized candidate payload one judge call may carry. */
export const RELATED_PAYLOAD_LIMIT = 48_000

/** Longest accepted `whyUsefulNow` after trim. */
export const RELATED_WHY_LIMIT = 600

/** Most matches one valid judgment may contain. */
export const RELATED_MATCH_LIMIT = 3

/** Frozen lexical field weights of the deterministic retrieval stage. */
export const RELATED_FIELD_WEIGHTS = {
  title: 5,
  core: 4,
  motivation: 3,
  currentConclusion: 3,
  useWhen: 3,
  possibleValue: 2,
  openQuestions: 2,
} as const

/**
 * One eligible Idea's current version, detached from the durable aggregate.
 * Historical versions never become candidates: one Idea contributes exactly
 * one candidate — its current version.
 */
export interface RelatedIdeaCandidate {
  ideaId: IdeaId
  currentVersionId: IdeaVersionId
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
  updatedAt: number
}

/** One validated model claim: a candidate id plus a bounded reason. */
export interface RelatedJudgment {
  ideaId: string
  whyUsefulNow: string
}

/**
 * One canonical result row: Host-resolved Idea identity and content plus the
 * model's reason. Canonical fields come only from the Host candidate set.
 */
export interface RelatedIdeaMatch {
  idea: {
    id: IdeaId
    currentVersionId: IdeaVersionId
    title: string
    core: string
    updatedAt: number
  }
  whyUsefulNow: string
  /** The canonical pinned reference descriptor, Host-owned. */
  reference: IdeaReferenceDescriptor
}

/** The whole Related Ideas result: zero to three rows, model-ordered. */
export interface RelatedIdeasResult {
  items: readonly RelatedIdeaMatch[]
}
