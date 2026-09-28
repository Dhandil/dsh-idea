/**
 * Vocabulary of Semantic / Hybrid Idea Retrieval (T11): the disposable
 * derived embedding record, the active embedding profile, and the frozen
 * constants of the semantic branch. Semantic data is a retrieval accelerator
 * over the canonical `idea/v3` domain — never business truth, never user
 * data of its own, and safe to delete in full at any time. Nothing here
 * alters T10's lexical resurfacing: the semantic branch only widens which
 * historical Ideas enter the candidate pool before the unchanged Judge.
 * @module @dsh-external/dsh-idea/src/semantic/types
 */

import type { IdeaId, IdeaVersionId } from '../types.ts'

/** Frozen format version of the deterministic semantic document. */
export const IDEA_SEMANTIC_DOCUMENT_VERSION = 1

/** The closed set of semantic backend modes (T11.1). */
export const SEMANTIC_MODES = ['llm', 'embedding', 'off'] as const

/** Which semantic backend one service instance runs. */
export type SemanticMode = (typeof SEMANTIC_MODES)[number]

/**
 * Longest serialized candidate payload one Harness-LLM selector call may
 * carry, matching the already-tested Related Ideas one-call envelope.
 */
export const SEMANTIC_SELECTOR_PAYLOAD_LIMIT = 48_000

/** Frozen L2-normalization generation of every persisted vector. */
export const SEMANTIC_NORMALIZATION_VERSION = 'l2-v1'

/** Frozen V1 adapter identity; part of the embedding profile. */
export const SEMANTIC_ADAPTER = 'openai-compatible'

/** Most candidates one semantic exact scan may return. */
export const SEMANTIC_TOP_K = 12

/** Inclusive upper bound of accepted embedding dimensions. */
export const SEMANTIC_DIMENSIONS_MAX = 10_000

/** Inclusive upper bound of one provider call timeout, in milliseconds. */
export const SEMANTIC_TIMEOUT_MS_MAX = 120_000

/** Inclusive upper bound of one provider batch, in documents. */
export const SEMANTIC_BATCH_SIZE_MAX = 128

/** Default credential environment variable name. */
export const SEMANTIC_API_KEY_ENV_DEFAULT = 'DSH_IDEA_EMBEDDING_API_KEY'

/** Default provider timeout, in milliseconds. */
export const SEMANTIC_TIMEOUT_MS_DEFAULT = 30_000

/** Default provider batch size. */
export const SEMANTIC_BATCH_SIZE_DEFAULT = 32

/**
 * The one disposable derived record per Idea over the `idea_semantic/v1`
 * `embeddings` table, keyed by `ideaId`. Identity is bound to the exact
 * `IdeaVersion` that was embedded: a record whose version, profile, hash, or
 * document version no longer matches canonical state is stale and silently
 * excluded from retrieval, never relabeled. Only the vector, its identity,
 * and the deterministic document hash are persisted — never the document
 * text, never any discussion transcript.
 */
export interface SemanticEmbeddingRecord {
  ideaId: IdeaId
  /** The exact indexed version the vector was computed over. */
  versionId: IdeaVersionId
  /** Identity of the embedding profile the vector was produced under. */
  embeddingProfileId: string
  /** Frozen deterministic document format version. */
  documentVersion: typeof IDEA_SEMANTIC_DOCUMENT_VERSION
  /** SHA-256 hex digest of the exact UTF-8 document bytes. */
  contentHash: string
  /** Accepted vector length; always the profile's expected dimensions. */
  dimensions: number
  /** The persisted L2-normalized vector. */
  vector: readonly number[]
  createdAt: number
}

/**
 * The static immutable embedding identity of this service instance: vector
 * compatibility is exact-profile equality, and vectors from different
 * profiles are never compared. Deliberately excludes the API key, the key
 * environment name, timeout, and batch size — none of those change what a
 * vector means. `baseURL` is the raw configured URL; the canonical form is
 * derived during profile resolution.
 */
export interface EmbeddingProfile {
  adapter: string
  baseURL: string
  model: string
  expectedDimensions: number
  documentVersion: number
  normalizationVersion: string
}

/** {@link EmbeddingProfile} plus its canonical base URL and SHA-256 hex id. */
export interface ResolvedEmbeddingProfile extends EmbeddingProfile {
  canonicalBaseURL: string
  embeddingProfileId: string
}

/**
 * One accepted, L2-normalized query or document vector. Provider output
 * reaches this shape only through full validation; persisted vectors are
 * re-validated defensively before any comparison.
 */
export interface NormalizedVector {
  vector: readonly number[]
  dimensions: number
}
