/**
 * Deterministic lexical candidate retrieval for Related Ideas: the query
 * features extracted from the bounded captured discussion, the frozen
 * weighted field scoring, and the top-K selection with its recency recall
 * fallback. The lexical mechanics are shared with Search
 * (`../retrieval/lexical.ts`); this module owns the Related product
 * semantics — the recency fill, the judge-pool bound, and the bounded
 * candidate projection. Similarity only narrows the candidate pool —
 * usefulness is judged later by the model. Scores never reach the user, and
 * stored Ideas are never mutated.
 * @module @dsh-external/dsh-idea/src/related/retrieval
 */

import { extractQueryFeatures as extractFeatures, normalizeLexical, recencyThenIdOrder, scoreLexicalFields } from '../retrieval/lexical.ts'
import { boundedList, boundedText, IDEA_FIELD_BUDGET_LADDER, IDEA_FIELD_DEGRADATION_ORDER, projectWithinBudget } from '../retrieval/budget.ts'
import { RELATED_CANDIDATE_LIMIT, RELATED_FIELD_WEIGHTS, RELATED_PAYLOAD_LIMIT } from './types.ts'
import type { RelatedIdeaCandidate } from './types.ts'

/** Compatible public re-export of the shared feature extraction. */
export const extractQueryFeatures = extractFeatures

/** One candidate's normalized lexical field texts, over the frozen fields. */
function fieldTexts(candidate: RelatedIdeaCandidate): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const field of Object.keys(RELATED_FIELD_WEIGHTS)) {
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
 * query features present (repeated occurrences within one field count
 * once) times the field's frozen weight, summed.
 */
export function scoreCandidate(candidate: RelatedIdeaCandidate, features: readonly string[]): number {
  return scoreLexicalFields(fieldTexts(candidate), RELATED_FIELD_WEIGHTS, features)
}

/**
 * Choose the judge pool: a corpus within the frozen limit passes through in
 * corpus order; a larger corpus ranks by score DESC → updatedAt DESC →
 * ideaId ASC, keeps every positive-score candidate, and fills the remaining
 * slots from zero-score candidates by recency so wording differences cannot
 * collapse the pool.
 */
export function selectCandidates(
  candidates: readonly RelatedIdeaCandidate[],
  features: readonly string[],
): RelatedIdeaCandidate[] {
  if (candidates.length <= RELATED_CANDIDATE_LIMIT) return [...candidates]
  const ranked = candidates
    .map(candidate => ({ candidate, score: scoreCandidate(candidate, features) }))
    .sort((a, b) =>
      b.score - a.score
      || recencyThenIdOrder(
        { updatedAt: a.candidate.updatedAt, id: a.candidate.ideaId },
        { updatedAt: b.candidate.updatedAt, id: b.candidate.ideaId },
      ))
  const positive = ranked.filter(entry => entry.score > 0)
  if (positive.length >= RELATED_CANDIDATE_LIMIT) {
    return positive.slice(0, RELATED_CANDIDATE_LIMIT).map(entry => entry.candidate)
  }
  const fill = ranked
    .filter(entry => entry.score === 0)
    .slice(0, RELATED_CANDIDATE_LIMIT - positive.length)
  return [...positive, ...fill].map(entry => entry.candidate)
}

/** The bounded current-version projection one candidate contributes to the prompt. */
export interface RelatedCandidateProjection {
  ideaId: string
  title: string
  core?: string
  currentConclusion?: string
  useWhen?: readonly string[]
  openQuestions?: readonly string[]
  motivation?: string
  possibleValue?: string
}

type DegradableField = (typeof IDEA_FIELD_DEGRADATION_ORDER)[number]

function projectOne(
  candidate: RelatedIdeaCandidate,
  budgetOf: (field: DegradableField) => number,
): RelatedCandidateProjection {
  const projection: RelatedCandidateProjection = { ideaId: candidate.ideaId, title: candidate.title }
  const core = boundedText(candidate.core, budgetOf('core'))
  if (core.length > 0) projection.core = core
  const currentConclusion = boundedText(candidate.currentConclusion, budgetOf('currentConclusion'))
  if (currentConclusion.length > 0) projection.currentConclusion = currentConclusion
  const useWhen = boundedList(candidate.useWhen, budgetOf('useWhen'))
  if (useWhen.length > 0) projection.useWhen = useWhen
  const openQuestions = boundedList(candidate.openQuestions, budgetOf('openQuestions'))
  if (openQuestions.length > 0) projection.openQuestions = openQuestions
  const motivation = boundedText(candidate.motivation, budgetOf('motivation'))
  if (motivation.length > 0) projection.motivation = motivation
  const possibleValue = boundedText(candidate.possibleValue, budgetOf('possibleValue'))
  if (possibleValue.length > 0) projection.possibleValue = possibleValue
  return projection
}

/**
 * Project the judge pool onto the bounded prompt payload along the frozen
 * preservation priority: identity and title always survive; from lowest to
 * highest (possibleValue → motivation → openQuestions → useWhen →
 * currentConclusion → core) each tier walks its own budget ladder to zero
 * before a higher tier is reduced at all, with the serialized size checked
 * after every step. The first projection within the frozen budget wins, so
 * the output is deterministic. Stored Ideas are only read, never written.
 */
export function projectCandidates(
  candidates: readonly RelatedIdeaCandidate[],
): readonly RelatedCandidateProjection[] {
  return projectWithinBudget<DegradableField, RelatedCandidateProjection>({
    order: IDEA_FIELD_DEGRADATION_ORDER,
    ladder: IDEA_FIELD_BUDGET_LADDER,
    project: budgetOf => candidates.map(candidate => projectOne(candidate, budgetOf)),
    limit: RELATED_PAYLOAD_LIMIT,
  })
}
