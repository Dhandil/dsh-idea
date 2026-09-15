/**
 * Error vocabulary specific to the Evolution pipeline. The shared
 * read/route/stream phases reuse the Save-preparation taxonomy
 * (`IdeaPreparationError`); this class carries only what is evolution's own:
 * a proposal reference that is unknown, expired, or already consumed.
 * @module @dsh-external/dsh-idea/src/evolution/errors
 */

export type IdeaEvolutionErrorCode =
  /** The proposal id is unknown, expired, or already committed. */
  | 'proposal-not-found'

export class IdeaEvolutionError extends Error {
  override readonly name = 'IdeaEvolutionError'

  constructor(
    readonly code: IdeaEvolutionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
