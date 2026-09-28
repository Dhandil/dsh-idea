/**
 * The shared canonical candidate projection: one stored Idea's pinned
 * current version projected into the resurfacing business candidate shape.
 * Extracted verbatim from the T10 Host service (§21) so the lexical and
 * semantic branches read the exact same business fields from canonical
 * state — the extraction is semantics-preserving and every downstream T10
 * behavior (scoring, floor, suppression vocabulary, Judge input) is
 * unchanged.
 * @module @dsh-external/dsh-idea/src/resurfacing/candidate
 */

import type { IdeaAggregate, IdeaCurrentView } from '../types.ts'
import type { ResurfacingCandidate } from './types.ts'

/** The detached resurfacing candidate one stored Idea contributes. */
export function candidateOf(view: IdeaCurrentView, aggregate: IdeaAggregate, sessionId: string): ResurfacingCandidate {
  return {
    ideaId: view.idea.ideaId,
    evaluatedVersionId: view.idea.currentVersionId,
    title: view.currentVersion.draft.title,
    core: view.currentVersion.draft.core,
    motivation: view.currentVersion.draft.motivation,
    currentConclusion: view.currentVersion.draft.currentConclusion,
    possibleValue: view.currentVersion.draft.possibleValue,
    useWhen: [...view.currentVersion.draft.useWhen],
    openQuestions: [...view.currentVersion.draft.openQuestions],
    updatedAt: view.idea.updatedAt,
    score: 0,
    status: view.idea.status,
    createdInConversation: aggregate.sourceDiscussions.some(discussion => discussion.sessionId === sessionId),
  }
}
