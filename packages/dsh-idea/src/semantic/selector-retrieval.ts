/**
 * Deterministic pre-selection for the Harness-LLM semantic selector (T11.1):
 * the shared lexical mechanics applied as a broad-recall pool over the
 * eligible canonical corpus, and the bounded candidate projection the
 * selector prompt carries. A corpus within the frozen limit passes whole —
 * no lexical filter, so a zero-overlap candidate can still be recovered; a
 * larger corpus ranks score DESC → updatedAt DESC → ideaId ASC, keeps every
 * positive-score candidate, and fills remaining seats from zero-score
 * candidates by recency. Deliberately no T10 positive-evidence floor and no
 * T10 pool: this is a bounded preselection for the selector, not the lexical
 * candidate branch.
 * @module @dsh-external/dsh-idea/src/semantic/selector-retrieval
 */

import { extractQueryFeatures, normalizeLexical, recencyThenIdOrder, scoreLexicalFields } from '../retrieval/lexical.ts'
import { boundedList, boundedText, IDEA_FIELD_BUDGET_LADDER, projectWithinBudget } from '../retrieval/budget.ts'
import { RESURFACING_FIELD_WEIGHTS } from '../resurfacing/types.ts'
import type { ResurfacingCandidate } from '../resurfacing/types.ts'
import { SEMANTIC_SELECTOR_PAYLOAD_LIMIT, SEMANTIC_TOP_K } from './types.ts'

/** Compatible re-export of the shared feature extraction. */
export const extractSelectorQueryFeatures = extractQueryFeatures

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
 * Score one candidate: over every weighted field, the number of distinct
 * query features present (repeated occurrences within one field count once)
 * times the field's weight, summed.
 */
export function scoreSelectorCandidate(candidate: ResurfacingCandidate, features: readonly string[]): number {
  return scoreLexicalFields(fieldTexts(candidate), RESURFACING_FIELD_WEIGHTS, features)
}

/**
 * Choose the selector pool: a corpus within the frozen limit passes through
 * in corpus order; a larger corpus ranks by score DESC → updatedAt DESC →
 * ideaId ASC, keeps every positive-score candidate, and fills the remaining
 * slots from zero-score candidates by recency so wording differences cannot
 * collapse the broad pool.
 */
export function selectSelectorPool(
  candidates: readonly ResurfacingCandidate[],
  features: readonly string[],
): ResurfacingCandidate[] {
  if (candidates.length <= SEMANTIC_TOP_K) return [...candidates]
  const ranked = candidates
    .map(candidate => ({ candidate, score: scoreSelectorCandidate(candidate, features) }))
    .sort((a, b) =>
      b.score - a.score
      || recencyThenIdOrder(
        { updatedAt: a.candidate.updatedAt, id: a.candidate.ideaId },
        { updatedAt: b.candidate.updatedAt, id: b.candidate.ideaId },
      ))
  const positive = ranked.filter(entry => entry.score > 0)
  if (positive.length >= SEMANTIC_TOP_K) {
    return positive.slice(0, SEMANTIC_TOP_K).map(entry => entry.candidate)
  }
  const fill = ranked
    .filter(entry => entry.score === 0)
    .slice(0, SEMANTIC_TOP_K - positive.length)
  return [...positive, ...fill].map(entry => entry.candidate)
}

/**
 * The bounded current-version projection one candidate contributes to the
 * selector prompt: identity, version pin, and title always survive; the
 * degradable semantic fields degrade from lowest to highest preservation
 * priority (useWhen → currentConclusion → core), matching the shared
 * degradation order of the existing Idea usefulness semantics.
 */
export interface SelectorCandidateProjection {
  ideaId: string
  evaluatedVersionId: string
  title: string
  core?: string
  currentConclusion?: string
  useWhen?: readonly string[]
}

/** The degradable selector fields, lowest preservation priority first. */
type DegradableField = 'useWhen' | 'currentConclusion' | 'core'

function projectOne(
  candidate: ResurfacingCandidate,
  budgetOf: (field: DegradableField) => number,
): SelectorCandidateProjection {
  const projection: SelectorCandidateProjection = {
    ideaId: candidate.ideaId,
    evaluatedVersionId: candidate.evaluatedVersionId,
    title: candidate.title,
  }
  const core = boundedText(candidate.core, budgetOf('core'))
  if (core.length > 0) projection.core = core
  const currentConclusion = boundedText(candidate.currentConclusion, budgetOf('currentConclusion'))
  if (currentConclusion.length > 0) projection.currentConclusion = currentConclusion
  const useWhen = boundedList(candidate.useWhen, budgetOf('useWhen'))
  if (useWhen.length > 0) projection.useWhen = useWhen
  return projection
}

/**
 * Project the selector pool onto the bounded prompt payload along the frozen
 * preservation priority: identity, version pin, and title always survive;
 * from lowest to highest (useWhen → currentConclusion → core) each tier
 * walks the shared budget ladder to zero before a higher tier is reduced at
 * all, with the serialized size checked after every step. The first
 * projection within the frozen budget wins, so the output is deterministic.
 */
export function projectSelectorCandidates(
  candidates: readonly ResurfacingCandidate[],
): readonly SelectorCandidateProjection[] {
  return projectWithinBudget<DegradableField, SelectorCandidateProjection>({
    order: ['useWhen', 'currentConclusion', 'core'],
    ladder: IDEA_FIELD_BUDGET_LADDER,
    project: budgetOf => candidates.map(candidate => projectOne(candidate, budgetOf)),
    limit: SEMANTIC_SELECTOR_PAYLOAD_LIMIT,
  })
}
