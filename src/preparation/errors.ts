/**
 * Error vocabulary of the Save Idea preparation pipeline. The `code` is the
 * stable contract a later task maps to Remote failures; `message` is
 * diagnostic prose and `cause` preserves the internal origin without
 * exposing secrets.
 * @module @dsh-external/dsh-idea/src/preparation/errors
 */

export type IdeaPreparationErrorCode =
  /** The Session or the requested anchor message does not exist. */
  | 'source-not-found'
  /** The source exists but is unreadable or carries no usable visible text. */
  | 'source-unavailable'
  /** The selected (or fallback) model route cannot be served at all. */
  | 'model-unavailable'
  /** The provider or stream failed, or the stream ended on a non-success finish. */
  | 'model-failed'
  /** Empty text, tool-call output, bad JSON, or schema-invalid draft. */
  | 'invalid-model-output'
  /** The caller aborted the preparation. */
  | 'request-cancelled'
  /** The preparation id is unknown or expired. */
  | 'preparation-not-found'

export class IdeaPreparationError extends Error {
  override readonly name = 'IdeaPreparationError'

  constructor(
    readonly code: IdeaPreparationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
