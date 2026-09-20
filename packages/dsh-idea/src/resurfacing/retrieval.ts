/**
 * T10 proactive lexical retrieval: the shared T9 lexical mechanics
 * (normalization, feature extraction, weighted field scoring) applied under
 * resurfacing's own product semantics — positive evidence only. A candidate
 * below the frozen floor is never retrieved, zero-score candidates never
 * fill the pool, and there is no recency fallback: no evidence means no
 * candidate, which means no model call and silence.
 * @module @dsh-external/dsh-idea/src/resurfacing/retrieval
 */

import { normalizeLexical, recencyThenIdOrder, scoreLexicalFields } from '../retrieval/lexical.ts'
import {
  RESURFACING_CANDIDATE_LIMIT,
  RESURFACING_FIELD_WEIGHTS,
  RESURFACING_RETRIEVAL_FLOOR,
} from './types.ts'
import type { ResurfacingCandidate } from './types.ts'

/** One candidate's normalized lexical field texts, over the frozen fields. */
function fieldTexts(candidate: ResurfacingCandidate): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const field of Object.keys(RESURFACING_FIELD_WEIGHTS)) {
    const value =
      field === 'useWhen' ? candidate.useWhen.join(' ')
      : field === 'openQuestions' ? candidate.openQuestions.join(' ')
      : candidate[field as 'title' | 'core' | 'motivation' | 'currentConclusion' | 'possibleValue']
    texts[field] = normalizeLexical(value)
  }
  return texts
}

/**
 * Score one candidate against the query features: over every weighted field,
 * the number of distinct query features present (repeats within one field
 * count once) times the field's frozen weight, summed.
 */
export function scoreResurfacingCandidate(
  candidate: ResurfacingCandidate,
  features: readonly string[],
): number {
  return scoreLexicalFields(fieldTexts(candidate), RESURFACING_FIELD_WEIGHTS, features)
}

/**
 * Reduce a scored corpus to the Judge pool: only candidates whose score
 * reaches the frozen floor survive (reported separately as floor-suppressed
 * by the caller's pass), ranked score DESC → updatedAt DESC → ideaId ASC,
 * capped at the frozen pool limit. There is no zero-score fill.
 */
export function selectResurfacingPool(
  scored: readonly { candidate: ResurfacingCandidate; score: number }[],
): { pool: ResurfacingCandidate[]; belowFloor: ResurfacingCandidate[] } {
  const ranked = [...scored].sort((a, b) =>
    b.score - a.score
    || recencyThenIdOrder(
      { updatedAt: a.candidate.updatedAt, id: a.candidate.ideaId },
      { updatedAt: b.candidate.updatedAt, id: b.candidate.ideaId },
    ))
  const above = ranked.filter(entry => entry.score >= RESURFACING_RETRIEVAL_FLOOR)
  const pool = above.slice(0, RESURFACING_CANDIDATE_LIMIT)
    .map(entry => ({ ...entry.candidate, score: entry.score }))
  const belowFloor = ranked
    .filter(entry => entry.score < RESURFACING_RETRIEVAL_FLOOR)
    .slice(0, RESURFACING_CANDIDATE_LIMIT)
    .map(entry => ({ ...entry.candidate, score: entry.score }))
  return { pool, belowFloor }
}
