/**
 * The plugin-owned embedding provider abstraction. One bounded batch
 * operation: documents in, one validated L2-normalized vector out per
 * document, in request order. Every failure mode is a closed secret-free
 * reason on {@link EmbeddingProviderError}; caller cancellation is a
 * distinct error class so the Remote layer can preserve
 * `gateway/cancelled` semantics instead of degrading to an empty result.
 * No provider retries or backoff exist in T11: a failed indexing attempt
 * simply leaves the record missing or stale until a later Idea change or
 * the next startup reconciliation.
 * @module @dsh-external/dsh-idea/src/semantic/provider
 */

/** Why a provider operation failed; closed vocabulary, never secret-bearing. */
export type EmbeddingProviderRejection =
  | 'credential-missing'
  | 'network-failed'
  | 'timeout'
  | 'http-error'
  | 'invalid-json'
  | 'malformed-payload'
  | 'vector-invalid'

/** An ordinary provider failure; safe to log, never carries key or payload. */
export class EmbeddingProviderError extends Error {
  constructor(readonly reason: EmbeddingProviderRejection) {
    super(`embedding provider failed: ${reason}`)
    this.name = 'EmbeddingProviderError'
  }
}

/**
 * The caller's AbortSignal fired (or the request was cancelled by the
 * caller). Distinct from every ordinary failure so cancellation stays
 * cancellation end to end.
 */
export class EmbeddingCancelledError extends Error {
  constructor() {
    super('embedding request was cancelled')
    this.name = 'EmbeddingCancelledError'
  }
}

/** The bounded batch embedding seam the service and tests program against. */
export interface IdeaEmbeddingProvider {
  /**
   * Embed one batch of documents.
   * @param inputs - The document/query texts, in request order.
   * @param signal - Optional caller cancellation.
   * @returns one L2-normalized vector per input, in request order.
   * @throws {EmbeddingCancelledError} when the caller cancelled.
   * @throws {EmbeddingProviderError} on every ordinary failure.
   */
  embed(inputs: readonly string[], signal?: AbortSignal): Promise<readonly number[][]>
}
