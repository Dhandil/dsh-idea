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
import { EvolutionEventId, IdeaId, IdeaVersionId, SourceDiscussionId } from './types.ts'
import type {
  CapturedMessage,
  Idea,
  IdeaAggregate,
  IdeaDraft,
  IdeaEvolutionEvent,
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
export const evolutionEventIdSchema = z.string().min(1).max(IDEA_LIMITS.idMax).transform(EvolutionEventId)

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

/**
 * Durable twin of {@link ideaDraftSchema}: same bounds, no normalization —
 * stored version content was normalized at draft admission and must
 * round-trip byte-identical.
 */
const durableDraftSchema = z.object({
  title: z.string().min(1).max(IDEA_LIMITS.titleMax),
  core: z.string().max(IDEA_LIMITS.fieldMax),
  motivation: z.string().max(IDEA_LIMITS.fieldMax),
  currentConclusion: z.string().max(IDEA_LIMITS.fieldMax),
  possibleValue: z.string().max(IDEA_LIMITS.fieldMax),
  useWhen: durableList,
  openQuestions: durableList,
}) satisfies z.ZodType<IdeaDraft>

export const ideaVersionReasonSchema = z.enum(['initial-save', 'manual-edit', 'continued-discussion'])

export const ideaVersionSchema = z.object({
  versionId: ideaVersionIdSchema,
  ideaId: ideaIdSchema,
  ordinal: z.number().int().positive(),
  draft: durableDraftSchema,
  reason: ideaVersionReasonSchema,
  sourceDiscussionId: sourceDiscussionIdSchema.optional(),
  createdAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<IdeaVersion>

export const ideaEvolutionEventSchema = z.object({
  evolutionEventId: evolutionEventIdSchema,
  ideaId: ideaIdSchema,
  fromVersionId: ideaVersionIdSchema.optional(),
  toVersionId: ideaVersionIdSchema,
  reason: ideaVersionReasonSchema,
  createdAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<IdeaEvolutionEvent>

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
 * A domain-version-1 aggregate document: version content sat flat on the
 * version, citations were an array, and neither versions nor the aggregate
 * carried a reason / evolution events. Detectable by a version without a
 * `draft` object.
 */
interface LegacyAggregateShape {
  idea?: { ideaId?: unknown }
  versions?: unknown
}

/**
 * Migrate a domain-version-1 aggregate document onto the current shape: the
 * flat version content becomes the nested `draft`, the citation array
 * collapses to its single entry, ordinal 1 gains the `initial-save` reason
 * (a legacy history beyond v1 — never produced by a shipped build — reads as
 * `continued-discussion`, matching what the old evolve did: saved from a
 * continued discussion), and one evolution event per version is synthesized
 * with a deterministic bounded id so the causal chain is complete.
 * Current-shape documents pass through untouched.
 */
function migrateLegacyAggregate(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const document = value as LegacyAggregateShape
  if (!Array.isArray(document.versions)) return value
  const versions = document.versions as Array<Record<string, unknown>>
  if (!versions.some(version => typeof version === 'object' && version !== null && !('draft' in version))) {
    return value
  }
  const migrated: Array<Record<string, unknown>> = versions.map((version, index) => {
    const { title, core, motivation, currentConclusion, possibleValue, useWhen, openQuestions, sourceDiscussionIds, ...identity } = version
    const citations = Array.isArray(sourceDiscussionIds) ? sourceDiscussionIds : []
    const reason = index === 0 ? 'initial-save' : 'continued-discussion'
    return {
      ...identity,
      draft: { title, core, motivation, currentConclusion, possibleValue, useWhen, openQuestions },
      reason,
      ...(citations.length > 0 ? { sourceDiscussionId: citations[0] } : {}),
    }
  })
  return {
    ...value,
    versions: migrated,
    evolutionEvents: migrated.map((version, index) => ({
      evolutionEventId: `idea_evo_v${version.ordinal}`,
      ideaId: document.idea?.ideaId,
      ...(index > 0 ? { fromVersionId: migrated[index - 1]!.versionId } : {}),
      toVersionId: version.versionId,
      reason: version.reason,
      createdAt: version.createdAt,
    })),
  }
}

/**
 * The canonical per-Idea record, read at the durable boundary. Domain
 * version 1 records are accepted and migrated onto the current shape (see
 * {@link migrateLegacyAggregate}). Beyond field shapes, the parser enforces
 * the aggregate invariants: at least one version, ordinals exactly `1..N` in
 * order, every version and snapshot owned by this Idea, unique version and
 * snapshot ids, `currentVersionId` pointing at the latest committed version,
 * no version citing a snapshot the aggregate does not carry, and exactly one
 * evolution event per version with resolvable version references.
 */
export const ideaAggregateSchema = z.preprocess(
  migrateLegacyAggregate,
  z.object({
    idea: ideaSchema,
    versions: z.array(ideaVersionSchema).min(1),
    sourceDiscussions: z.array(sourceDiscussionSchema),
    evolutionEvents: z.array(ideaEvolutionEventSchema),
  }).superRefine((aggregate, refine) => {
    const { idea, versions, sourceDiscussions, evolutionEvents } = aggregate

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
      if (version.sourceDiscussionId !== undefined && !seenDiscussionIds.has(version.sourceDiscussionId)) {
        refine.addIssue({
          code: 'custom',
          path: ['versions', index, 'sourceDiscussionId'],
          message: `version '${version.versionId}' cites absent source discussion '${version.sourceDiscussionId}'`,
        })
      }
    })

    const seenEventIds = new Set<string>()
    const eventsPerVersion = new Map<string, number>()
    evolutionEvents.forEach((event, index) => {
      if (event.ideaId !== idea.ideaId) {
        refine.addIssue({
          code: 'custom',
          path: ['evolutionEvents', index, 'ideaId'],
          message: `evolution event '${event.evolutionEventId}' belongs to idea '${event.ideaId}', not '${idea.ideaId}'`,
        })
      }
      if (seenEventIds.has(event.evolutionEventId)) {
        refine.addIssue({
          code: 'custom',
          path: ['evolutionEvents', index, 'evolutionEventId'],
          message: `duplicate evolution event id '${event.evolutionEventId}'`,
        })
      }
      seenEventIds.add(event.evolutionEventId)
      if (!seenVersionIds.has(event.toVersionId)) {
        refine.addIssue({
          code: 'custom',
          path: ['evolutionEvents', index, 'toVersionId'],
          message: `evolution event '${event.evolutionEventId}' points at absent version '${event.toVersionId}'`,
        })
      }
      eventsPerVersion.set(event.toVersionId, (eventsPerVersion.get(event.toVersionId) ?? 0) + 1)
      if (event.fromVersionId !== undefined && !seenVersionIds.has(event.fromVersionId)) {
        refine.addIssue({
          code: 'custom',
          path: ['evolutionEvents', index, 'fromVersionId'],
          message: `evolution event '${event.evolutionEventId}' cites absent predecessor '${event.fromVersionId}'`,
        })
      }
    })

    for (const [versionId, count] of eventsPerVersion) {
      if (count > 1) {
        refine.addIssue({
          code: 'custom',
          path: ['evolutionEvents'],
          message: `version '${versionId}' has ${count} evolution events, expected exactly one`,
        })
      }
    }
    versions.forEach((version) => {
      if (!eventsPerVersion.has(version.versionId)) {
        refine.addIssue({
          code: 'custom',
          path: ['evolutionEvents'],
          message: `version '${version.versionId}' has no evolution event`,
        })
      }
    })
  }),
) satisfies z.ZodType<IdeaAggregate>
