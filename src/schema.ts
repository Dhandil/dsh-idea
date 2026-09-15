/**
 * Zod schemas of the Idea domain. Draft schemas validate prepared user input
 * at the service boundary (normalizing/trimming, bounded) before anything is
 * persisted; record schemas validate what the durable medium may hold — the
 * storage-domain layer runs them at the durable read boundary, so a stored
 * aggregate that violates the model's invariants fails its domain open
 * instead of surfacing as corrupt state. Identifier fields round-trip through
 * transforms so the parsed output carries the branded types.
 * @module @dsh-external/dsh-idea/src/schema
 */

import { z } from 'zod'
import { IdeaId, IdeaVersionId, SourceDiscussionId } from './types.ts'
import type {
  CapturedMessage,
  Idea,
  IdeaAggregate,
  IdeaDraft,
  IdeaVersion,
  SourceDiscussion,
  SourceDiscussionDraft,
} from './types.ts'

/**
 * Persisted-content bounds. V1 snapshots are already prepared semantic data:
 * bounded arrays of bounded non-empty strings, no unbounded session history.
 */
export const IDEA_LIMITS = {
  /** Longest normalized title. */
  titleMax: 200,
  /** Longest normalized free-text field (core, motivation, conclusions, …). */
  fieldMax: 20_000,
  /** Longest bounded string array (useWhen, openQuestions). */
  listMax: 20,
  /** Longest single item inside a bounded string array. */
  listItemMax: 2_000,
  /** Most captured messages one source snapshot may hold. */
  capturedMessagesMax: 200,
  /** Longest single captured message text. */
  capturedMessageTextMax: 20_000,
  /** Longest session / message identifier. */
  idMax: 200,
} as const

export const ideaIdSchema = z.string().min(1).max(IDEA_LIMITS.idMax).transform(IdeaId)
export const ideaVersionIdSchema = z.string().min(1).max(IDEA_LIMITS.idMax).transform(IdeaVersionId)
export const sourceDiscussionIdSchema = z.string().min(1).max(IDEA_LIMITS.idMax).transform(SourceDiscussionId)

const requiredText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max)
/** Optional, bounded, non-empty when present. */
const optionalIdText = optionalText(IDEA_LIMITS.idMax).refine(value => value.length > 0, 'must be non-empty when present')
const boundedList = z.array(z.string().trim().min(1).max(IDEA_LIMITS.listItemMax)).max(IDEA_LIMITS.listMax)
/**
 * Durable twin of {@link boundedList}: same bounds, no normalization — stored
 * data was normalized at draft admission and must round-trip byte-identical.
 */
const durableList = z.array(z.string().min(1).max(IDEA_LIMITS.listItemMax)).max(IDEA_LIMITS.listMax)

/**
 * Prepared semantic input for one save. `title`, `core`, and `motivation`
 * must be non-empty after trimming; every string field is normalized;
 * arrays are bounded and hold non-empty strings only. Invalid input is
 * rejected before persistence is attempted.
 */
export const ideaDraftSchema = z.object({
  title: requiredText(IDEA_LIMITS.titleMax),
  core: requiredText(IDEA_LIMITS.fieldMax),
  motivation: requiredText(IDEA_LIMITS.fieldMax),
  currentConclusion: optionalText(IDEA_LIMITS.fieldMax),
  possibleValue: optionalText(IDEA_LIMITS.fieldMax),
  useWhen: boundedList,
  openQuestions: boundedList,
}) satisfies z.ZodType<IdeaDraft>

export const capturedMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: requiredText(IDEA_LIMITS.capturedMessageTextMax),
}) satisfies z.ZodType<CapturedMessage>

/**
 * Prepared source-snapshot input. Captured context holds at least one and at
 * most {@link IDEA_LIMITS.capturedMessagesMax} user/assistant messages —
 * hidden system prompts, tool bodies, and unbounded history never enter the
 * model because only those two roles exist here.
 */
export const sourceDiscussionDraftSchema = z.object({
  sessionId: requiredText(IDEA_LIMITS.idMax),
  anchorMessageId: optionalIdText.optional(),
  startSeq: z.number().int().nonnegative().optional(),
  endSeq: z.number().int().nonnegative().optional(),
  capturedContext: z.array(capturedMessageSchema).min(1).max(IDEA_LIMITS.capturedMessagesMax),
}) satisfies z.ZodType<SourceDiscussionDraft>

export const ideaSchema = z.object({
  ideaId: ideaIdSchema,
  currentVersionId: ideaVersionIdSchema,
  status: z.enum(['active', 'dormant', 'archived']),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<Idea>

export const ideaVersionSchema = z.object({
  versionId: ideaVersionIdSchema,
  ideaId: ideaIdSchema,
  ordinal: z.number().int().positive(),
  title: z.string().min(1).max(IDEA_LIMITS.titleMax),
  core: z.string().max(IDEA_LIMITS.fieldMax),
  motivation: z.string().max(IDEA_LIMITS.fieldMax),
  currentConclusion: z.string().max(IDEA_LIMITS.fieldMax),
  possibleValue: z.string().max(IDEA_LIMITS.fieldMax),
  useWhen: durableList,
  openQuestions: durableList,
  sourceDiscussionIds: z.array(sourceDiscussionIdSchema),
  createdAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<IdeaVersion>

export const sourceDiscussionSchema = z.object({
  sourceDiscussionId: sourceDiscussionIdSchema,
  ideaId: ideaIdSchema,
  sessionId: z.string().min(1).max(IDEA_LIMITS.idMax),
  anchorMessageId: z.string().min(1).optional(),
  startSeq: z.number().int().nonnegative().optional(),
  endSeq: z.number().int().nonnegative().optional(),
  capturedContext: z.array(capturedMessageSchema).min(1).max(IDEA_LIMITS.capturedMessagesMax),
  capturedAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<SourceDiscussion>

/**
 * The canonical per-Idea record. Beyond field shapes, the parser enforces the
 * aggregate invariants: at least one version, ordinals exactly `1..N` in
 * order, every version and snapshot owned by this Idea, unique version and
 * snapshot ids, `currentVersionId` pointing at the latest committed version,
 * and no version citing a snapshot the aggregate does not carry.
 */
export const ideaAggregateSchema = z.object({
  idea: ideaSchema,
  versions: z.array(ideaVersionSchema).min(1),
  sourceDiscussions: z.array(sourceDiscussionSchema),
}).superRefine((aggregate, refine) => {
  const { idea, versions, sourceDiscussions } = aggregate

  const seenVersionIds = new Set<string>()
  versions.forEach((version, index) => {
    if (version.ideaId !== idea.ideaId) {
      refine.addIssue({
        code: 'custom',
        path: ['versions', index, 'ideaId'],
        message: `version '${version.versionId}' belongs to idea '${version.ideaId}', not '${idea.ideaId}'`,
      })
    }
    if (version.ordinal !== index + 1) {
      refine.addIssue({
        code: 'custom',
        path: ['versions', index, 'ordinal'],
        message: `version '${version.versionId}' has ordinal ${version.ordinal}, expected ${index + 1}`,
      })
    }
    if (seenVersionIds.has(version.versionId)) {
      refine.addIssue({
        code: 'custom',
        path: ['versions', index, 'versionId'],
        message: `duplicate version id '${version.versionId}'`,
      })
    }
    seenVersionIds.add(version.versionId)
  })

  const latest = versions[versions.length - 1]
  if (latest !== undefined && idea.currentVersionId !== latest.versionId) {
    refine.addIssue({
      code: 'custom',
      path: ['idea', 'currentVersionId'],
      message: `currentVersionId '${idea.currentVersionId}' does not point at the latest version '${latest.versionId}'`,
    })
  }

  const seenDiscussionIds = new Set<string>()
  sourceDiscussions.forEach((discussion, index) => {
    if (discussion.ideaId !== idea.ideaId) {
      refine.addIssue({
        code: 'custom',
        path: ['sourceDiscussions', index, 'ideaId'],
        message: `source discussion '${discussion.sourceDiscussionId}' belongs to idea '${discussion.ideaId}', not '${idea.ideaId}'`,
      })
    }
    if (seenDiscussionIds.has(discussion.sourceDiscussionId)) {
      refine.addIssue({
        code: 'custom',
        path: ['sourceDiscussions', index, 'sourceDiscussionId'],
        message: `duplicate source discussion id '${discussion.sourceDiscussionId}'`,
      })
    }
    seenDiscussionIds.add(discussion.sourceDiscussionId)
  })

  versions.forEach((version, index) => {
    version.sourceDiscussionIds.forEach((discussionId, refIndex) => {
      if (!seenDiscussionIds.has(discussionId)) {
        refine.addIssue({
          code: 'custom',
          path: ['versions', index, 'sourceDiscussionIds', refIndex],
          message: `version '${version.versionId}' cites absent source discussion '${discussionId}'`,
        })
      }
    })
  })
}) satisfies z.ZodType<IdeaAggregate>
