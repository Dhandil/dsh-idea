/**
 * Host configuration of the semantic plugin. Static schemastery schema in
 * the storage-domain plugin pattern. Since T11.1 the service runs one of
 * three frozen backends — `mode: 'llm'` (the default: the current Harness
 * Session model acts as the semantic selector, no embedding provider),
 * `mode: 'embedding'` (the accepted T11 OpenAI-compatible embedding index),
 * or `mode: 'off'` (inert) — resolved through the frozen legacy-compatibility
 * order: an explicit `mode` always wins; with `mode` absent, legacy
 * `enabled: true` means `embedding`, `enabled: false` means `off`, and a
 * fully absent legacy flag means `llm`. Structural validation fails loud at
 * service construction; provider fields are required only in `embedding`
 * mode and stay inert placeholders otherwise. No Settings UI and no hot
 * reload: the config is consumed once, into an immutable per-instance
 * snapshot.
 * @module @dsh-external/dsh-idea/src/semantic/config
 */

import z from '@deepseek-ai/schemastery'
import {
  SEMANTIC_API_KEY_ENV_DEFAULT,
  SEMANTIC_BATCH_SIZE_DEFAULT,
  SEMANTIC_BATCH_SIZE_MAX,
  SEMANTIC_DIMENSIONS_MAX,
  SEMANTIC_MODES,
  SEMANTIC_TIMEOUT_MS_DEFAULT,
  SEMANTIC_TIMEOUT_MS_MAX,
} from './types.ts'
import type { SemanticMode } from './types.ts'

/** Raw Host-loader configuration; every field optional at the schema layer. */
export interface SemanticPluginConfig {
  mode?: SemanticMode
  enabled?: boolean
  baseURL?: string
  model?: string
  apiKeyEnv?: string
  expectedDimensions?: number
  timeoutMs?: number
  batchSize?: number
}

// The schema layer keeps `mode` an unvalidated pass-through string so
// `resolveSemanticConfig` stays the single owner of mode validation and its
// closed rejection vocabulary.
export const SemanticConfig = z.object({
  mode: z.string(),
  enabled: z.boolean(),
  baseURL: z.string(),
  model: z.string(),
  apiKeyEnv: z.string().default(SEMANTIC_API_KEY_ENV_DEFAULT),
  expectedDimensions: z.number(),
  timeoutMs: z.number().default(SEMANTIC_TIMEOUT_MS_DEFAULT),
  batchSize: z.number().default(SEMANTIC_BATCH_SIZE_DEFAULT),
}) as unknown as z<SemanticPluginConfig>

/** Why a configuration was rejected; closed vocabulary, secret-free. */
export type SemanticConfigRejection =
  | 'mode-invalid'
  | 'base-url-required'
  | 'model-required'
  | 'dimensions-required'
  | 'dimensions-invalid'
  | 'timeout-invalid'
  | 'batch-size-invalid'
  | 'api-key-env-invalid'

/** A structurally invalid configuration; fails the service mount. */
export class SemanticConfigError extends Error {
  constructor(readonly reason: SemanticConfigRejection) {
    super(`semantic configuration rejected: ${reason}`)
    this.name = 'SemanticConfigError'
  }
}

/** The fully validated, immutable per-instance configuration. */
export interface ResolvedSemanticConfig {
  mode: SemanticMode
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

const isSemanticMode = (value: string): value is SemanticMode =>
  (SEMANTIC_MODES as readonly string[]).includes(value)

/**
 * Resolve and validate the raw configuration through the frozen mode order:
 * an explicit `mode` wins over the legacy `enabled` flag; `enabled: true`
 * maps to `embedding`, `enabled: false` to `off`, and neither present to
 * `llm`. Outside `embedding` mode the provider fields are never required and
 * resolve to inert placeholders — `llm` and `off` must always mount. In
 * `embedding` mode every provider field is required and bounded, exactly as
 * the accepted T11 validation, and any violation fails loud with a closed
 * secret-free reason.
 */
export function resolveSemanticConfig(raw: SemanticPluginConfig): ResolvedSemanticConfig {
  if (raw.mode !== undefined && !isSemanticMode(raw.mode)) {
    throw new SemanticConfigError('mode-invalid')
  }
  const mode: SemanticMode = raw.mode
    ?? (raw.enabled === true ? 'embedding' : raw.enabled === false ? 'off' : 'llm')
  if (mode !== 'embedding') {
    return {
      mode,
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
    mode: 'embedding',
    baseURL: raw.baseURL,
    model: raw.model,
    apiKeyEnv: raw.apiKeyEnv ?? SEMANTIC_API_KEY_ENV_DEFAULT,
    expectedDimensions: raw.expectedDimensions,
    timeoutMs: raw.timeoutMs ?? SEMANTIC_TIMEOUT_MS_DEFAULT,
    batchSize: raw.batchSize ?? SEMANTIC_BATCH_SIZE_DEFAULT,
  }
}
