/**
 * The bounded model projection of referenced Ideas: the payload cap, the
 * per-message reference cap, and the deterministic degradation along the
 * shared preservation priority. Identity and title sit above every tier and
 * always survive; from lowest to highest (possibleValue → motivation →
 * openQuestions → useWhen → currentConclusion → core) each tier walks its
 * budget ladder to zero before a higher tier loses anything.
 * @module @dsh-external/dsh-idea/src/reference/projection
 */

import { boundedList, boundedText, IDEA_FIELD_BUDGET_LADDER, IDEA_FIELD_DEGRADATION_ORDER, projectWithinBudget } from '../retrieval/budget.ts'
import type { ReferencedIdeaProjection } from './types.ts'

/**
 * The serialized-size cap of the whole referenced-Ideas payload in one
 * recall context.
 */
export const IDEA_REFERENCE_PAYLOAD_LIMIT = 48_000

/** The maximum number of referenced Ideas carried by one direct message. */
export const MAX_IDEA_REFERENCES = 5

type DegradableField = (typeof IDEA_FIELD_DEGRADATION_ORDER)[number]

/** One stored Idea version's readable, bounded projection input. */
export interface ReferencedIdeaInput {
  ideaId: string
  versionId: string
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
}

function projectOne(
  record: ReferencedIdeaInput,
  budgetOf: (field: DegradableField) => number,
): ReferencedIdeaProjection {
  const projection: ReferencedIdeaProjection = {
    ideaId: record.ideaId,
    versionId: record.versionId,
    title: record.title,
  }
  const core = boundedText(record.core, budgetOf('core'))
  if (core.length > 0) projection.core = core
  const motivation = boundedText(record.motivation, budgetOf('motivation'))
  if (motivation.length > 0) projection.motivation = motivation
  const currentConclusion = boundedText(record.currentConclusion, budgetOf('currentConclusion'))
  if (currentConclusion.length > 0) projection.currentConclusion = currentConclusion
  const possibleValue = boundedText(record.possibleValue, budgetOf('possibleValue'))
  if (possibleValue.length > 0) projection.possibleValue = possibleValue
  const useWhen = boundedList(record.useWhen, budgetOf('useWhen'))
  if (useWhen.length > 0) projection.useWhen = useWhen
  const openQuestions = boundedList(record.openQuestions, budgetOf('openQuestions'))
  if (openQuestions.length > 0) projection.openQuestions = openQuestions
  return projection
}

/**
 * Project the referenced Ideas onto the bounded recall payload. Identity,
 * versionId, and title always survive; content tiers degrade deterministically
 * along the shared priority until the serialized payload fits. The output
 * order is the caller's reference order.
 */
export function projectReferencedIdeas(
  records: readonly ReferencedIdeaInput[],
): readonly ReferencedIdeaProjection[] {
  return projectWithinBudget<DegradableField, ReferencedIdeaProjection>({
    order: IDEA_FIELD_DEGRADATION_ORDER,
    ladder: IDEA_FIELD_BUDGET_LADDER,
    project: budgetOf => records.map(record => projectOne(record, budgetOf)),
    limit: IDEA_REFERENCE_PAYLOAD_LIMIT,
  })
}
