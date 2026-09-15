/**
 * Entry of the Idea Evolution plugin (`@dsh-external/dsh-idea/evolution`).
 * Default export is the Host service; everything else is the evolution
 * vocabulary shared with later tasks.
 * @module @dsh-external/dsh-idea/evolution
 */

export { IdeaEvolutionService as default } from './service.ts'
export { IdeaEvolutionError } from './errors.ts'
export type { IdeaEvolutionErrorCode } from './errors.ts'
export { IdeaEvolutionRegistry, IDEA_EVOLUTION_LIMITS } from './registry.ts'
export type { IdeaEvolutionRegistryOptions } from './registry.ts'
export { collectDiscussionFromSurface } from './context.ts'
export type { CollectedDiscussion } from './context.ts'
export { buildIdeaEvolutionPrompt } from './prompt.ts'
export type { IdeaEvolutionPrompt } from './prompt.ts'
export type {
  IdeaEvolutionPreview,
  PreparedEvolution,
  ResolvedEvolution,
} from './types.ts'
