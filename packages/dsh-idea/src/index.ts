/**
 * Idea domain plugin (`@dsh-external/dsh-idea`): the host bundle entry the
 * Cordis loader mounts — the durable `IdeaService` as the default export.
 * This row also carries the package's `./typert` registration, which the
 * Typert loader auto-discovers from the package root. The Remote controller
 * mounts separately through the `./remote-host` subpath row.
 * @module @dsh-external/dsh-idea
 */

import { IdeaService } from './service.ts'

export { IdeaError } from './errors.ts'
export type { IdeaErrorCode } from './errors.ts'
export {
  capturedMessageSchema,
  ideaAggregateSchema,
  ideaDiscussionIdSchema,
  ideaDiscussionSchema,
  ideaDraftSchema,
  ideaIdSchema,
  ideaSchema,
  ideaVersionIdSchema,
  ideaVersionSchema,
  IDEA_LIMITS,
  sourceDiscussionDraftSchema,
  sourceDiscussionIdSchema,
  sourceDiscussionSchema,
} from './schema.ts'
export { ideaDomainSpec } from './spec.ts'
export { IdeaService } from './service.ts'
export { IdeaRemoteService } from './remote-host/service.ts'
export type {
  IdeaCreateRequest,
  IdeaCreateResult,
  IdeaDetail,
  IdeaGetRequest,
  IdeaPrepareRequest,
  IdeaSummary,
} from './remote-host/types.ts'
export { IdeaId, IdeaVersionId, IdeaDiscussionId, SourceDiscussionId, EvolutionProposalId } from './types.ts'
export type {
  CapturedMessage,
  Idea,
  IdeaAggregate,
  IdeaContinuationContext,
  IdeaCurrentView,
  IdeaDiscussion,
  IdeaDraft,
  IdeaEvolutionProposal,
  IdeaEvolutionReason,
  IdeaHistorySummaryEntry,
  IdeaStatus,
  IdeaVersion,
  ListIdeasOptions,
  SourceDiscussion,
  SourceDiscussionDraft,
} from './types.ts'

export default IdeaService
