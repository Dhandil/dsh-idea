/**
 * Wire vocabulary of the `idea` Remote namespace. Request and result shapes
 * are JSON-representable and re-exported through this package's non-root
 * `./remote-host` subpath, which is where the Typert generator anchors the
 * generated client's type imports. `SourceDiscussionDraft` is deliberately
 * absent: canonical source provenance never crosses the wire.
 * @module @dsh-external/dsh-idea/src/remote-host/types
 */

import type { IdeaDraft, IdeaId, IdeaVersionId } from '../types.ts'
import type { IdeaPreparationId, IdeaPreparationPreview } from '../preparation/types.ts'

export type {
  IdeaDraft,
  IdeaId,
  IdeaPreparationId,
  IdeaPreparationPreview,
  IdeaVersionId,
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
 * The read-only summary of one Idea's current version — the `idea.list` row.
 * Storage records never cross the wire; this is the projection the web
 * client may see. `source` cites the conversation snapshot the current
 * version was saved from, absent when the version cites none.
 */
export interface IdeaSummary {
  id: string
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
