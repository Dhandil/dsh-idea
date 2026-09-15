/**
 * Frozen domain model of the Idea feature. An Idea is a long-term,
 * user-owned possibility / hypothesis / direction / opportunity that evolves
 * over time through explicit user-triggered saves. One Idea is one canonical
 * aggregate record: the idea header, its immutable append-only version
 * history, the evolution events explaining each version, and the
 * source-discussion snapshots its versions cite.
 * @module @dsh-external/dsh-idea/src/types
 */

declare const brand: unique symbol

/** Branded string id of one Idea aggregate. */
export type IdeaId = string & { readonly [brand]: 'IdeaId' }
/** Branded string id of one immutable Idea version. */
export type IdeaVersionId = string & { readonly [brand]: 'IdeaVersionId' }
/** Branded string id of one captured source-discussion snapshot. */
export type SourceDiscussionId = string & { readonly [brand]: 'SourceDiscussionId' }
/** Branded string id of one recorded evolution event. */
export type EvolutionEventId = string & { readonly [brand]: 'EvolutionEventId' }
/** Branded string id of one continued-discussion workspace. */
export type IdeaDiscussionId = string & { readonly [brand]: 'IdeaDiscussionId' }

export function IdeaId(value: string): IdeaId {
  return value as IdeaId
}

export function IdeaVersionId(value: string): IdeaVersionId {
  return value as IdeaVersionId
}

export function SourceDiscussionId(value: string): SourceDiscussionId {
  return value as SourceDiscussionId
}

export function EvolutionEventId(value: string): EvolutionEventId {
  return value as EvolutionEventId
}

export function IdeaDiscussionId(value: string): IdeaDiscussionId {
  return value as IdeaDiscussionId
}

/** Lifecycle of one Idea. `archived` is retrieval filtering, never deletion. */
export type IdeaStatus = 'active' | 'dormant' | 'archived'

/** The durable header of one Idea aggregate. */
export interface Idea {
  ideaId: IdeaId
  currentVersionId: IdeaVersionId
  status: IdeaStatus
  createdAt: number
  updatedAt: number
}

/**
 * Why one version was committed. Version answers "what is the Idea now";
 * the paired {@link IdeaEvolutionEvent} answers "why did it become this".
 */
export type IdeaVersionReason =
  /** The Idea's first save. */
  | 'initial-save'
  /** The user edited the content and saved it as a new version. */
  | 'manual-edit'
  /** The discussion continued and produced the next version. */
  | 'continued-discussion'

/** The reasons an existing Idea may evolve with; v1 is always `initial-save`. */
export type IdeaEvolutionReason = Exclude<IdeaVersionReason, 'initial-save'>

/** One immutable committed version of an Idea's semantic content. */
export interface IdeaVersion {
  versionId: IdeaVersionId
  ideaId: IdeaId
  /** 1-based position in the linear history; strictly increasing, no gaps. */
  ordinal: number
  /** The version's immutable semantic content, snapshotted at commit time. */
  draft: IdeaDraft
  /** Why this version exists. */
  reason: IdeaVersionReason
  /** The source snapshot this version was saved from, absent when none was captured. */
  sourceDiscussionId?: SourceDiscussionId
  createdAt: number
}

/** One captured user/assistant exchange used as an Idea's source context. */
export interface CapturedMessage {
  role: 'user' | 'assistant'
  text: string
}

/** A snapshot of the discussion an Idea version was saved from. */
export interface SourceDiscussion {
  sourceDiscussionId: SourceDiscussionId
  ideaId: IdeaId
  sessionId: string
  anchorMessageId?: string
  startSeq?: number
  endSeq?: number
  capturedContext: readonly CapturedMessage[]
  capturedAt: number
}

/**
 * One recorded reason the Idea became a version: the causal counterpart of
 * {@link IdeaVersion}. `fromVersionId` is absent for the initial save;
 * every version has exactly one event pointing at it.
 */
export interface IdeaEvolutionEvent {
  evolutionEventId: EvolutionEventId
  ideaId: IdeaId
  /** The version this evolution superseded; absent for the initial save. */
  fromVersionId?: IdeaVersionId
  toVersionId: IdeaVersionId
  reason: IdeaVersionReason
  createdAt: number
}

/** One summary row of a continued discussion's version-history digest. */
export interface IdeaHistorySummaryEntry {
  ordinal: number
  reason: IdeaVersionReason
  title: string
  createdAt: number
}

/**
 * The context seed one continued discussion's conversation starts from: the
 * current version in full, a bounded history digest, and the unresolved
 * questions. Deliberately transcript-free — no captured messages and no
 * unrelated conversation data ever enter it.
 */
export interface IdeaContinuationContext {
  type: 'idea-continuation'
  idea: {
    id: IdeaId
    title: string
    /** The version the discussion was created from. */
    currentVersion: IdeaVersionId
    /** The current version's full draft. */
    draft: IdeaDraft
    /** The whole history as identity rows, v1 first; no message bodies. */
    historySummary: readonly IdeaHistorySummaryEntry[]
    /** The current draft's unresolved questions. */
    openQuestions: readonly string[]
  }
}

/**
 * One continued-discussion workspace: the durable link between an Idea (at
 * the version it was created from) and the new conversation that continues
 * it. Creating a discussion never mutates the Idea; completing one is a
 * later lifecycle step, never an Idea write.
 */
export interface IdeaDiscussion {
  discussionId: IdeaDiscussionId
  ideaId: IdeaId
  /** The conversation created for (or reused by) this discussion. */
  conversationId: string
  /** The Idea version the discussion was created from. */
  baseVersionId: IdeaVersionId
  status: 'active' | 'completed'
  createdAt: number
  /** The context seed the conversation starts from. */
  context: IdeaContinuationContext
}

/**
 * The single canonical record persisted per Idea: header plus the complete
 * immutable linear history plus every source-discussion snapshot plus the
 * evolution events. One save (create or evolve) is one record put or update
 * — the current Harness storage-domain has no cross-table transactions.
 */
export interface IdeaAggregate {
  idea: Idea
  versions: readonly IdeaVersion[]
  sourceDiscussions: readonly SourceDiscussion[]
  /** The complete causal chain: exactly one event per version, in creation order. */
  evolutionEvents: readonly IdeaEvolutionEvent[]
}

/** Prepared semantic input for one Idea version. No model calls in V1 T1. */
export interface IdeaDraft {
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
}

/** Prepared source-snapshot input captured alongside a save. */
export interface SourceDiscussionDraft {
  sessionId: string
  anchorMessageId?: string
  startSeq?: number
  endSeq?: number
  capturedContext: readonly CapturedMessage[]
}

/** The current-Idea/current-version listing view of one Idea. */
export interface IdeaCurrentView {
  idea: Idea
  currentVersion: IdeaVersion
}

/** Listing options: archived Ideas are excluded unless explicitly included. */
export interface ListIdeasOptions {
  includeArchived?: boolean
}
