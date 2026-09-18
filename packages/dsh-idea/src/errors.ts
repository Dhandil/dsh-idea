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
  /** No version with the given id exists on the Idea. */
  | 'version-not-found'
  /** No discussion workspace with the given id exists. */
  | 'discussion-not-found'
  /** The Idea is archived: readable, but every mutation other than
   * restore/delete is rejected. */
  | 'archived'
  /** A permanent delete of this Idea is in flight; competing mutations are
   * rejected until it settles. */
  | 'deleting'

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
