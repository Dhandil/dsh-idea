/**
 * Error vocabulary of the Idea domain service. The `code` is the stable
 * contract callers may switch on; `message` is diagnostic prose.
 * @module @dsh-external/dsh-idea/src/errors
 */

export type IdeaErrorCode =
  /** Input failed draft validation before any persistence was attempted. */
  | 'invalid-input'
  /** No Idea with the given id exists. */
  | 'idea-not-found'
  /** `expectedCurrentVersionId` did not match the Idea's current version; zero writes happened. */
  | 'version-conflict'

export class IdeaError extends Error {
  override readonly name = 'IdeaError'

  constructor(
    readonly code: IdeaErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
