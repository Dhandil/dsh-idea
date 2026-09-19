/**
 * Idea references: the canonical pinned-version URI protocol, the readable
 * mention form, the bounded recall projection, and the Host-side pre-step
 * resolver.
 * @module @dsh-external/dsh-idea/src/reference
 */

export * from './types.ts'
export * from './uri.ts'
export * from './projection.ts'
export * from './context.ts'
export * from './service.ts'

export { IdeaReferenceService as default } from './service.ts'
