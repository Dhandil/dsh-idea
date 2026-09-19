/**
 * The pure Idea search ranking core. A blank query surfaces every in-scope
 * Idea by updatedAt DESC → ideaId ASC; a non-blank query surfaces only
 * positive-score Ideas — score DESC → updatedAt DESC → ideaId ASC, with no
 * zero-score recency fill. Ranking runs host-side over current versions only
 * and performs no durable write.
 * @module @dsh-external/dsh-idea/src/search/service
 */

import { extractQueryFeatures, normalizeLexical, recencyThenIdOrder, scoreLexicalFields } from '../retrieval/lexical.ts'
import { RELATED_FIELD_WEIGHTS } from '../related/types.ts'
import { IDEA_SEARCH_RESULT_LIMIT } from './types.ts'
import type { IdeaSearchRecord, IdeaSearchScope } from './types.ts'

/** The frozen search field weights: the existing Idea usefulness weights. */
export const SEARCH_FIELD_WEIGHTS = RELATED_FIELD_WEIGHTS

/** True when a query is blank after the shared lexical normalization. */
export function isBlankQuery(query: string): boolean {
  return normalizeLexical(query).trim().length === 0
}

function searchFieldTexts(record: IdeaSearchRecord): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const field of Object.keys(SEARCH_FIELD_WEIGHTS)) {
    const value =
      field === 'useWhen' ? record.useWhen.join(' ')
      : field === 'openQuestions' ? record.openQuestions.join(' ')
      : record[field as 'title' | 'core' | 'motivation' | 'currentConclusion' | 'possibleValue']
    texts[field] = normalizeLexical(value)
  }
  return texts
}

function inScope(record: IdeaSearchRecord, scope: IdeaSearchScope): boolean {
  return scope === 'all' || record.status !== 'archived'
}

/**
 * Rank the in-scope records for one query. The input corpus is untouched;
 * the output is capped at the explicit search limit.
 */
export function searchRecords(
  records: readonly IdeaSearchRecord[],
  query: string,
  scope: IdeaSearchScope,
): IdeaSearchRecord[] {
  const scoped = records.filter(record => inScope(record, scope))
  if (isBlankQuery(query)) {
    return [...scoped]
      .sort((a, b) => recencyThenIdOrder({ updatedAt: a.updatedAt, id: a.ideaId }, { updatedAt: b.updatedAt, id: b.ideaId }))
      .slice(0, IDEA_SEARCH_RESULT_LIMIT)
  }
  const features = extractQueryFeatures(query)
  return scoped
    .map(record => ({ record, score: scoreLexicalFields(searchFieldTexts(record), SEARCH_FIELD_WEIGHTS, features) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || recencyThenIdOrder(
        { updatedAt: a.record.updatedAt, id: a.record.ideaId },
        { updatedAt: b.record.updatedAt, id: b.record.ideaId },
      ))
    .slice(0, IDEA_SEARCH_RESULT_LIMIT)
    .map(entry => entry.record)
}
