/**
 * Pure semantic-retrieval mechanics: the deterministic query text built
 * strictly from the existing T10 bounded visible context, and the exact
 * scan ranking (similarity DESC → updatedAt DESC → ideaId ASC, capped at
 * the frozen top-K). The triggering Assistant reply can never enter the
 * query: it is not part of the bounded recent context and the completed
 * triggering turn is user text by contract.
 * @module @dsh-external/dsh-idea/src/semantic/retrieval
 */

import type { IdeaId } from '../types.ts'
import { recencyThenIdOrder } from '../retrieval/lexical.ts'
import {
  RESURFACING_CONTEXT_TEXT_LIMIT,
  RESURFACING_RECENT_CONTEXT_LIMIT,
  RESURFACING_TURN_TEXT_LIMIT,
} from '../resurfacing/types.ts'
import type { ResurfacingContextMessage } from '../resurfacing/types.ts'
import { SEMANTIC_TOP_K } from './types.ts'
import type { SemanticEmbeddingRecord } from './types.ts'

export {
  RESURFACING_CONTEXT_TEXT_LIMIT,
  RESURFACING_RECENT_CONTEXT_LIMIT,
  RESURFACING_TURN_TEXT_LIMIT,
  SEMANTIC_TOP_K,
}

/** One canonical record plus the similarity its vector scored. */
export interface SemanticScoredRecord {
  record: SemanticEmbeddingRecord
  similarity: number
  updatedAt: number
  ideaId: IdeaId
}

/**
 * Bound client-supplied retrieval input at the trust boundary using exactly
 * the existing T10 bounds: the triggering turn to its character limit and
 * the recent context to its message-count limit with per-message character
 * bounds. Roles normalize to the closed user/assistant vocabulary; empty
 * messages drop. This is the same shape `boundContext` applies for the T10
 * evaluation — one policy, two callers.
 */
export function boundSemanticQueryInput(
  currentTurn: string,
  recentContext: readonly ResurfacingContextMessage[],
): { currentTurn: string; recentContext: ResurfacingContextMessage[] } {
  return {
    currentTurn: currentTurn.slice(0, RESURFACING_TURN_TEXT_LIMIT),
    recentContext: recentContext
      .slice(0, RESURFACING_RECENT_CONTEXT_LIMIT)
      .map(message => ({
        role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        text: message.text.slice(0, RESURFACING_CONTEXT_TEXT_LIMIT),
      }))
      .filter(message => message.text.length > 0),
  }
}

/**
 * Build the deterministic embedding query from the bounded triggering turn
 * and bounded recent visible context: prior messages in order, then the
 * triggering user turn last. No second context policy exists — these bounds
 * are the T10 constants, re-applied.
 */
export function buildSemanticQueryText(currentTurn: string, recentContext: readonly ResurfacingContextMessage[]): string {
  const bounded = boundSemanticQueryInput(currentTurn, recentContext)
  return [
    ...bounded.recentContext.map(message => `${message.role}: ${message.text}`),
    `user: ${bounded.currentTurn}`,
  ].join('\n')
}

/**
 * Deterministic exact-scan ordering: similarity DESC, then updatedAt DESC,
 * then ideaId ASC; at most {@link SEMANTIC_TOP_K} entries. No threshold of
 * any kind sits between an eligible record and its rank.
 */
export function selectSemanticTopK(scored: readonly SemanticScoredRecord[]): SemanticScoredRecord[] {
  return [...scored]
    .sort((left, right) =>
      right.similarity - left.similarity
      || recencyThenIdOrder(
        { updatedAt: left.updatedAt, id: left.ideaId },
        { updatedAt: right.updatedAt, id: right.ideaId },
      ))
    .slice(0, SEMANTIC_TOP_K)
}
