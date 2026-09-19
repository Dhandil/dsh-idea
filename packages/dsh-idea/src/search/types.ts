/**
 * Search product types for Idea search: the explicit result cap, the scope
 * selector, and the record shape the pure ranking core reads. Search reads
 * only current versions of stored Ideas — never history, source bodies,
 * evolution events, session history, embeddings, or the network.
 * @module @dsh-external/dsh-idea/src/search/types
 */

import type { IdeaStatus } from '../types.ts'

/**
 * The explicit, tested result cap of one search. There is no pagination:
 * queries surface at most this many rows, ranked.
 */
export const IDEA_SEARCH_RESULT_LIMIT = 100

/** Which stored Ideas a search covers: `current` excludes archived Ideas. */
export type IdeaSearchScope = 'current' | 'all'

/**
 * The searchable current-version projection of one stored Idea. List-shaped
 * content fields are already the stored arrays; ranking joins them.
 */
export interface IdeaSearchRecord {
  ideaId: string
  currentVersionId: string
  status: IdeaStatus
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
  updatedAt: number
}
