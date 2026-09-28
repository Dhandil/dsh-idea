/**
 * The semantic index lifecycle over the real IdeaSemanticService, the real
 * IdeaService, and real storage-domain/json durability (T11 §39/§40): inert
 * mounting when disabled, coalescing latest-wins indexing, per-batch caps,
 * archive/delete handling, provider-failure isolation with no retry, the
 * change-listener filters, startup reconciliation as the only recovery, and
 * the post-I/O stale guards (a late old-version response is dropped, never
 * persisted). The provider is always the loopback fake server; no real
 * embedding, provider, or public network call exists.
 * @module tests/semantic-index.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildSemanticDocument,
  hashSemanticDocument,
} from '../src/semantic/document.ts'
import {
  closeServers,
  embeddingExists,
  fakeEmbeddingServer,
  hashVector,
  mountSemantic,
  semanticHarness,
  servers,
  sleep,
  storedEmbedding,
  until,
  type FakeEmbeddingServer,
} from './helpers/semantic.ts'
import { cleanup, draft, harness, sourceDraft } from './helpers/harness.ts'

afterEach(closeServers)
afterEach(cleanup)

/**
 * Index-quiescence for one root: wait for a record whose contentHash stays
 * stable across a settle interval, so a coalesced latest-wins write in
 * flight under worker/load timing cannot be observed mid-flight.
 */
async function settle(root: string, ideaId: string): Promise<void> {
  await until(async () => {
    const first = await storedEmbedding(root, ideaId)
    if (first === undefined) return false
    await sleep(50)
    const second = await storedEmbedding(root, ideaId)
    return second !== undefined && second.contentHash === first.contentHash
  }, 5_000)
}

describe('inert mounting', () => {
  it('enabled=false makes zero provider calls and writes zero records', async () => {
    const env = await semanticHarness({ enabled: false })
    const aggregate = await env.service.create(draft(), sourceDraft())
    await sleep(50)
    expect(env.server.requests).toHaveLength(0)
    expect(await storedEmbedding(env.root, aggregate.idea.ideaId)).toBeUndefined()
  })
})

describe('indexing', () => {
  it('indexes a created idea with the exact frozen record shape', async () => {
    const env = await semanticHarness()
    const theDraft = draft({ title: 'Vector identity test idea' })
    const aggregate = await env.service.create(theDraft, sourceDraft())
    await settle(env.root, aggregate.idea.ideaId)

    expect(env.server.requests).toHaveLength(1)
    const request = env.server.requests[0]!
    const document = buildSemanticDocument(theDraft)
    expect(request.body.input).toEqual([document])

    const record = await storedEmbedding(env.root, aggregate.idea.ideaId)
    expect(record).toBeDefined()
    expect(record!.versionId).toBe(aggregate.idea.currentVersionId)
    expect(record!.contentHash).toBe(hashSemanticDocument(document))
    expect(record!.documentVersion).toBe(1)
    expect(record!.dimensions).toBe(4)
    expect(record!.embeddingProfileId).toMatch(/^[0-9a-f]{64}$/)
    const norm = Math.sqrt(record!.vector.reduce((sum, value) => sum + value * value, 0))
    expect(norm).toBeCloseTo(1, 12)
  })

  it('coalesces rapid same-idea writes latest-wins into one final record', async () => {
    const env = await semanticHarness()
    const first = draft({ title: 'Coalesce first title' })
    const second = draft({ title: 'Coalesce second title' })
    env.server.setVector(buildSemanticDocument(first), hashVector('first-vector', 4))
    env.server.setVector(buildSemanticDocument(second), hashVector('second-vector', 4))

    const aggregate = await env.service.create(first, sourceDraft())
    await env.service.manualEdit(aggregate.idea.ideaId, second, aggregate.idea.currentVersionId)
    await settle(env.root, aggregate.idea.ideaId)

    for (const request of env.server.requests) {
      const inputs = request.body.input as readonly unknown[]
      for (const input of inputs) {
        expect([buildSemanticDocument(first), buildSemanticDocument(second)]).toContain(input)
      }
    }
    const record = await storedEmbedding(env.root, aggregate.idea.ideaId)
    expect(record!.contentHash).toBe(hashSemanticDocument(buildSemanticDocument(second)))
    const expectedVector = hashVector('second-vector', 4)
    record!.vector.forEach((value, index) => expect(value).toBeCloseTo(expectedVector[index]!, 12))
    expect(env.server.requests.length).toBeLessThanOrEqual(2)
  })

  it('indexes distinct ideas independently', async () => {
    const env = await semanticHarness()
    const first = await env.service.create(draft({ title: 'Independent one' }), sourceDraft())
    const second = await env.service.create(draft({ title: 'Independent two' }), sourceDraft())
    await settle(env.root, first.idea.ideaId)
    await until(async () => await storedEmbedding(env.root, second.idea.ideaId) !== undefined)
    expect((await storedEmbedding(env.root, first.idea.ideaId))!.contentHash)
      .toBe(hashSemanticDocument(buildSemanticDocument(draft({ title: 'Independent one' }))))
    expect((await storedEmbedding(env.root, second.idea.ideaId))!.contentHash)
      .toBe(hashSemanticDocument(buildSemanticDocument(draft({ title: 'Independent two' }))))
  })

  it('caps every provider request at batchSize documents', async () => {
    const env = await semanticHarness({ config: { batchSize: 2 } })
    const aggregates: Awaited<ReturnType<typeof env.service.create>>[] = []
    for (let index = 0; index < 5; index += 1) {
      aggregates.push(await env.service.create(draft({ title: `Batched idea ${index}` }), sourceDraft()))
    }
    await until(async () => {
      for (const aggregate of aggregates) {
        if (await storedEmbedding(env.root, aggregate.idea.ideaId) === undefined) return false
      }
      return true
    })
    await sleep(30)
    expect(env.server.requests.length).toBeGreaterThanOrEqual(3)
    for (const request of env.server.requests) {
      expect((request.body.input as readonly unknown[]).length).toBeLessThanOrEqual(2)
    }
  })
})

describe('lifecycle transitions', () => {
  it('archives without a new request and keeps the record on disk', async () => {
    const env = await semanticHarness()
    const aggregate = await env.service.create(draft(), sourceDraft())
    await settle(env.root, aggregate.idea.ideaId)
    const requestsBefore = env.server.requests.length
    await env.service.archive(aggregate.idea.ideaId, aggregate.idea.currentVersionId)
    await sleep(50)
    expect(env.server.requests).toHaveLength(requestsBefore)
    expect(await embeddingExists(env.root, aggregate.idea.ideaId)).toBe(true)
  })

  it('deletes the derived record when the idea is deleted', async () => {
    const env = await semanticHarness()
    const aggregate = await env.service.create(draft(), sourceDraft())
    await settle(env.root, aggregate.idea.ideaId)
    await env.service.deleteIdea(aggregate.idea.ideaId, aggregate.idea.currentVersionId)
    await until(async () => !(await embeddingExists(env.root, aggregate.idea.ideaId)))
  })

  it('isolates provider failures: the Idea survives, no retry fires, a later change recovers', async () => {
    const env = await semanticHarness()
    let failing = true
    env.server.setHandler((body) => {
      if (failing) return { status: 500, payload: {} }
      const inputs = body.input as readonly string[]
      return {
        status: 200,
        payload: { data: inputs.map((input, index) => ({ index, embedding: hashVector(input, 4) })) },
      }
    })
    const aggregate = await env.service.create(draft({ title: 'Failure isolation idea' }), sourceDraft())
    await sleep(60)
    expect(env.server.requests).toHaveLength(1)
    expect(env.service.get(aggregate.idea.ideaId).idea.currentVersionId).toBe(aggregate.idea.currentVersionId)
    expect(await embeddingExists(env.root, aggregate.idea.ideaId)).toBe(false)

    failing = false
    const edited = draft({ title: 'Failure isolation idea, edited' })
    await env.service.manualEdit(aggregate.idea.ideaId, edited, aggregate.idea.currentVersionId)
    await until(async () => await embeddingExists(env.root, aggregate.idea.ideaId))
    const record = await storedEmbedding(env.root, aggregate.idea.ideaId)
    expect(record!.contentHash).toBe(hashSemanticDocument(buildSemanticDocument(edited)))
  })
})

describe('change-listener filters', () => {
  it('ignores resurfacing_budgets writes and foreign domains', async () => {
    const env = await semanticHarness()
    const aggregate = await env.service.create(draft(), sourceDraft())
    await settle(env.root, aggregate.idea.ideaId)
    const requestsBefore = env.server.requests.length

    env.ctx.emit('domain/changed', {
      domain: 'idea',
      table: 'resurfacing_budgets',
      key: 'session-1',
      operation: 'put',
    } as never)
    env.ctx.emit('domain/changed', {
      domain: 'some_other_domain',
      table: 'ideas',
      key: aggregate.idea.ideaId,
      operation: 'put',
    } as never)
    await sleep(50)
    expect(env.server.requests).toHaveLength(requestsBefore)
  })
})

describe('startup reconciliation', () => {
  const persistedRoot = async (): Promise<string> => await mkdtemp(join(tmpdir(), 'dsh-idea-semantic-recon-'))
  const dropRoot = async (root: string): Promise<void> => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }

  /** Mount, index one idea, and dispose — over one shared server + root. */
  const indexThenDispose = async (server: FakeEmbeddingServer, root: string) => {
    const first = await harness(root)
    await mountSemantic(first, server)
    const aggregate = await first.service.create(draft(), sourceDraft())
    await until(async () => await storedEmbedding(root, aggregate.idea.ideaId) !== undefined)
    await sleep(30)
    await first.ctx.fiber.dispose()
    return aggregate
  }

  it('reuses an exactly-valid record without any provider call', async () => {
    const root = await persistedRoot()
    try {
      const server = await fakeEmbeddingServer()
      servers.push(server)
      const aggregate = await indexThenDispose(server, root)
      expect(server.requests).toHaveLength(1)

      const second = await harness(root)
      await mountSemantic(second, server)
      await sleep(120)
      // Same server, same profile id: the exactly-valid record is reused
      // verbatim, with no second provider call.
      expect(server.requests).toHaveLength(1)
      const record = await storedEmbedding(root, aggregate.idea.ideaId)
      expect(record!.versionId).toBe(aggregate.idea.currentVersionId)
    } finally {
      await dropRoot(root)
    }
  })

  it('rebuilds a stale record at startup', async () => {
    const root = await persistedRoot()
    try {
      const server = await fakeEmbeddingServer()
      servers.push(server)
      const aggregate = await indexThenDispose(server, root)

      const recordPath = join(root, 'idea_semantic', 'embeddings', `${aggregate.idea.ideaId}.json`)
      const stale = JSON.parse(await readFile(recordPath, 'utf8')) as {
        version: number
        record: { contentHash: string }
      }
      stale.record.contentHash = 'f'.repeat(64)
      await writeFile(recordPath, JSON.stringify(stale), 'utf8')

      const second = await harness(root)
      await mountSemantic(second, server)
      await until(async () =>
        (await storedEmbedding(root, aggregate.idea.ideaId))!.contentHash
        === hashSemanticDocument(buildSemanticDocument(draft())), 10_000)
      expect(server.requests.length).toBeGreaterThanOrEqual(2)
    } finally {
      await dropRoot(root)
    }
  })

  it('rebuilds a missing record at startup', async () => {
    const root = await persistedRoot()
    try {
      const server = await fakeEmbeddingServer()
      servers.push(server)
      const aggregate = await indexThenDispose(server, root)

      const recordPath = join(root, 'idea_semantic', 'embeddings', `${aggregate.idea.ideaId}.json`)
      await rm(recordPath)
      expect(await embeddingExists(root, aggregate.idea.ideaId)).toBe(false)

      const second = await harness(root)
      await mountSemantic(second, server)
      await until(async () => await embeddingExists(root, aggregate.idea.ideaId), 10_000)
    } finally {
      await dropRoot(root)
    }
  })

  it('never rebuilds an archived idea, even with a stale record', async () => {
    const root = await persistedRoot()
    try {
      const server = await fakeEmbeddingServer()
      servers.push(server)
      const first = await harness(root)
      await mountSemantic(first, server)
      const aggregate = await first.service.create(draft(), sourceDraft())
      await until(async () => await storedEmbedding(root, aggregate.idea.ideaId) !== undefined)
      await sleep(30)
      await first.service.archive(aggregate.idea.ideaId, aggregate.idea.currentVersionId)
      await sleep(30)
      await first.ctx.fiber.dispose()

      const recordPath = join(root, 'idea_semantic', 'embeddings', `${aggregate.idea.ideaId}.json`)
      const stale = JSON.parse(await readFile(recordPath, 'utf8')) as {
        version: number
        record: { contentHash: string }
      }
      stale.record.contentHash = 'e'.repeat(64)
      await writeFile(recordPath, JSON.stringify(stale), 'utf8')

      const second = await harness(root)
      await mountSemantic(second, server)
      await sleep(120)
      expect(server.requests).toHaveLength(1)
      expect((await storedEmbedding(root, aggregate.idea.ideaId))!.contentHash).toBe('e'.repeat(64))
    } finally {
      await dropRoot(root)
    }
  })
})

describe('post-I/O stale guards', () => {
  it('drops a late old-version response instead of persisting it', async () => {
    const env = await semanticHarness({ config: { batchSize: 1 } })
    const first = draft({ title: 'Race version one' })
    const second = draft({ title: 'Race version two' })
    env.server.setVector(buildSemanticDocument(first), hashVector('race-one', 4))
    env.server.setVector(buildSemanticDocument(second), hashVector('race-two', 4))

    let calls = 0
    env.server.setHandler(async (body) => {
      calls += 1
      // Batch 2 (the current version) fails outright: the only record that
      // could ever exist afterwards is one persisted from batch 1's late,
      // stale response — exactly what the guard must refuse.
      if (calls === 1) {
        await sleep(150)
        const inputs = body.input as readonly string[]
        return {
          status: 200,
          payload: {
            data: inputs.map((input, index) => ({
              index,
              embedding: hashVector(input === buildSemanticDocument(first) ? 'race-one' : 'race-two', 4),
            })),
          },
        }
      }
      return { status: 500, payload: {} }
    })

    const aggregate = await env.service.create(first, sourceDraft())
    await env.service.manualEdit(aggregate.idea.ideaId, second, aggregate.idea.currentVersionId)
    await sleep(400)

    // Batch 1 (version one) returned late — canonical had already advanced —
    // so it must be dropped; batch 2 (version two) failed with 500. No record
    // may exist: a persisted version-one vector here would prove the guard
    // relabeled stale work.
    expect(await embeddingExists(env.root, aggregate.idea.ideaId)).toBe(false)
  })

  it('cannot let a late response recreate a record after deletion', async () => {
    const env = await semanticHarness()
    let calls = 0
    env.server.setHandler(async (body) => {
      calls += 1
      if (calls === 1) await sleep(150)
      const inputs = body.input as readonly string[]
      return {
        status: 200,
        payload: {
          data: inputs.map((input, index) => ({ index, embedding: hashVector(input, 4) })),
        },
      }
    })

    const aggregate = await env.service.create(draft(), sourceDraft())
    await until(() => env.server.requests.length >= 1)
    await env.service.deleteIdea(aggregate.idea.ideaId, aggregate.idea.currentVersionId)
    await sleep(400)

    expect(await embeddingExists(env.root, aggregate.idea.ideaId)).toBe(false)
  })
})
