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
 * The preview returned by a quick-capture preparation (T12). No source stats
 * exist — the note is the user's own text, never a captured conversation.
 */
export interface QuickCapturePreview {
  preparationId: IdeaPreparationId
  draft: IdeaDraft
}

/**
 * Where a quick capture was written (T12.3): the conversation's Session —
 * whose projected model route organizes the note — or a session-independent
 * context (the Settings library) that resolves the Agent default model
 * directly. A discriminated union by design: no fake sessions, no marker ids.
 */
export type QuickCaptureRouteContext =
  | { kind: 'session'; sessionId: string }
  | { kind: 'default' }

/**
 * What the Host registry holds behind a preparation id, discriminated by its
 * origin (T12): a `conversation` preparation carries the canonical captured
 * source snapshot (T1 draft shape) plus the route that produced the proposal;
 * a `quick-capture` preparation carries no source discussion at all — the
 * user's own raw text is the evidence — and records the route only when the
 * proposal was AI-organized (direct saves make no model call). Committing
 * this — never a browser-returned echo — is the only provenance a later save
 * may trust, and the commit machine branches on the kind.
 */
export type PreparedIdeaOrigin =
  | { kind: 'conversation'; source: SourceDiscussionDraft; model: IdeaPreparationModelRoute }
  | { kind: 'quick-capture'; model: IdeaPreparationModelRoute | undefined }

export interface PreparedIdeaSource {
  origin: PreparedIdeaOrigin
  createdAt: number
}
