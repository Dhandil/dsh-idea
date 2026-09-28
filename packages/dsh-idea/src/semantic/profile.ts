/**
 * The active embedding profile: the deterministic vector-compatibility
 * identity derived from adapter, canonical base URL, model, expected
 * dimensions, document version, and normalization version. Two records
 * whose profile ids differ are never compared. The id deliberately excludes
 * the API key, the key environment name, timeout, and batch size — none of
 * those change what a vector means. Base-URL canonicalization is strict and
 * deterministic: http/https only, no embedded credentials, trailing slashes
 * stripped from the effective base form.
 * @module @dsh-external/dsh-idea/src/semantic/profile
 */

import { createHash } from 'node:crypto'
import type { EmbeddingProfile, ResolvedEmbeddingProfile } from './types.ts'

/** Why a base URL was rejected. */
export type BaseURLRejection = 'invalid-url' | 'unsupported-protocol' | 'embedded-credentials'

/** A structurally unusable base URL; never carries the URL itself. */
export class BaseURLValidationError extends Error {
  constructor(readonly reason: BaseURLRejection) {
    super(`embedding base URL rejected: ${reason}`)
    this.name = 'BaseURLValidationError'
  }
}

/**
 * Canonicalize one configured base URL deterministically: parse as a URL,
 * require `http:` or `https:`, reject embedded username/password, and strip
 * trailing slashes from the path of the effective base form. The result is
 * the exact string the provider will call and the exact string hashed into
 * the profile id.
 */
export function canonicalizeBaseURL(baseURL: string): string {
  let url: URL
  try {
    url = new URL(baseURL)
  } catch {
    throw new BaseURLValidationError('invalid-url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BaseURLValidationError('unsupported-protocol')
  }
  if (url.username !== '' || url.password !== '') {
    throw new BaseURLValidationError('embedded-credentials')
  }
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

/**
 * Compute the stable profile representation and its SHA-256 hex id. The
 * representation is a fixed-order JSON array — structural, version-stable,
 * and free of secret material by construction.
 */
export function resolveEmbeddingProfile(input: EmbeddingProfile): ResolvedEmbeddingProfile {
  const canonicalBaseURL = canonicalizeBaseURL(input.baseURL)
  const representation = JSON.stringify([
    input.adapter,
    canonicalBaseURL,
    input.model,
    input.expectedDimensions,
    input.documentVersion,
    input.normalizationVersion,
  ])
  const embeddingProfileId = createHash('sha256').update(representation, 'utf8').digest('hex')
  return { ...input, canonicalBaseURL, embeddingProfileId }
}
