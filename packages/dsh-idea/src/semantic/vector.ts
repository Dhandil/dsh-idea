/**
 * Vector validation, L2 normalization, and similarity. Provider output is
 * accepted only when the batch is complete (one entry per input, unique
 * indices covering exactly 0..N-1), every vector has the expected
 * dimensions, every element is finite, and the norm is positive; accepted
 * vectors are L2-normalized and only normalized vectors are ever persisted
 * or compared. Similarity is the plain dot product of normalized vectors —
 * no cosine threshold exists anywhere in T11.
 * @module @dsh-external/dsh-idea/src/semantic/vector
 */

/** Why a vector was rejected; closed vocabulary, secret-free. */
export type VectorRejection =
  | 'wrong-count'
  | 'wrong-dimensions'
  | 'non-finite-value'
  | 'zero-norm'

/** A structurally or numerically unusable vector; never carries values. */
export class VectorValidationError extends Error {
  constructor(readonly reason: VectorRejection) {
    super(`embedding vector rejected: ${reason}`)
    this.name = 'VectorValidationError'
  }
}

/** One raw provider result entry before batch validation. */
export interface RawEmbedding {
  index: number
  embedding: readonly number[]
}

/** L2-normalize one finite non-zero vector of the expected length. */
export function normalizeVector(values: readonly number[], expectedDimensions: number): number[] {
  if (!Number.isInteger(expectedDimensions) || values.length !== expectedDimensions) {
    throw new VectorValidationError('wrong-dimensions')
  }
  let normSquared = 0
  for (const value of values) {
    if (!Number.isFinite(value)) throw new VectorValidationError('non-finite-value')
    normSquared += value * value
  }
  if (!(normSquared > 0)) throw new VectorValidationError('zero-norm')
  const norm = Math.sqrt(normSquared)
  return values.map(value => value / norm)
}

/**
 * Validate one provider batch against its request and normalize every
 * vector. The result count must equal the input count; the indices must be
 * unique and cover exactly `0..count-1`; the returned array is ordered by
 * request position, not by provider response order.
 */
export function normalizeEmbeddingBatch(
  raw: readonly RawEmbedding[],
  count: number,
  expectedDimensions: number,
): number[][] {
  if (!Number.isInteger(count) || raw.length !== count) {
    throw new VectorValidationError('wrong-count')
  }
  const seen = new Set<number>()
  for (const entry of raw) {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= count || seen.has(entry.index)) {
      throw new VectorValidationError('wrong-dimensions')
    }
    seen.add(entry.index)
  }
  if (seen.size !== count) throw new VectorValidationError('wrong-dimensions')
  const ordered: number[][] = new Array(count)
  for (const entry of raw) {
    ordered[entry.index] = normalizeVector(entry.embedding, expectedDimensions)
  }
  return ordered
}

/** Dot product of two equal-length vectors (the normalized similarity). */
export function dotProduct(a: readonly number[], b: readonly number[]): number {
  let sum = 0
  for (let index = 0; index < a.length; index += 1) {
    sum += a[index]! * b[index]!
  }
  return sum
}
