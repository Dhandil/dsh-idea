/**
 * Shared fixtures for the T11 semantic suites: a loopback-only fake
 * OpenAI-compatible `/embeddings` server with per-text deterministic vector
 * control, and a semantic harness that mounts the real IdeaSemanticService
 * over the real storage stack with a stubbed credential seam. No real
 * provider, network, or model call ever leaves 127.0.0.1.
 * @module tests/helpers/semantic
 */

import { createServer, type RequestListener } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import { harness } from './harness.ts'
import IdeaSemanticService from '../../src/semantic/index.ts'
import type { SemanticEmbeddingRecord, SemanticMode } from '../../src/semantic/types.ts'
import { FakeAgentDefaultModel, FakeLlm, FakeSessionQuery } from './preparation.ts'

/**
 * The stored embedding record for one idea, read straight off the durable
 * per-record document (`root/idea_semantic/embeddings/<ideaId>.json`).
 * `undefined` = absent or unreadable. The domain is held open by the
 * service, so disk is the observable for index state.
 */
export async function storedEmbedding(root: string, ideaId: string): Promise<SemanticEmbeddingRecord | undefined> {
  try {
    const document = JSON.parse(await readFile(join(root, 'idea_semantic', 'embeddings', `${ideaId}.json`), 'utf8')) as
      { version: number; record: SemanticEmbeddingRecord }
    return document.record
  } catch {
    return undefined
  }
}

/** Whether the stored embedding document for one idea exists. */
export async function embeddingExists(root: string, ideaId: string): Promise<boolean> {
  return await storedEmbedding(root, ideaId) !== undefined
}

export interface RecordedEmbeddingRequest {
  url: string
  method: string
  headers: Record<string, string | string[] | undefined>
  body: { model?: unknown; input?: unknown }
}

export interface FakeEmbeddingServer {
  url: string
  port: number
  requests: RecordedEmbeddingRequest[]
  /** Pin the exact vector one input text maps to (overrides the hash default). */
  setVector(text: string, vector: readonly number[]): void
  /** Replace the response handler; the default serves `vectorFor` results. May be async. */
  setHandler(handler: (body: { model?: unknown; input?: unknown }) =>
    { status: number; payload: unknown } | Promise<{ status: number; payload: unknown }>): void
  close(): Promise<void>
}

/** A deterministic unit vector derived from the text (stable across runs). */
export function hashVector(text: string, dimensions: number): number[] {
  const raw = new Array<number>(dimensions).fill(0)
  for (let index = 0; index < text.length; index += 1) {
    const slot = index % dimensions
    raw[slot] = (raw[slot] ?? 0) + text.charCodeAt(index)
  }
  raw[0] = (raw[0] ?? 0) + 1
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0))
  return raw.map(value => value / norm)
}

/** One loopback fake `/embeddings` endpoint. */
export async function fakeEmbeddingServer(options: { dimensions?: number } = {}): Promise<FakeEmbeddingServer> {
  const dimensions = options.dimensions ?? 4
  const requests: RecordedEmbeddingRequest[] = []
  const vectors = new Map<string, readonly number[]>()
  let handler: (body: { model?: unknown; input?: unknown }) =>
    { status: number; payload: unknown } | Promise<{ status: number; payload: unknown }> = (body) => {
    const inputs = Array.isArray(body.input) ? body.input as unknown[] : []
    return {
      status: 200,
      payload: {
        data: inputs.map((input, index) => {
          const text = typeof input === 'string' ? input : ''
          return { index, embedding: vectors.get(text) ?? hashVector(text, dimensions) }
        }),
      },
    }
  }
  const listener: RequestListener = (request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      let body: { model?: unknown; input?: unknown } = {}
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { model?: unknown; input?: unknown }
      } catch {
        body = {}
      }
      requests.push({
        url: request.url ?? '',
        method: request.method ?? '',
        headers: request.headers,
        body,
      })
      void Promise.resolve(handler(body)).then(outcome => {
        response.writeHead(outcome.status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(outcome.payload))
      })
    })
  }
  const server = createServer(listener)
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests,
    setVector: (text, vector) => { vectors.set(text, vector) },
    setHandler: (next) => { handler = next },
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()) }),
  }
}

/** The live servers to close after each suite. */
export const servers: FakeEmbeddingServer[] = []

export async function closeServers(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => server.close()))
}

export interface SemanticHarnessOptions {
  /** Explicit backend mode; wins over the legacy `enabled` flag. */
  mode?: SemanticMode
  enabled?: boolean
  dimensions?: number
  /** Set to simulate an unconfigured credential (resolve yields undefined). */
  noApiKey?: boolean
  /** Reuse an existing durable root (persistence/reconciliation tests). */
  root?: string
  config?: Partial<{
    mode: SemanticMode
    enabled: boolean
    baseURL: string
    model: string
    apiKeyEnv: string
    expectedDimensions: number
    timeoutMs: number
    batchSize: number
  }>
}

/**
 * Provide the credential seam and mount the real IdeaSemanticService over an
 * existing context, pointed at one specific fake server (so a remount over
 * the same server keeps the same embedding profile id).
 */
export async function mountSemantic(
  env: Awaited<ReturnType<typeof harness>>,
  server: FakeEmbeddingServer,
  options: SemanticHarnessOptions = {},
): Promise<void> {
  env.ctx.provide('credentials', {
    resolve: async () => options.noApiKey === true
      ? undefined
      : { value: 'test-key', source: 'test' },
  } as never)
  await env.ctx.plugin(IdeaSemanticService, {
    ...(options.mode !== undefined ? { mode: options.mode } : { enabled: options.enabled ?? true }),
    baseURL: server.url,
    model: 'fake-model',
    expectedDimensions: options.dimensions ?? 4,
    ...options.config,
  })
}

/**
 * The idea harness plus the real semantic service pointed at a fake loopback
 * server and a stubbed credential seam (a test key resolves by default; pass
 * `noApiKey` to simulate an unconfigured credential).
 */
export async function semanticHarness(options: SemanticHarnessOptions = {}): Promise<Awaited<ReturnType<typeof harness>> & { server: FakeEmbeddingServer }> {
  const server = await fakeEmbeddingServer({ dimensions: options.dimensions })
  servers.push(server)
  const env = await harness(options.root)
  await mountSemantic(env, server, options)
  return { ...env, server }
}

/** Wait until `predicate` holds (may be async), polling the event loop. */
export async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('until: condition not reached')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/** A plain delay, for racing provider timeouts and cancellations. */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

type LlmSemanticBase = Awaited<ReturnType<typeof harness>> & { server: FakeEmbeddingServer }

/**
 * The llm-mode semantic harness: the real IdeaSemanticService mounted with
 * `mode: 'llm'` over the real storage stack, with the three LLM-side seams
 * provided as scripted fakes and the credential seam stubbed. A fake
 * loopback embedding server stays mounted in the config solely so isolation
 * tests can assert it receives zero requests.
 */
export async function llmSemanticHarness(
  options: Pick<SemanticHarnessOptions, 'root' | 'noApiKey'> & {
    config?: SemanticHarnessOptions['config']
  } = {},
): Promise<LlmSemanticBase & {
  sessionQuery: FakeSessionQuery
  agentDefaultModel: FakeAgentDefaultModel
  llm: FakeLlm
}> {
  const server = await fakeEmbeddingServer()
  servers.push(server)
  const sessionQuery = new FakeSessionQuery()
  const agentDefaultModel = new FakeAgentDefaultModel()
  const llm = new FakeLlm()
  const env: Awaited<ReturnType<typeof harness>> = await harness(options.root)
  const ctx: Context = env.ctx
  ctx.provide('sessionQuery', sessionQuery as never)
  ctx.provide('agentDefaultModel', agentDefaultModel as never)
  ctx.provide('llm', llm as never)
  ctx.provide('credentials', {
    resolve: async () => options.noApiKey === true
      ? undefined
      : { value: 'test-key', source: 'test' },
  } as never)
  await ctx.plugin(IdeaSemanticService, {
    mode: 'llm',
    baseURL: server.url,
    model: 'fake-model',
    expectedDimensions: 4,
    ...options.config,
  })
  return { ...env, server, sessionQuery, agentDefaultModel, llm }
}
