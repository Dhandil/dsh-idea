/**
 * Idea domain plugin (`@dsh-external/dsh-idea`): the host-only bundle entry
 * the Cordis loader mounts — a Service subclass exposed as the default
 * export. The bundle's `cordis.patch.yml` inserts the loader row naming this
 * package; Cordis waits for `storageDomain`, then constructs the service.
 * Host-only by design for T1: no browser code, no client injects.
 * @module @dsh-external/dsh-idea
 */

import { IdeaService } from './service.ts'

export { IdeaError } from './errors.ts'
export type { IdeaErrorCode } from './errors.ts'
export {
  capturedMessageSchema,
  ideaAggregateSchema,
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
export { IdeaId, IdeaVersionId, SourceDiscussionId } from './types.ts'
export type {
  CapturedMessage,
  Idea,
  IdeaAggregate,
  IdeaCurrentView,
  IdeaDraft,
  IdeaStatus,
  IdeaVersion,
  ListIdeasOptions,
  SourceDiscussion,
  SourceDiscussionDraft,
} from './types.ts'

export default IdeaService
