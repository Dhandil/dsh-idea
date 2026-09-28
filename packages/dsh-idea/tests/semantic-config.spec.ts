/**
 * The frozen semantic config resolution (T11.1 §23): the explicit `mode`
 * wins over the legacy `enabled` flag, the legacy flag maps `true` →
 * embedding / `false` → off / absent → llm, `llm` and `off` mount without
 * any embedding provider field, and `embedding` keeps the accepted T11
 * validation chain and resolved shape unchanged.
 * @module tests/semantic-config.spec
 */

import { describe, expect, it } from 'vitest'
import { resolveSemanticConfig, SemanticConfigError } from '../src/semantic/config.ts'
import {
  SEMANTIC_BATCH_SIZE_DEFAULT,
  SEMANTIC_TIMEOUT_MS_DEFAULT,
} from '../src/semantic/types.ts'

const EMBEDDING_CONFIG = {
  baseURL: 'http://127.0.0.1:9/v1',
  model: 'embed-model',
  expectedDimensions: 4,
}

const reasonOf = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(SemanticConfigError)
    return (error as SemanticConfigError).reason
  }
  throw new Error('expected the configuration to be rejected')
}

describe('explicit mode', () => {
  it('mode=llm resolves to the llm backend with inert provider placeholders', () => {
    const resolved = resolveSemanticConfig({ mode: 'llm' })
    expect(resolved.mode).toBe('llm')
    expect(resolved.baseURL).toBe('')
    expect(resolved.model).toBe('')
    expect(resolved.expectedDimensions).toBe(0)
    expect(resolved.timeoutMs).toBe(SEMANTIC_TIMEOUT_MS_DEFAULT)
    expect(resolved.batchSize).toBe(SEMANTIC_BATCH_SIZE_DEFAULT)
  })

  it('mode=embedding resolves to the embedding backend with the provider fields', () => {
    const resolved = resolveSemanticConfig({ mode: 'embedding', ...EMBEDDING_CONFIG })
    expect(resolved.mode).toBe('embedding')
    expect(resolved.baseURL).toBe(EMBEDDING_CONFIG.baseURL)
    expect(resolved.model).toBe(EMBEDDING_CONFIG.model)
    expect(resolved.expectedDimensions).toBe(4)
    expect(resolved.apiKeyEnv).toBe('DSH_IDEA_EMBEDDING_API_KEY')
  })

  it('mode=off resolves to the off backend with inert provider placeholders', () => {
    const resolved = resolveSemanticConfig({ mode: 'off' })
    expect(resolved.mode).toBe('off')
    expect(resolved.baseURL).toBe('')
    expect(resolved.model).toBe('')
    expect(resolved.expectedDimensions).toBe(0)
  })

  it('an explicit mode beats the legacy enabled flag in every direction', () => {
    expect(resolveSemanticConfig({ mode: 'off', enabled: true }).mode).toBe('off')
    expect(resolveSemanticConfig({ mode: 'embedding', enabled: false, ...EMBEDDING_CONFIG }).mode).toBe('embedding')
    expect(resolveSemanticConfig({ mode: 'llm', enabled: true }).mode).toBe('llm')
    expect(resolveSemanticConfig({ mode: 'llm', enabled: false }).mode).toBe('llm')
  })

  it('rejects a mode outside the closed vocabulary', () => {
    expect(reasonOf(() => resolveSemanticConfig({ mode: 'hybrid' as never }))).toBe('mode-invalid')
  })
})

describe('legacy enabled compatibility', () => {
  it('mode absent + enabled=true → embedding', () => {
    expect(resolveSemanticConfig({ enabled: true, ...EMBEDDING_CONFIG }).mode).toBe('embedding')
  })

  it('mode absent + enabled=false → off', () => {
    expect(resolveSemanticConfig({ enabled: false }).mode).toBe('off')
  })

  it('mode absent + enabled absent → llm (the new default)', () => {
    expect(resolveSemanticConfig({}).mode).toBe('llm')
  })
})

describe('mode-specific provider requirements', () => {
  it('llm mode does not require embedding config', () => {
    const resolved = resolveSemanticConfig({ mode: 'llm' })
    expect(resolved.mode).toBe('llm')
    expect(resolved.baseURL).toBe('')
  })

  it('off mode does not require embedding config', () => {
    const resolved = resolveSemanticConfig({ mode: 'off' })
    expect(resolved.mode).toBe('off')
  })

  it('embedding mode keeps the existing validation chain', () => {
    expect(reasonOf(() => resolveSemanticConfig({ mode: 'embedding' }))).toBe('base-url-required')
    expect(reasonOf(() => resolveSemanticConfig({ mode: 'embedding', baseURL: ' ' }))).toBe('base-url-required')
    expect(reasonOf(() => resolveSemanticConfig({ mode: 'embedding', baseURL: EMBEDDING_CONFIG.baseURL }))).toBe('model-required')
    expect(reasonOf(() => resolveSemanticConfig({
      mode: 'embedding',
      baseURL: EMBEDDING_CONFIG.baseURL,
      model: EMBEDDING_CONFIG.model,
    }))).toBe('dimensions-required')
    expect(reasonOf(() => resolveSemanticConfig({
      mode: 'embedding',
      ...EMBEDDING_CONFIG,
      expectedDimensions: 0,
    }))).toBe('dimensions-invalid')
    expect(reasonOf(() => resolveSemanticConfig({
      mode: 'embedding',
      ...EMBEDDING_CONFIG,
      timeoutMs: 0,
    }))).toBe('timeout-invalid')
    expect(reasonOf(() => resolveSemanticConfig({
      mode: 'embedding',
      ...EMBEDDING_CONFIG,
      batchSize: 129,
    }))).toBe('batch-size-invalid')
    expect(reasonOf(() => resolveSemanticConfig({
      mode: 'embedding',
      ...EMBEDDING_CONFIG,
      apiKeyEnv: 'not-an-env-name',
    }))).toBe('api-key-env-invalid')
    expect(resolveSemanticConfig({ mode: 'embedding', ...EMBEDDING_CONFIG }).mode).toBe('embedding')
  })
})
