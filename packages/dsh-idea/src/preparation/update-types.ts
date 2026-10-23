/** Host update vocabulary; no durable schema or Client interaction state. */
import type { IdeaDraft, IdeaId, IdeaStatus, IdeaVersionId, SourceDiscussionDraft } from '../types.ts'
import type { IdeaPreparationSourceInfo } from './types.ts'

declare const updateBrand: unique symbol
export type IdeaUpdateId = string & { readonly [updateBrand]: 'IdeaUpdateId' }

export interface IdeaPrepareUpdateRequest {
  requestKey: string
  sessionId: string
  messageId: string
  ideaId: string
  expectedCurrentVersionId: string
}
export interface IdeaCommitUpdateRequest {
  updateId: IdeaUpdateId
  draft: IdeaDraft
}
export interface IdeaUpdateTarget {
  ideaId: IdeaId
  currentVersionId: IdeaVersionId
  title: string
  status: Exclude<IdeaStatus, 'archived'>
}
export interface IdeaUpdatePreview {
  updateId: IdeaUpdateId
  targetSummary: IdeaUpdateTarget
  draft: IdeaDraft
  sourceStats: IdeaPreparationSourceInfo & { truncated: boolean }
}
export interface IdeaUpdateResult {
  ideaId: IdeaId
  currentVersionId: IdeaVersionId
  title: string
  status: IdeaStatus
  updated: boolean
}
/** Stored only in the Host ticket until explicit commit. */
export interface PreparedUpdate {
  target: IdeaUpdateTarget
  currentDraft: IdeaDraft
  draft: IdeaDraft
  source: SourceDiscussionDraft
  sourceStats: IdeaUpdatePreview['sourceStats']
}

export type IdeaUpdateErrorCode =
  | 'invalid-update-request'
  | 'update-not-found'
  | 'update-request-conflict'
  | 'update-payload-conflict'
  | 'update-capacity'
  | 'update-result-uncertain'

export class IdeaUpdateError extends Error {
  override readonly name = 'IdeaUpdateError'
  constructor(readonly code: IdeaUpdateErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
  }
}
