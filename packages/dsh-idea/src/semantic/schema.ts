/**
 * Durable zod schema of the `idea_semantic/v1` embedding record. The
 * storage-domain layer runs it at the durable read boundary; because the
 * domain declares `backup-and-skip`, a stored record that fails here is
 * moved aside and treated as absent — disposable derived data must never
 * block an open. Identifier fields round-trip through the canonical Idea
 * transforms so parsed output carries the branded types.
 * @module @dsh-external/dsh-idea/src/semantic/schema
 */

import { z } from 'zod'
import { ideaIdSchema, ideaVersionIdSchema } from '../schema.ts'
import { SEMANTIC_DIMENSIONS_MAX, IDEA_SEMANTIC_DOCUMENT_VERSION } from './types.ts'
import type { SemanticEmbeddingRecord } from './types.ts'

/** A SHA-256 hex digest, as produced by every T11 identity hash. */
const hexDigest = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * The embedding record exactly as the medium may hold it: canonical Idea
 * identity, exact indexed version, profile/hash identity, frozen document
 * version, bounded positive dimensions, a vector of exactly that many
 * finite numbers, and a non-negative timestamp. Any structural drift fails
 * the record, and the domain's `backup-and-skip` policy retires it.
 */
export const semanticEmbeddingRecordSchema = z.object({
  ideaId: ideaIdSchema,
  versionId: ideaVersionIdSchema,
  embeddingProfileId: hexDigest,
  documentVersion: z.literal(IDEA_SEMANTIC_DOCUMENT_VERSION),
  contentHash: hexDigest,
  dimensions: z.number().int().positive().max(SEMANTIC_DIMENSIONS_MAX),
  vector: z.array(z.number()),
  createdAt: z.number().int().nonnegative(),
}).refine(record => record.vector.length === record.dimensions, {
  message: 'vector length must equal dimensions',
}) satisfies z.ZodType<SemanticEmbeddingRecord>
