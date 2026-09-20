/**
 * Deterministic candidate suppression (§8): closed-vocabulary, evidence-based
 * only, no semantic reasoning. Lifecycle inactivity, continued-discussion
 * bindings, same-conversation provenance, and below-floor scores are the
 * host-side reasons; runtime per-conversation facts (surfaced / referenced /
 * dismissed / present in the composer) are deterministic client-side identity
 * checks over canonical T9 state. Semantic duplication is never suppressed
 * here — that judgment belongs to the model Judge.
 * @module @dsh-external/dsh-idea/src/resurfacing/suppression
 */

import { RESURFACING_RETRIEVAL_FLOOR } from './types.ts'
import type { ResurfacingCandidate, ResurfacingHostSuppressionReason } from './types.ts'

/**
 * Suppress host-side, deterministically.
 * @param scored - Scored candidates in retrieval order.
 * @param evidence.discussionIdeaId - The Idea whose continued discussion this
 *   conversation is, when it is one (canonical `IdeaDiscussion` binding).
 * @returns the survivors and every suppressed candidate with its reason.
 */
export function suppressResurfacingCandidates(
  scored: readonly { candidate: ResurfacingCandidate; score: number }[],
  evidence: { discussionIdeaId?: string },
): {
  kept: { candidate: ResurfacingCandidate; score: number }[]
  suppressed: { ideaId: ResurfacingCandidate['ideaId']; reason: ResurfacingHostSuppressionReason }[]
} {
  const kept: { candidate: ResurfacingCandidate; score: number }[] = []
  const suppressed: { ideaId: ResurfacingCandidate['ideaId']; reason: ResurfacingHostSuppressionReason }[] = []
  for (const entry of scored) {
    const { candidate, score } = entry
    if (candidate.status !== 'active') {
      suppressed.push({ ideaId: candidate.ideaId, reason: 'IDEA_LIFECYCLE_INACTIVE' })
      continue
    }
    if (evidence.discussionIdeaId !== undefined && candidate.ideaId === evidence.discussionIdeaId) {
      suppressed.push({ ideaId: candidate.ideaId, reason: 'CURRENT_DISCUSSION_DESCENDS_FROM_IDEA' })
      continue
    }
    if (candidate.createdInConversation === true) {
      suppressed.push({ ideaId: candidate.ideaId, reason: 'CREATED_IN_CURRENT_CONVERSATION' })
      continue
    }
    if (score < RESURFACING_RETRIEVAL_FLOOR) {
      suppressed.push({ ideaId: candidate.ideaId, reason: 'BELOW_RETRIEVAL_FLOOR' })
      continue
    }
    kept.push(entry)
  }
  return { kept, suppressed }
}
