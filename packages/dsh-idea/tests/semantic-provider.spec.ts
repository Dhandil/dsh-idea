/**
 * The OpenAI-compatible embedding adapter (T11 §38) over a loopback-only
 * fake `/embeddings` endpoint: request shape (`{model, input}`, no
 * `dimensions` field), per-operation credential resolution, redirect
 * refusal, timeout, caller cancellation, the closed failure vocabulary,
 * index-ordered batch reconstruction, one-call-no-retry behavior, and the
 * guarantee that no error ever carries the credential, the response body,
 * or vector values. No real provider or public network — everything answers
 * from 127.0.0.1.
 * @module tests/semantic-provider.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleEmbeddingProvider } from '../src/semantic/openai-compatible.ts'
import { EmbeddingCancelledError, EmbeddingProviderError } from '../src/semantic/provider.ts'
import { closeServers, fakeEmbeddingServer, sleep } from './helpers/semantic.ts'

afterEach(closeServers)

const API_KEY = 'test-key-abc123'

/** One provider wired to one fake loopback server. */
async function wiredProvider(overrides: Partial<{
  expectedDimensions: number
  timeoutMs: number
  resolveApiKey: () => Promise<string | undefined>
}> = {}) {
  const server = await fakeEmbeddingServer({ dimensions: overrides.expectedDimensions ?? 4 })
  const provider = buildProvider(server.url, overrides)
  return { provider, server }
}

function buildProvider(baseURL: string, overrides: Partial<{
  expectedDimensions: number
  timeoutMs: number
  resolveApiKey: () => Promise<string | undefined>
}> = {}) {
  return new OpenAICompatibleEmbeddingProvider({
    canonicalBaseURL: baseURL,
    model: 'fake-model',
    expectedDimensions: overrides.expectedDimensions ?? 4,
    timeoutMs: overrides.timeoutMs ?? 5000,
    resolveApiKey: overrides.resolveApiKey ?? (async () => API_KEY),
  })
}

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run()
  } catch (error) {
    if (error instanceof EmbeddingCancelledError) return 'cancelled'
    if (error instanceof EmbeddingProviderError) return error.reason
    throw error
  }
  throw new Error('expected the embed call to fail')
}

describe('request shape', () => {
  it('POSTs exactly {model, input} to <base>/embeddings with Bearer auth', async () => {
    const { provider, server } = await wiredProvider()
    await provider.embed(['alpha', 'beta'])
    expect(server.requests).toHaveLength(1)
    const request = server.requests[0]!
    expect(request.url).toBe('/embeddings')
    expect(request.method).toBe('POST')
    expect(Object.keys(request.body).sort()).toEqual(['input', 'model'])
    expect(request.body.model).toBe('fake-model')
    expect(request.body.input).toEqual(['alpha', 'beta'])
    expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`)
    expect(request.headers['content-type']).toBe('application/json')
  })

  it('never sends a provider-specific dimensions field', async () => {
    const { provider, server } = await wiredProvider()
    await provider.embed(['alpha'])
    expect('dimensions' in (server.requests[0]!.body)).toBe(false)
  })

  it('resolves the credential fresh for every operation', async () => {
    const resolveApiKey = vi.fn(async () => API_KEY)
    const { provider } = await wiredProvider({ resolveApiKey })
    await provider.embed(['alpha'])
    await provider.embed(['beta'])
    expect(resolveApiKey).toHaveBeenCalledTimes(2)
  })
})

describe('failure vocabulary', () => {
  it('fails with credential-missing before any request when no key resolves', async () => {
    const { provider, server } = await wiredProvider({ resolveApiKey: async () => undefined })
    expect(await reasonOf(() => provider.embed(['alpha']))).toBe('credential-missing')
    expect(server.requests).toHaveLength(0)
  })

  it('refuses redirects: a 302 is an ordinary network failure', async () => {
    const { provider, server } = await wiredProvider()
    server.setHandler(() => ({ status: 302, payload: { location: 'http://127.0.0.1/moved' } }))
    expect(await reasonOf(() => provider.embed(['alpha']))).toBe('network-failed')
  })

  it('maps HTTP error statuses to http-error and never reads the body', async () => {
    for (const status of [429, 500, 503]) {
      const { provider, server } = await wiredProvider()
      server.setHandler(() => ({ status, payload: { error: `secret echo of ${API_KEY}` } }))
      const failure = async () => provider.embed(['alpha'])
      expect(await reasonOf(failure)).toBe('http-error')
      // The wire request legitimately carries the Bearer credential; the
      // guarantee is that the ERROR carries neither the key nor any body echo.
      try {
        await provider.embed(['alpha'])
      } catch (error) {
        expect((error as Error).message).not.toContain(API_KEY)
        expect((error as Error).message).not.toContain('secret echo')
      }
    }
  })

  it('maps an unparseable success body to invalid-json', async () => {
    const { provider, server } = await wiredProvider()
    server.setHandler(() => ({ status: 200, payload: undefined }))
    expect(await reasonOf(() => provider.embed(['alpha']))).toBe('invalid-json')
  })

  it('maps structurally wrong payloads to malformed-payload', async () => {
    const cases: unknown[] = [
      {},
      { data: 'nope' },
      { data: [{ embedding: [1, 0, 0, 0] }] },
      { data: [{ index: 0, embedding: 'nope' }] },
    ]
    for (const payload of cases) {
      const { provider, server } = await wiredProvider()
      server.setHandler(() => ({ status: 200, payload }))
      expect(await reasonOf(() => provider.embed(['alpha']))).toBe('malformed-payload')
    }
  })

  it('maps incomplete or wrongly-shaped batches to vector-invalid', async () => {
    const vector = [1, 0, 0, 0]
    const cases: unknown[] = [
      { data: [] },
      { data: [{ index: 0, embedding: vector }, { index: 0, embedding: vector }] },
      { data: [{ index: 0, embedding: [1, 0, 0] }] },
      { data: [{ index: 0, embedding: [0, 0, 0, 0] }] },
    ]
    for (const payload of cases) {
      const { provider, server } = await wiredProvider()
      server.setHandler(() => ({ status: 200, payload }))
      expect(await reasonOf(() => provider.embed(['alpha', 'beta']))).toBe('vector-invalid')
    }
  })

  it('fails with timeout when the endpoint stalls past timeoutMs', async () => {
    const { provider, server } = await wiredProvider({ timeoutMs: 40 })
    server.setHandler(async () => {
      await sleep(600)
      return { status: 200, payload: { data: [{ index: 0, embedding: [1, 0, 0, 0] }] } }
    })
    expect(await reasonOf(() => provider.embed(['alpha']))).toBe('timeout')
  })

  it('never retries: a failed call issues exactly one request', async () => {
    const { provider, server } = await wiredProvider()
    server.setHandler(() => ({ status: 500, payload: {} }))
    await reasonOf(() => provider.embed(['alpha', 'beta']))
    await sleep(20)
    expect(server.requests).toHaveLength(1)
  })
})

describe('cancellation', () => {
  it('rejects an already-cancelled signal before any request', async () => {
    const { provider, server } = await wiredProvider()
    const controller = new AbortController()
    controller.abort()
    await expect(provider.embed(['alpha'], controller.signal)).rejects.toBeInstanceOf(EmbeddingCancelledError)
    expect(server.requests).toHaveLength(0)
  })

  it('propagates a mid-flight cancellation as cancellation, not a failure', async () => {
    const { provider, server } = await wiredProvider()
    server.setHandler(async () => {
      await sleep(600)
      return { status: 200, payload: { data: [{ index: 0, embedding: [1, 0, 0, 0] }] } }
    })
    const controller = new AbortController()
    const pending = provider.embed(['alpha'], controller.signal)
    setTimeout(() => controller.abort(), 20)
    await expect(pending).rejects.toBeInstanceOf(EmbeddingCancelledError)
  })
})

describe('successful batches', () => {
  it('reconstructs request order from response indices whatever the response order', async () => {
    const { provider, server } = await wiredProvider()
    server.setHandler(() => ({
      status: 200,
      payload: {
        data: [
          { index: 2, embedding: [0, 0, 0, 1] },
          { index: 0, embedding: [1, 0, 0, 0] },
          { index: 1, embedding: [0, 1, 0, 0] },
        ],
      },
    }))
    const vectors = await provider.embed(['a', 'b', 'c'])
    expect(vectors[0]).toEqual([1, 0, 0, 0])
    expect(vectors[1]).toEqual([0, 1, 0, 0])
    expect(vectors[2]).toEqual([0, 0, 0, 1])
  })

  it('returns L2-normalized vectors and makes one request per call', async () => {
    const { provider, server } = await wiredProvider()
    server.setVector('alpha', [3, 4, 0, 0])
    server.setVector('beta', [0, 0, 5, 12])
    const vectors = await provider.embed(['alpha', 'beta'])
    expect(vectors[0]).toEqual([0.6, 0.8, 0, 0])
    expect(vectors[1]).toEqual([0, 0, 5 / 13, 12 / 13])
    expect(server.requests).toHaveLength(1)
  })

  it('normalizes unnormalized provider output', async () => {
    const { provider, server } = await wiredProvider()
    server.setHandler(() => ({ status: 200, payload: { data: [{ index: 0, embedding: [2, 2, 0, 0] }] } }))
    const vectors = await provider.embed(['alpha'])
    const norm = Math.sqrt(vectors[0]!.reduce((sum, value) => sum + value * value, 0))
    expect(norm).toBeCloseTo(1, 12)
  })
})
