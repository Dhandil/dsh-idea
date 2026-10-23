/**
 * Entry of the Save Idea preparation plugin (`@dsh-external/dsh-idea/preparation`).
 * Default export is the Host service; everything else is the preparation
 * vocabulary shared with later tasks.
 * @module @dsh-external/dsh-idea/preparation
 */

export { IdeaPreparationService as default } from './service.ts'
export { IdeaPreparationError } from './errors.ts'
export type { IdeaPreparationErrorCode } from './errors.ts'
export { IdeaPreparationRegistry, IDEA_PREPARATION_LIMITS } from './registry.ts'
export type { IdeaPreparationRegistryOptions } from './registry.ts'
export { captureDiscussionFromSurface, IDEA_CAPTURE_LIMITS, normalizeCapturedText } from './context.ts'
export type { CapturedDiscussion } from './context.ts'
export { parseIdeaDraftOutput } from './parser.ts'
export { buildIdeaExtractionPrompt } from './prompt.ts'
export type { IdeaExtractionPrompt } from './prompt.ts'
export { IdeaPreparationId } from './types.ts'
export { IdeaUpdatePipeline } from './update.ts'
export { IdeaUpdateRegistry, IDEA_UPDATE_LIMITS } from './update-registry.ts'
export type { IdeaUpdateRegistryOptions } from './update-registry.ts'
export { IdeaUpdateError } from './update-types.ts'
export type { IdeaUpdateId, IdeaUpdatePreview, IdeaUpdateResult, IdeaPrepareUpdateRequest, IdeaCommitUpdateRequest, IdeaUpdateErrorCode } from './update-types.ts'
export type {
  IdeaPreparationModelRoute,
  IdeaPreparationPreview,
  IdeaPreparationSourceInfo,
  PreparedIdeaSource,
} from './types.ts'
