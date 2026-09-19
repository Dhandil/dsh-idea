/**
 * Wire vocabulary of the `idea` Remote namespace. Request and result shapes
 * are JSON-representable and re-exported through this package's non-root
 * `./remote-host` subpath, which is where the Typert generator anchors the
 * generated client's type imports. `SourceDiscussionDraft` is deliberately
 * absent: canonical source provenance never crosses the wire.
 * @module @dsh-external/dsh-idea/src/remote-host/types
 */

import type { IdeaDraft, IdeaEvolutionReason, IdeaId, IdeaStatus, IdeaVersionId, IdeaVersionReason } from '../types.ts'
import type { IdeaPreparationId, IdeaPreparationPreview } from '../preparation/types.ts'

export type {
  IdeaDraft,
  IdeaEvolutionReason,
  IdeaId,
  IdeaPreparationId,
  IdeaPreparationPreview,
  IdeaStatus,
  IdeaVersionId,
  IdeaVersionReason,
}

/** `idea.prepareFromMessage` request: the finalized assistant message to propose from. */
export interface IdeaPrepareRequest {
  /** The Session the discussion lives in. */
  sessionId: string
  /** The assistant message the user explicitly chose. */
  messageId: string
}

/** `idea.create` request: the chosen preparation plus the user-edited draft. */
export interface IdeaCreateRequest {
  /** The opaque preparation reference returned by `prepareFromMessage`. */
  preparationId: IdeaPreparationId
  /** The user-edited semantic draft. Source provenance is Host-owned. */
  draft: IdeaDraft
}

/** `idea.create` result: the durable Idea identity the commit produced. */
export interface IdeaCreateResult {
  ideaId: IdeaId
  currentVersionId: IdeaVersionId
  status: 'active'
  title: string
  createdAt: number
}

/** `idea.get` request: the Idea to read. */
export interface IdeaGetRequest {
  id: string
}

/**
 * The read-only summary of one Idea's current version — the base of the
 * `idea.get` detail. Storage records never cross the wire; this is the
 * projection the web client may see. `source` cites the conversation
 * snapshot the current version was saved from, absent when the version
 * cites none.
 */
export interface IdeaSummary {
  id: string
  status: IdeaStatus
  title: string
  core: string
  motivation: string
  createdAt: number
  updatedAt: number
  source?: {
    sessionId: string
    anchorMessageId?: string
  }
}

/** `idea.list` request: which library view to project. */
export interface IdeaListRequest {
  /**
   * `current` projects every non-archived Idea (active + dormant);
   * `archived` projects archived Ideas only. No deleted view exists.
   */
  view: 'current' | 'archived'
}

/**
 * One row of the `idea.list` result — the lightweight index projection the
 * library list and its hover preview card render. Carries exactly the
 * fields the row and the preview need (identity, status, current-version
 * pointer, title, one-line core, current conclusion, use-when entries for
 * the bounded preview, the open-question count) and never the full history,
 * the remaining draft fields, or any captured source body.
 */
export interface IdeaListRow {
  id: string
  status: IdeaStatus
  currentVersionId: string
  title: string
  core: string
  currentConclusion: string
  useWhen: readonly string[]
  openQuestionsCount: number
  updatedAt: number
}

/**
 * The full read-only view of one Idea's current version — the `idea.get`
 * result: the summary plus the version's remaining semantic content and the
 * version identity it was read at.
 */
export interface IdeaDetail extends IdeaSummary {
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
  versionId: IdeaVersionId
}

/** `idea.getVersion` request: one Idea plus one of its versions. */
export interface IdeaVersionGetRequest {
  /** The Idea the version belongs to. */
  id: string
  /** The requested version. */
  versionId: string
}

/**
 * One entry of the `idea.getVersions` history — a version's identity, why it
 * exists, and its title: everything the minimal history UI renders. Storage
 * records never cross the wire.
 */
export interface IdeaVersionSummary {
  id: IdeaVersionId
  ordinal: number
  reason: IdeaVersionReason
  title: string
  createdAt: number
}

/**
 * `idea.getVersion` result: the full immutable content of one committed
 * version, over its summary.
 */
export interface IdeaVersionDetail extends IdeaVersionSummary {
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
}

/** `idea.continueDiscussion` request: the Idea to continue. */
export interface IdeaContinueDiscussionRequest {
  /** The Idea whose current version seeds the new discussion. */
  id: string
  /**
   * The Workspace the continuation conversation should be created in. The
   * browser only names a Workspace — the Host turns it into a canonical
   * Session through the Harness Session Controller, which validates the
   * Workspace, creates the Session, and attaches it. Absent lets the Host
   * create its unbound default conversation. The browser never nominates
   * the Session itself.
   */
  workspaceId?: string
}

/**
 * `idea.continueDiscussion` result: the reused or newly created discussion
 * workspace and the conversation that carries it. The context seed stays
 * Host-side — only identities cross the wire.
 */
export interface IdeaContinueDiscussionResult {
  discussionId: string
  conversationId: string
  /** The Idea version the discussion was created from. */
  baseVersionId: string
}

/** `idea.prepareEvolution` request: the continued discussion to evolve from. */
export interface IdeaPrepareEvolutionRequest {
  discussionId: string
}

/**
 * The preview returned by `idea.prepareEvolution`: the opaque proposal
 * reference, the version the proposal was prepared against, and the
 * proposed draft. Preparation never writes durable Idea state.
 */
export interface IdeaEvolutionProposalPreview {
  proposalId: string
  /** The Idea the proposal belongs to. */
  ideaId: string
  /** The version the proposal was prepared against. */
  baseVersionId: string
  reason: IdeaEvolutionReason
  draft: IdeaDraft
}

/** `idea.commitEvolution` request: the approved proposal plus the draft to commit. */
export interface IdeaCommitEvolutionRequest {
  /** The opaque proposal reference returned by `prepareEvolution`. */
  proposalId: string
  /** The current version the client last saw; a mismatch rejects the commit. */
  expectedCurrentVersionId: string
  /** The user-approved draft. Source provenance is Host-owned. */
  draft: IdeaDraft
}

/**
 * `idea.commitEvolution` result: the new current version the commit
 * appended. Historical versions are immutable and never rewritten.
 */
export interface IdeaCommitEvolutionResult {
  ideaId: string
  currentVersionId: string
  ordinal: number
  title: string
  status: 'active'
}

/** `idea.relatedFromMessage` request: the finalized assistant message to judge from. */
export interface IdeaRelatedRequest {
  /** The Session the discussion lives in. */
  sessionId: string
  /** The assistant message the user explicitly chose. */
  messageId: string
}

/** `idea.manualEdit` request: the user-authored draft plus the version the editor opened against. */
export interface IdeaManualEditRequest {
  /** The Idea to edit. */
  id: string
  /** The current version the editor opened at; a mismatch rejects the commit. */
  expectedCurrentVersionId: string
  /** The user-authored draft. Source provenance is Host-owned. */
  draft: IdeaDraft
}

/**
 * `idea.manualEdit` result: the canonical current version after the edit and
 * whether a semantic change was actually committed. `committed: false` marks
 * a normalized no-op — zero durable writes, the current version untouched.
 */
export interface IdeaManualEditResult {
  ideaId: string
  currentVersionId: string
  ordinal: number
  title: string
  status: IdeaStatus
  committed: boolean
}

/** `idea.archive` request: the Idea to archive, at the caller's current version. */
export interface IdeaArchiveRequest {
  id: string
  expectedCurrentVersionId: string
}

/** `idea.restore` request: the archived Idea to restore, at the caller's current version. */
export interface IdeaRestoreRequest {
  id: string
  expectedCurrentVersionId: string
}

/** `idea.deleteIdea` request: the Idea to remove permanently, at the caller's current version. */
export interface IdeaDeleteRequest {
  id: string
  expectedCurrentVersionId: string
}

/**
 * The canonical state an archive/restore produced — enough for the client to
 * refresh safely (the idea id, the version the status flip happened at, the
 * resulting status, and the new update time).
 */
export interface IdeaLifecycleResult {
  ideaId: string
  currentVersionId: string
  status: IdeaStatus
  updatedAt: number
}

/** `idea.deleteIdea` result: the permanently removed idea's id. */
export interface IdeaDeleteResult {
  ideaId: string
}

/**
 * One row of the `idea.relatedFromMessage` result: the Host-resolved
 * canonical Idea identity and current-version content plus the model's
 * reason. Canonical fields never come from the model.
 */
export interface IdeaRelatedMatch {
  idea: {
    id: string
    currentVersionId: string
    title: string
    core: string
    updatedAt: number
  }
  whyUsefulNow: string
  /** The canonical pinned reference descriptor, Host-owned. */
  reference: IdeaReferenceDescriptor
}

/**
 * `idea.relatedFromMessage` result: zero to three matches, in model order.
 * An empty candidate corpus and a zero-match judgment are both successes.
 */
export interface IdeaRelatedResult {
  items: readonly IdeaRelatedMatch[]
}

/** The wire descriptor of one pinned Idea version: identity plus mention. */
export interface IdeaReferenceDescriptor {
  ideaId: string
  versionId: string
  /** The display title at listing (or pin) time. */
  label: string
  /** The canonical `@[label](dsh-idea:...)` mention text. */
  mention: string
}

/** Which stored Ideas a search covers: `current` excludes archived Ideas. */
export type IdeaSearchScope = 'current' | 'all'

/** `idea.search` request: the user's query and the library scope. */
export interface IdeaSearchRequest {
  query: string
  scope: IdeaSearchScope
}

/**
 * One row of the `idea.search` result — the lightweight search projection,
 * ranked Host-side. Carries exactly the fields the search row renders plus
 * the canonical pinned reference descriptor for one-tap attachment; never
 * the full history, the remaining draft fields, or any captured source body.
 */
export interface IdeaSearchResult {
  id: string
  status: IdeaStatus
  currentVersionId: string
  title: string
  core: string
  currentConclusion: string
  useWhen: readonly string[]
  openQuestionsCount: number
  updatedAt: number
  reference: IdeaReferenceDescriptor
}
