/**
 * Host configuration of the semantic plugin. Static schemastery schema in
 * the storage-domain plugin pattern: mounted by the Host loader with
 * `enabled: false` by default, so semantic retrieval ships fully wired but
 * dormant — zero provider calls, zero reconciliation work, and T10 behavior
 * byte-identical to pre-T11. When enabled, structural validation fails loud
 * at service construction; provider fields may stay absent while disabled.
 * No Settings UI and no hot reload in T11: the config is consumed once,
 * into an immutable per-instance snapshot.
 * @module @dsh-external/dsh-idea/src/semantic/config
 */

import z from '@deepseek-ai/schemastery'
import {
  SEMANTIC_API_KEY_ENV_DEFAULT,
  SEMANTIC_BATCH_SIZE_DEFAULT,
  SEMANTIC_BATCH_SIZE_MAX,
  SEMANTIC_DIMENSIONS_MAX,
  SEMANTIC_TIMEOUT_MS_DEFAULT,
  SEMANTIC_TIMEOUT_MS_MAX,
} from './types.ts'

/** Raw Host-loader configuration; every provider field optional while disabled. */
export interface SemanticPluginConfig {
  enabled?: boolean
  baseURL?: string
  model?: string
  apiKeyEnv?: string
  expectedDimensions?: number
  timeoutMs?: number
  batchSize?: number
}

export const SemanticConfig: z<SemanticPluginConfig> = z.object({
  enabled: z.boolean().default(false),
  baseURL: z.string(),
  model: z.string(),
  apiKeyEnv: z.string().default(SEMANTIC_API_KEY_ENV_DEFAULT),
  expectedDimensions: z.number(),
  timeoutMs: z.number().default(SEMANTIC_TIMEOUT_MS_DEFAULT),
  batchSize: z.number().default(SEMANTIC_BATCH_SIZE_DEFAULT),
})

/** Why an enabled configuration was rejected; closed vocabulary, secret-free. */
export type SemanticConfigRejection =
  | 'base-url-required'
  | 'model-required'
  | 'dimensions-required'
  | 'dimensions-invalid'
  | 'timeout-invalid'
  | 'batch-size-invalid'
  | 'api-key-env-invalid'

/** A structurally invalid enabled configuration; fails the service mount. */
export class SemanticConfigError extends Error {
  constructor(readonly reason: SemanticConfigRejection) {
    super(`semantic configuration rejected: ${reason}`)
    this.name = 'SemanticConfigError'
  }
}

/** The fully validated, immutable per-instance configuration. */
export interface ResolvedSemanticConfig {
  enabled: boolean
  baseURL: string
  model: string
  apiKeyEnv: string
  expectedDimensions: number
  timeoutMs: number
  batchSize: number
}

const isPositiveInt = (value: number, max: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= max

const isCredentialEnvName = (value: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)

/**
 * Resolve and validate the raw configuration. While disabled, absent
 * provider fields resolve to inert placeholders and nothing is validated —
 * disabled must always mount. While enabled, every provider field is
 * required and bounded, and any violation fails loud with a closed
 * secret-free reason.
 */
export function resolveSemanticConfig(raw: SemanticPluginConfig): ResolvedSemanticConfig {
  const enabled = raw.enabled === true
  if (!enabled) {
    return {
      enabled: false,
      baseURL: raw.baseURL ?? '',
      model: raw.model ?? '',
      apiKeyEnv: raw.apiKeyEnv ?? SEMANTIC_API_KEY_ENV_DEFAULT,
      expectedDimensions: raw.expectedDimensions ?? 0,
      timeoutMs: SEMANTIC_TIMEOUT_MS_DEFAULT,
      batchSize: SEMANTIC_BATCH_SIZE_DEFAULT,
    }
  }
  if (raw.baseURL === undefined || raw.baseURL.trim() === '') {
    throw new SemanticConfigError('base-url-required')
  }
  if (raw.model === undefined || raw.model.trim() === '') {
    throw new SemanticConfigError('model-required')
  }
  if (raw.expectedDimensions === undefined) {
    throw new SemanticConfigError('dimensions-required')
  }
  if (!isPositiveInt(raw.expectedDimensions, SEMANTIC_DIMENSIONS_MAX)) {
    throw new SemanticConfigError('dimensions-invalid')
  }
  if (!isPositiveInt(raw.timeoutMs ?? SEMANTIC_TIMEOUT_MS_DEFAULT, SEMANTIC_TIMEOUT_MS_MAX)) {
    throw new SemanticConfigError('timeout-invalid')
  }
  if (!isPositiveInt(raw.batchSize ?? SEMANTIC_BATCH_SIZE_DEFAULT, SEMANTIC_BATCH_SIZE_MAX)) {
    throw new SemanticConfigError('batch-size-invalid')
  }
  if (!isCredentialEnvName(raw.apiKeyEnv ?? SEMANTIC_API_KEY_ENV_DEFAULT)) {
    throw new SemanticConfigError('api-key-env-invalid')
  }
  return {
    enabled: true,
    baseURL: raw.baseURL,
    model: raw.model,
    apiKeyEnv: raw.apiKeyEnv ?? SEMANTIC_API_KEY_ENV_DEFAULT,
    expectedDimensions: raw.expectedDimensions,
    timeoutMs: raw.timeoutMs ?? SEMANTIC_TIMEOUT_MS_DEFAULT,
    batchSize: raw.batchSize ?? SEMANTIC_BATCH_SIZE_DEFAULT,
  }
}
