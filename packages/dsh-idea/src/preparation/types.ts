/**
 * Types of the Host-side Save Idea preparation pipeline. Preparation turns a
 * finalized assistant message into an editable preview proposal plus an
 * opaque, in-memory preparation reference that a later task can commit —
 * it never writes durable Idea state itself.
 * @module @dsh-external/dsh-idea/src/preparation/types
 */

import type { IdeaDraft, SourceDiscussionDraft } from '../types.ts'

declare const brand: unique symbol

/** Branded opaque id of one ephemeral Host-owned preparation. */
export type IdeaPreparationId = string & { readonly [brand]: 'IdeaPreparationId' }

export function IdeaPreparationId(value: string): IdeaPreparationId {
  return value as IdeaPreparationId
}

/** The model route a preparation used, mirroring the Session's selection. */
export interface IdeaPreparationModelRoute {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Bounded-capture statistics reported with a preview proposal. */
export interface IdeaPreparationSourceInfo {
  sessionId: string
  anchorMessageId: string
  /** Durable seq of the first captured message event. */
  startSeq: number
  /** Durable seq of the last captured message event. */
  endSeq: number
  messageCount: number
  characterCount: number
}

/**
 * The editable preview returned by a successful preparation. The draft is
 * the model's proposal; the source stats describe the Host-owned capture.
 */
export interface IdeaPreparationPreview {
  preparationId: IdeaPreparationId
  draft: IdeaDraft
  source: IdeaPreparationSourceInfo
  model: IdeaPreparationModelRoute
}

/**
 * What the Host registry holds behind a preparation id: the canonical
 * captured source snapshot (T1 draft shape) plus the route that produced the
 * proposal. Committing this — never a browser-returned echo — is the only
 * provenance a later save may trust.
 */
export interface PreparedIdeaSource {
  source: SourceDiscussionDraft
  model: IdeaPreparationModelRoute
  createdAt: number
}
