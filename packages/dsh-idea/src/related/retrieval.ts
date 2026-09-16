/**
 * Deterministic lexical candidate retrieval: the query features extracted
 * from the bounded captured discussion (Latin/alphanumeric word tokens plus
 * CJK bigrams), the frozen weighted field scoring, and the top-K selection
 * with its recency recall fallback. Similarity only narrows the candidate
 * pool — usefulness is judged later by the model. Scores never reach the
 * user, and stored Ideas are never mutated.
 * @module @dsh-external/dsh-idea/src/related/retrieval
 */

import { IDEA_CAPTURE_LIMITS, truncateToBudget } from '../preparation/context.ts'
import { RELATED_CANDIDATE_LIMIT, RELATED_FIELD_WEIGHTS, RELATED_PAYLOAD_LIMIT } from './types.ts'
import type { RelatedIdeaCandidate } from './types.ts'

/** One NFKC + lowercase + collapsed-whitespace normalization. */
function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Word tokens and CJK scripts, after normalization. CJK script runs cover
 * Han, Hiragana/Katakana, and Hangul; word tokens are runs of two or more
 * ASCII letters/digits.
 */
const FEATURE_PATTERN = /([a-z0-9]{2,})|([぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]+)/g

/**
 * Extract the deduplicated query features of one text: Latin/alphanumeric
 * word tokens (min length 2) and CJK bigrams over contiguous CJK runs —
 * a single-character run contributes itself. Chinese/English mixed text
 * yields both feature kinds.
 */
export function extractQueryFeatures(text: string): string[] {
  const normalized = normalizeForMatch(text)
  const features = new Set<string>()
  for (const match of normalized.matchAll(FEATURE_PATTERN)) {
    const word = match[1]
    const run = match[2]
    if (word !== undefined) {
      features.add(word)
    } else if (run !== undefined) {
      if (run.length === 1) {
        features.add(run)
      } else {
        for (let index = 0; index < run.length - 1; index += 1) {
          features.add(run.slice(index, index + 2))
        }
      }
    }
  }
  return [...features]
}

/** The one text a lexical field scores against. */
function fieldText(candidate: RelatedIdeaCandidate, field: keyof typeof RELATED_FIELD_WEIGHTS): string {
  if (field === 'useWhen') return candidate.useWhen.join(' ')
  if (field === 'openQuestions') return candidate.openQuestions.join(' ')
  return candidate[field]
}

/**
 * Score one candidate: over every weighted field, the number of distinct
 * query features present (repeated occurrences within one field count
 * once) times the field's frozen weight, summed.
 */
export function scoreCandidate(candidate: RelatedIdeaCandidate, features: readonly string[]): number {
  let score = 0
  for (const field of Object.keys(RELATED_FIELD_WEIGHTS) as Array<keyof typeof RELATED_FIELD_WEIGHTS>) {
    const text = normalizeForMatch(fieldText(candidate, field))
    let present = 0
    for (const feature of features) {
      if (text.includes(feature)) present += 1
    }
    score += present * RELATED_FIELD_WEIGHTS[field]
  }
  return score
}

/** Recency-then-id order: the corpus order and the zero-score fallback order. */
function recencyOrder(a: RelatedIdeaCandidate, b: RelatedIdeaCandidate): number {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
  if (a.ideaId < b.ideaId) return -1
  if (a.ideaId > b.ideaId) return 1
  return 0
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
    .sort((a, b) => b.score - a.score || recencyOrder(a.candidate, b.candidate))
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

/**
 * Descending per-field content budgets. The first rung leaves stored content
 * whole; each later rung bounds every content field tighter, until the last
 * rung keeps identity and title alone. Identity and title always survive.
 */
const CONTENT_BUDGET_LADDER: readonly number[] =
  [Number.POSITIVE_INFINITY, 4_000, 2_000, 1_000, 500, 250, 120, 60, 0]

/** Below this field budget a list field is dropped instead of clipped. */
const LIST_DROP_BUDGET = 40

function boundedText(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget < IDEA_CAPTURE_LIMITS.minTruncatable) return ''
  return truncateToBudget(text, budget)
}

function boundedList(items: readonly string[], budget: number): readonly string[] {
  if (budget < LIST_DROP_BUDGET) return []
  const bounded = items.map(item => boundedText(item, budget)).filter(item => item.length > 0)
  return bounded.length > 0 ? bounded : []
}

function projectOne(candidate: RelatedIdeaCandidate, budget: number): RelatedCandidateProjection {
  const projection: RelatedCandidateProjection = { ideaId: candidate.ideaId, title: candidate.title }
  if (budget <= 0) return projection
  const core = boundedText(candidate.core, budget)
  if (core.length > 0) projection.core = core
  const currentConclusion = boundedText(candidate.currentConclusion, budget)
  if (currentConclusion.length > 0) projection.currentConclusion = currentConclusion
  const useWhen = boundedList(candidate.useWhen, budget)
  if (useWhen.length > 0) projection.useWhen = useWhen
  const openQuestions = boundedList(candidate.openQuestions, budget)
  if (openQuestions.length > 0) projection.openQuestions = openQuestions
  const motivation = boundedText(candidate.motivation, budget)
  if (motivation.length > 0) projection.motivation = motivation
  const possibleValue = boundedText(candidate.possibleValue, budget)
  if (possibleValue.length > 0) projection.possibleValue = possibleValue
  return projection
}

/**
 * Project the judge pool onto the bounded prompt payload: identity and title
 * always survive; content is clipped along the frozen priority (core →
 * currentConclusion → useWhen → openQuestions → motivation → possibleValue)
 * until the serialized payload fits the frozen character budget. Stored
 * Ideas are only read, never written.
 */
export function projectCandidates(
  candidates: readonly RelatedIdeaCandidate[],
): readonly RelatedCandidateProjection[] {
  for (const budget of CONTENT_BUDGET_LADDER) {
    const projection = candidates.map(candidate => projectOne(candidate, budget))
    if (JSON.stringify(projection).length <= RELATED_PAYLOAD_LIMIT) return projection
  }
  return candidates.map(candidate => projectOne(candidate, 0))
}
