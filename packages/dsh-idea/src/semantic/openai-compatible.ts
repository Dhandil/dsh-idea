/**
 * The V1 OpenAI-compatible embedding adapter: one `POST <base>/embeddings`
 * call per batch over native `fetch`, with `redirect: 'error'`, JSON
 * content negotiation, a per-operation Bearer credential resolved through
 * an injected seam, and explicit timeout plus caller cancellation. The
 * request carries only `{model, input}` — no provider-specific
 * `dimensions` field; `expectedDimensions` is a validation contract on the
 * response. The response's `data[]` must be complete (one entry per input,
 * unique indices covering exactly 0..N-1) and every vector must validate
 * and L2-normalize; anything else is an ordinary provider failure. Errors
 * never carry the credential, the response body, or vector values.
 * @module @dsh-external/dsh-idea/src/semantic/openai-compatible
 */

import {
  EmbeddingCancelledError,
  EmbeddingProviderError,
} from './provider.ts'
import type { IdeaEmbeddingProvider } from './provider.ts'
import { normalizeEmbeddingBatch } from './vector.ts'
import type { RawEmbedding } from './vector.ts'

/** Static per-instance adapter settings; the credential resolves per call. */
export interface OpenAICompatibleEmbeddingOptions {
  canonicalBaseURL: string
  model: string
  expectedDimensions: number
  timeoutMs: number
  /** Resolved fresh for every operation; `undefined` means unavailable. */
  resolveApiKey: () => Promise<string | undefined>
}

interface EmbeddingsResponseBody {
  data?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export class OpenAICompatibleEmbeddingProvider implements IdeaEmbeddingProvider {
  constructor(private readonly options: OpenAICompatibleEmbeddingOptions) {}

  async embed(inputs: readonly string[], signal?: AbortSignal): Promise<readonly number[][]> {
    if (signal?.aborted) throw new EmbeddingCancelledError()
    const apiKey = await this.options.resolveApiKey()
    if (apiKey === undefined) throw new EmbeddingProviderError('credential-missing')

    const timeout = new AbortController()
    const propagate = (controller: AbortController): void => {
      signal?.addEventListener('abort', () => controller.abort(), { once: true })
    }
    propagate(timeout)
    const timer = setTimeout(() => timeout.abort(), this.options.timeoutMs)
    try {
      let response: Response
      try {
        response = await fetch(`${this.options.canonicalBaseURL}/embeddings`, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json',
            'authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: this.options.model, input: [...inputs] }),
          signal: timeout.signal,
        })
      } catch {
        if (signal?.aborted) throw new EmbeddingCancelledError()
        if (timeout.signal.aborted) throw new EmbeddingProviderError('timeout')
        throw new EmbeddingProviderError('network-failed')
      }
      if (!response.ok) {
        // Status only: the body may echo request material, so it never
        // enters the error or the diagnostics.
        throw new EmbeddingProviderError('http-error')
      }
      let body: EmbeddingsResponseBody
      try {
        body = await response.json() as EmbeddingsResponseBody
      } catch {
        throw new EmbeddingProviderError('invalid-json')
      }
      if (!isRecord(body) || !Array.isArray(body.data)) {
        throw new EmbeddingProviderError('malformed-payload')
      }
      const raw: RawEmbedding[] = []
      for (const entry of body.data) {
        if (!isRecord(entry) || typeof entry.index !== 'number' || !Array.isArray(entry.embedding)) {
          throw new EmbeddingProviderError('malformed-payload')
        }
        raw.push({ index: entry.index, embedding: entry.embedding.map(value => Number(value)) })
      }
      try {
        return normalizeEmbeddingBatch(raw, inputs.length, this.options.expectedDimensions)
      } catch {
        throw new EmbeddingProviderError('vector-invalid')
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
