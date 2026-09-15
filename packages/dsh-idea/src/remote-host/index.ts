/**
 * Entry of the `idea` Remote controller (`@dsh-external/dsh-idea/remote-host`).
 * Default export is the Host service the bundle's third loader row mounts;
 * the type surface is the wire vocabulary the Typert generator anchors the
 * generated client's imports to.
 * @module @dsh-external/dsh-idea/remote-host
 */

export { IdeaRemoteService as default } from './service.ts'
export { IDEA_REMOTE_ERROR_CODES } from './errors.ts'
export type { IdeaRemoteErrorCode } from './errors.ts'
export type * from './types.ts'
