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
import { EvolutionEventId, IdeaDiscussionId, IdeaId, IdeaVersionId, SourceDiscussionId } from './types.ts'
import type {
  CapturedMessage,
  Idea,
  IdeaAggregate,
  IdeaContinuationContext,
  IdeaDiscussion,
  IdeaDraft,
  IdeaEvolutionEvent,
  IdeaHistorySummaryEntry,
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
export const ideaDiscussionIdSchema = z.string().min(1).max(IDEA_LIMITS.idMax).transform(IdeaDiscussionId)

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
  sourceDiscussionIds: z.array(sourceDiscussionIdSchema),
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
 * Migrate one stored version element onto the canonical version-3 shape.
 * Identity, draft, reason, and timestamps pass through untouched; only the
 * provenance field is normalized:
 *
 * - domain version 1 (no `draft`): the flat content is wrapped in a draft
 *   and the full `sourceDiscussionIds` citation array is preserved in order;
 * - domain version 2 (`sourceDiscussionId`): the singular citation becomes a
 *   one-element array, absent becomes `[]`;
 * - domain version 3 (plural already present): passes through untouched.
 */
function migrateVersionElement(version: Record<string, unknown>, index: number): Record<string, unknown> {
  if ('draft' in version) {
    if ('sourceDiscussionIds' in version) return version
    const { sourceDiscussionId, ...rest } = version
    return {
      ...rest,
      sourceDiscussionIds: sourceDiscussionId !== undefined ? [sourceDiscussionId] : [],
    }
  }
  const { title, core, motivation, currentConclusion, possibleValue, useWhen, openQuestions, sourceDiscussionIds, ...identity } = version
  const citations = Array.isArray(sourceDiscussionIds) ? sourceDiscussionIds : []
  const reason = index === 0 ? 'initial-save' : 'continued-discussion'
  return {
    ...identity,
    draft: { title, core, motivation, currentConclusion, possibleValue, useWhen, openQuestions },
    reason,
    sourceDiscussionIds: citations,
  }
}

/** The per-version v1 flat-content detector: a version without a `draft`. */
function isLegacyFlatVersion(version: unknown): version is Record<string, unknown> {
  return typeof version === 'object' && version !== null && !('draft' in version)
}

/**
 * Migrate a stored aggregate document onto the canonical version-3 shape.
 * A domain-version-1 document (any flat version) is migrated in full: flat
 * content becomes the nested `draft`, the citation array is preserved in
 * full and in order (never folded to one element), ordinal 1 gains the
 * `initial-save` reason (a legacy history beyond v1 — never produced by a
 * shipped build — reads as `continued-discussion`, matching what the old
 * evolve did: saved from a continued discussion), and one evolution event
 * per version is synthesized with a deterministic bounded id so the causal
 * chain is complete. A domain-version-2 document has only its singular —
 * or absent — provenance normalized to the plural array (`[id]` / `[]`).
 * Current-shape documents pass through untouched, so migration is
 * idempotent.
 */
function migrateLegacyAggregate(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const document = value as LegacyAggregateShape
  if (!Array.isArray(document.versions)) return value
  const versions = document.versions as Array<Record<string, unknown>>
  const migrated = versions.map((version, index) => migrateVersionElement(version, index))
  if (!versions.some(isLegacyFlatVersion)) {
    const changed = migrated.some((version, index) => version !== versions[index])
    return changed ? { ...value, versions: migrated } : value
  }
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
 * version 1 and 2 records are accepted and migrated onto the current
 * version-3 shape (see {@link migrateLegacyAggregate}); the migration never
 * discards a valid provenance citation. Beyond field shapes, the parser
 * enforces the aggregate invariants: at least one version, ordinals exactly
 * `1..N` in order, every version and snapshot owned by this Idea, unique
 * version and snapshot ids, `currentVersionId` pointing at the latest
 * committed version, no version citing a snapshot the aggregate does not
 * carry, and exactly one evolution event per version with resolvable
 * version references.
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
      version.sourceDiscussionIds.forEach((discussionId, citationIndex) => {
        if (!seenDiscussionIds.has(discussionId)) {
          refine.addIssue({
            code: 'custom',
            path: ['versions', index, 'sourceDiscussionIds', citationIndex],
            message: `version '${version.versionId}' cites absent source discussion '${discussionId}'`,
          })
        }
      })
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

/**
 * The history digest rows of a continuation context. Identity-only by
 * construction — the durable boundary rejects any entry that carries more
 * than ordinal/reason/title/createdAt, so a transcript can never hide here.
 */
const ideaHistorySummaryEntrySchema = z.object({
  ordinal: z.number().int().positive(),
  reason: ideaVersionReasonSchema,
  title: z.string().min(1).max(IDEA_LIMITS.titleMax),
  createdAt: z.number().int().nonnegative(),
}) satisfies z.ZodType<IdeaHistorySummaryEntry>

/**
 * The context seed of one continued discussion, read at the durable
 * boundary. The draft rides {@link durableDraftSchema} (stored content
 * round-trips byte-identical); the summary and questions are plain bounded
 * lists; no message transcript field exists to accept one.
 */
const ideaContinuationContextSchema = z.object({
  type: z.literal('idea-continuation'),
  idea: z.object({
    id: ideaIdSchema,
    title: z.string().min(1).max(IDEA_LIMITS.titleMax),
    currentVersion: ideaVersionIdSchema,
    draft: durableDraftSchema,
    historySummary: z.array(ideaHistorySummaryEntrySchema),
    openQuestions: durableList,
  }),
}) satisfies z.ZodType<IdeaContinuationContext>

/** One durable continued-discussion record over the `discussions` table. */
export const ideaDiscussionSchema = z.object({
  discussionId: ideaDiscussionIdSchema,
  ideaId: ideaIdSchema,
  conversationId: z.string().min(1).max(IDEA_LIMITS.idMax),
  baseVersionId: ideaVersionIdSchema,
  status: z.enum(['active', 'completed']),
  createdAt: z.number().int().nonnegative(),
  context: ideaContinuationContextSchema,
}) satisfies z.ZodType<IdeaDiscussion>
