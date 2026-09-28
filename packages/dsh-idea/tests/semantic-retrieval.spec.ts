/**
 * The semantic branch of resurfacing retrieval over the real
 * IdeaSemanticService (T11 §41): eligibility validated candidate-locally
 * against canonical state, exactly one bounded query embedding paid only
 * when eligible records exist, exact-scan ranking with its frozen
 * tie-breakers, and per-record degradation. Also the §43 privacy pins: the
 * only indexing input is the deterministic document and the only query
 * input is the bounded turn plus prior visible context — never captured
 * context, transcripts, judge text, budget state, or credentials. No real
 * provider, network, or model call leaves 127.0.0.1.
 * @module tests/semantic-retrieval.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSemanticDocument } from '../src/semantic/document.ts'
import {
  buildSemanticQueryText,
  boundSemanticQueryInput,
  selectSemanticTopK,
  SEMANTIC_TOP_K,
} from '../src/semantic/retrieval.ts'
import type { SemanticScoredRecord } from '../src/semantic/retrieval.ts'
import type { IdeaSemanticResurfacingCandidatesResult } from '../src/remote-host/types.ts'
import {
  closeServers,
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
import { IdeaId, IdeaVersionId } from '../src/types.ts'

afterEach(closeServers)
afterEach(cleanup)

const RETRIEVAL_SESSION = 'session-retrieval'

/**
 * Handler for a remounted service whose stale/corrupt records must NOT be
 * repaired before retrieval: indexing requests (documents start with the
 * frozen `Title:` field) fail so startup reconciliation cannot rebuild them,
 * while query requests (`user: …`) are served normally.
 */
function indexFailsQueryServes(server: FakeEmbeddingServer): void {
  server.setHandler((body) => {
    const inputs = (Array.isArray(body.input) ? body.input : []) as string[]
    if (inputs.some(input => input.startsWith('Title:'))) return { status: 500, payload: {} }
    return {
      status: 200,
      payload: { data: inputs.map((input, index) => ({ index, embedding: hashVector(input, 4) })) },
    }
  })
}

/** Rewrite one field inside a stored record, on disk, for a later remount. */
async function corruptStoredRecord(root: string, ideaId: string, patch: Record<string, unknown>): Promise<void> {
  const recordPath = join(root, 'idea_semantic', 'embeddings', `${ideaId}.json`)
  const document = JSON.parse(await readFile(recordPath, 'utf8')) as { version: number; record: Record<string, unknown> }
  Object.assign(document.record, patch)
  await writeFile(recordPath, JSON.stringify(document), 'utf8')
}

/** The canonical query text for one retrieval call. */
const queryTextOf = (currentTurn: string, recentContext: readonly { role: 'user' | 'assistant'; text: string }[] = []): string =>
  buildSemanticQueryText(currentTurn, recentContext)

/** One idea indexed and settled, with its draft and aggregate kept. */
async function indexedIdea(
  env: Awaited<ReturnType<typeof semanticHarness>>,
  overrides: Partial<{ title: string; sessionId: string; vector: readonly number[] }> = {},
) {
  const title = overrides.title ?? 'Semantic retrieval idea'
  const theDraft = draft({ title })
  const aggregate = await env.service.create(theDraft, sourceDraft({ sessionId: overrides.sessionId ?? 'session-birth' }))
  if (overrides.vector !== undefined) {
    env.server.setVector(buildSemanticDocument(theDraft), overrides.vector)
  }
  await until(async () => await storedEmbedding(env.root, aggregate.idea.ideaId) !== undefined)
  await sleep(20)
  return { aggregate, theDraft }
}

const retrieve = async (
  env: Awaited<ReturnType<typeof semanticHarness>>,
  currentTurn: string,
  recentContext: readonly { role: 'user' | 'assistant'; text: string }[] = [],
  sessionId: string = RETRIEVAL_SESSION,
): Promise<IdeaSemanticResurfacingCandidatesResult> => {
  return await env.ctx.ideaSemantic.semanticResurfacingCandidates({
    sessionId,
    currentTurn,
    recentContext,
  })
}

describe('query-payment gating', () => {
  it('pays zero query embeddings when no eligible records exist', async () => {
    const env = await semanticHarness()
    const result = await retrieve(env, 'Anything at all?')
    expect(result.candidates).toEqual([])
    expect(env.server.requests).toHaveLength(0)
  })

  it('returns empty with zero provider traffic while disabled', async () => {
    const env = await semanticHarness({ enabled: false })
    const result = await retrieve(env, 'Anything at all?')
    expect(result.candidates).toEqual([])
    expect(env.server.requests).toHaveLength(0)
  })

  it('degrades to empty without a request when the credential is unconfigured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-retrieval-nokey-'))
    try {
      const server = await fakeEmbeddingServer()
      servers.push(server)
      const first = await harness(root)
      await mountSemantic(first, server)
      const aggregate = await first.service.create(draft(), sourceDraft())
      await until(async () => await storedEmbedding(root, aggregate.idea.ideaId) !== undefined)
      await first.ctx.fiber.dispose()
      const requestsBefore = server.requests.length

      const second = await harness(root)
      await mountSemantic(second, server, { noApiKey: true })
      const result = await second.ctx.ideaSemantic.semanticResurfacingCandidates({
        sessionId: RETRIEVAL_SESSION,
        currentTurn: 'Similar direction please',
        recentContext: [],
      })
      // Eligible records exist, but the query embedding fails closed before
      // any wire traffic: silent empty, zero new requests.
      expect(result.candidates).toEqual([])
      expect(server.requests).toHaveLength(requestsBefore)
      await second.ctx.fiber.dispose()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
})

describe('candidate-local eligibility', () => {
  it('excludes the idea whose source discussion is the current conversation', async () => {
    const env = await semanticHarness()
    const { aggregate } = await indexedIdea(env, { sessionId: RETRIEVAL_SESSION })
    const birth = await retrieve(env, 'Talk about the idea')
    expect(birth.candidates).toEqual([])
    const elsewhere = await retrieve(env, 'Talk about the idea', [], 'session-stranger')
    expect(elsewhere.candidates.map(candidate => candidate.ideaId)).toEqual([aggregate.idea.ideaId])
  })

  it('excludes the idea whose continued discussion hosts the current conversation', async () => {
    const env = await semanticHarness()
    const { aggregate } = await indexedIdea(env)
    await env.service.continueDiscussion(aggregate.idea.ideaId, async () => 'session-disc-1')

    const hostContext = await env.ctx.ideaSemantic.semanticResurfacingCandidates({
      sessionId: 'session-disc-1',
      currentTurn: 'Continue this idea here',
      recentContext: [],
    })
    expect(hostContext.candidates).toEqual([])

    const stranger = await retrieve(env, 'Continue this idea here')
    expect(stranger.candidates.map(candidate => candidate.ideaId)).toEqual([aggregate.idea.ideaId])
  })

  it('excludes archived ideas', async () => {
    const env = await semanticHarness()
    const { aggregate } = await indexedIdea(env)
    await env.service.archive(aggregate.idea.ideaId, aggregate.idea.currentVersionId)
    await sleep(30)
    const result = await retrieve(env, 'Anything')
    expect(result.candidates).toEqual([])
  })

  it('excludes a record whose version is stale after a failed rebuild', async () => {
    const env = await semanticHarness()
    const { aggregate, theDraft } = await indexedIdea(env)
    let failing = false
    env.server.setHandler((body) => {
      if (failing) return { status: 500, payload: {} }
      const inputs = body.input as readonly string[]
      return {
        status: 200,
        payload: { data: inputs.map((input, index) => ({ index, embedding: hashVector(input, 4) })) },
      }
    })
    failing = true
    const edited = draft({ title: `${theDraft.title} rewritten` })
    await env.service.manualEdit(aggregate.idea.ideaId, edited, aggregate.idea.currentVersionId)
    await sleep(60)
    failing = false

    const result = await retrieve(env, 'Anything')
    expect(result.candidates).toEqual([])
  })

  it('excludes records with foreign profile or stale hash, without failing siblings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-retrieval-stale-'))
    try {
      const server = await fakeEmbeddingServer()
      servers.push(server)
      const first = await harness(root)
      await mountSemantic(first, server)
      const kept = await first.service.create(draft({ title: 'Healthy idea' }), sourceDraft())
      const broken = await first.service.create(draft({ title: 'Broken idea' }), sourceDraft())
      await until(async () => await storedEmbedding(root, broken.idea.ideaId) !== undefined)
      await until(async () => await storedEmbedding(root, kept.idea.ideaId) !== undefined)
      const realProfile = (await storedEmbedding(root, broken.idea.ideaId))!.embeddingProfileId
      await first.ctx.fiber.dispose()

      const retrieveOverRoot = async (): Promise<IdeaSemanticResurfacingCandidatesResult> => {
        const env = await harness(root)
        await mountSemantic(env, server)
        const result = await env.ctx.ideaSemantic.semanticResurfacingCandidates({
          sessionId: RETRIEVAL_SESSION,
          currentTurn: 'Anything',
          recentContext: [],
        })
        await env.ctx.fiber.dispose()
        return result
      }

      // A foreign embedding profile id marks the record unusable for this
      // index; reconciliation cannot repair it (indexing fails) and the
      // query must skip exactly that record, keeping its sibling.
      await corruptStoredRecord(root, broken.idea.ideaId, { embeddingProfileId: 'f'.repeat(64) })
      indexFailsQueryServes(server)
      await sleep(150)
      const firstResult = await retrieveOverRoot()
      expect(firstResult.candidates.map(candidate => candidate.ideaId)).toEqual([kept.idea.ideaId])

      // Restoring the real profile but stale-ing the content hash fails the
      // exact-validity check the same way.
      await corruptStoredRecord(root, broken.idea.ideaId, {
        embeddingProfileId: realProfile,
        contentHash: 'e'.repeat(64),
      })
      const secondResult = await retrieveOverRoot()
      expect(secondResult.candidates.map(candidate => candidate.ideaId)).toEqual([kept.idea.ideaId])
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
})

describe('exact-scan ranking', () => {
  it('ranks by similarity, caps at top-K, and labels the exact indexed version', async () => {
    const env = await semanticHarness()
    const queryVector = [1, 0, 0, 0]
    const near = await indexedIdea(env, { title: 'Near idea', vector: [Math.sqrt(0.75), 0.5, 0, 0] })
    const closest = await indexedIdea(env, { title: 'Closest idea', vector: [1, 0, 0, 0] })
    const far = await indexedIdea(env, { title: 'Far idea', vector: [0, 1, 0, 0] })
    for (let index = 0; index < 14; index += 1) {
      await indexedIdea(env, { title: `Filler idea ${index}`, vector: [0, 0, 1, 0] })
    }

    const turn = 'Rank me by vectors'
    env.server.setVector(queryTextOf(turn), queryVector)
    const result = await retrieve(env, turn)

    expect(result.candidates.length).toBe(SEMANTIC_TOP_K)
    expect(result.candidates[0]!.ideaId).toBe(closest.aggregate.idea.ideaId)
    expect(result.candidates[1]!.ideaId).toBe(near.aggregate.idea.ideaId)
    expect(result.candidates.map(candidate => candidate.ideaId)).not.toContain(far.aggregate.idea.ideaId)
    expect(result.candidates[0]!.semanticRank).toBe(1)
    expect(result.candidates[0]!.evaluatedVersionId).toBe(closest.aggregate.idea.currentVersionId)
    expect(result.candidates[0]!.title).toBe('Closest idea')
    // The projection carries exactly the seven business fields + rank.
    expect(Object.keys(result.candidates[0]!).sort()).toEqual([
      'core',
      'currentConclusion',
      'evaluatedVersionId',
      'ideaId',
      'possibleValue',
      'semanticRank',
      'title',
      'useWhen',
    ])
  })

  it('breaks similarity ties by updatedAt DESC', async () => {
    const env = await semanticHarness()
    const tieVector = [1, 0, 0, 0]
    const older = await indexedIdea(env, { title: 'Older tie idea', vector: tieVector })
    await sleep(5)
    const newer = await indexedIdea(env, { title: 'Newer tie idea', vector: tieVector })

    const turn = 'Tie break please'
    env.server.setVector(queryTextOf(turn), tieVector)
    const result = await retrieve(env, turn)

    expect(result.candidates[0]!.ideaId).toBe(newer.aggregate.idea.ideaId)
    expect(result.candidates[1]!.ideaId).toBe(older.aggregate.idea.ideaId)
  })

  it('excludes records whose stored vector is non-finite or zero at scan time', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-retrieval-scan-'))
    try {
      const server = await fakeEmbeddingServer()
      servers.push(server)
      const first = await harness(root)
      await mountSemantic(first, server)
      const healthy = await first.service.create(draft({ title: 'Healthy scan idea' }), sourceDraft())
      const nan = await first.service.create(draft({ title: 'NaN scan idea' }), sourceDraft())
      const zero = await first.service.create(draft({ title: 'Zero scan idea' }), sourceDraft())
      for (const aggregate of [healthy, nan, zero]) {
        await until(async () => await storedEmbedding(root, aggregate.idea.ideaId) !== undefined)
      }
      await first.ctx.fiber.dispose()

      // JSON cannot carry NaN: it serializes to null, which fails the record
      // schema and reads back as absent (backup-and-skip). The zero vector is
      // schema-valid, so it loads — and must be excluded by the scan's
      // defensive re-validation instead of poisoning the ranking.
      await corruptStoredRecord(root, nan.idea.ideaId, { vector: [null, 0, 0, 0] })
      await corruptStoredRecord(root, zero.idea.ideaId, { vector: [0, 0, 0, 0] })
      indexFailsQueryServes(server)
      await sleep(150)

      const env = await harness(root)
      await mountSemantic(env, server)
      const result = await env.ctx.ideaSemantic.semanticResurfacingCandidates({
        sessionId: RETRIEVAL_SESSION,
        currentTurn: 'Scan me',
        recentContext: [],
      })
      expect(result.candidates.map(candidate => candidate.ideaId)).toEqual([healthy.idea.ideaId])
      await env.ctx.fiber.dispose()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })
})

describe('pure query mechanics', () => {
  it('applies exactly the T10 bounds to the query input', () => {
    const bounded = boundSemanticQueryInput(
      'x'.repeat(3000),
      [
        { role: 'assistant', text: 'a'.repeat(500) },
        { role: 'user', text: '' },
        { role: 'moderator' as never, text: 'dropped role' },
        { role: 'user', text: 'kept' },
      ],
    )
    expect(bounded.currentTurn.length).toBe(2000)
    expect(bounded.recentContext).toHaveLength(3)
    expect(bounded.recentContext[0]).toEqual({ role: 'assistant', text: 'a'.repeat(400) })
    expect(bounded.recentContext[2]).toEqual({ role: 'user', text: 'kept' })
  })

  it('builds the query as prior visible context then the user turn — nothing else', () => {
    const text = buildSemanticQueryText(
      'What about the tower defense idea?',
      [
        { role: 'user', text: 'First message' },
        { role: 'assistant', text: 'First reply' },
      ],
    )
    expect(text).toBe([
      'user: First message',
      'assistant: First reply',
      'user: What about the tower defense idea?',
    ].join('\n'))
  })

  it('caps the exact scan at the frozen top-K over synthetic scores', () => {
    const scored: SemanticScoredRecord[] = Array.from({ length: 30 }, (_, index) => ({
      record: {
        ideaId: IdeaId(`idea_${index}`),
        versionId: IdeaVersionId('idea_ver_x'),
        embeddingProfileId: 'a'.repeat(64),
        documentVersion: 1,
        contentHash: 'b'.repeat(64),
        dimensions: 1,
        vector: [1],
        createdAt: 1,
      },
      similarity: 1 - index / 100,
      updatedAt: index,
      ideaId: IdeaId(`idea_${index}`),
    }))
    const selected = selectSemanticTopK(scored)
    expect(selected).toHaveLength(SEMANTIC_TOP_K)
    expect(selected[0]!.ideaId).toBe('idea_0')
    expect(selected[11]!.ideaId).toBe('idea_11')
  })
})

describe('privacy pins (§43)', () => {
  it('sends only deterministic documents for indexing and only the bounded query for retrieval', async () => {
    const env = await semanticHarness()
    const theDraft = draft({ title: 'Privacy pin idea' })
    const secretProvenance = 'CAPTURED-CONTEXT-MARKER transcript text'
    const secretAggregate = await env.service.create(theDraft, sourceDraft({
      sessionId: 'session-birth',
      capturedContext: [{ role: 'assistant', text: secretProvenance }],
    }))
    // Wait for the record to be durable, not merely requested: eligibility
    // (and therefore the query embedding) exists only after the index put.
    await until(async () => await storedEmbedding(env.root, secretAggregate.idea.ideaId) !== undefined)
    await sleep(20)

    for (const request of env.server.requests) {
      const inputs = request.body.input as readonly string[]
      for (const input of inputs) {
        expect(input).toBe(buildSemanticDocument(theDraft))
        expect(input).not.toContain(secretProvenance)
        expect(input).not.toContain('user:')
        expect(input).not.toContain('assistant:')
        expect(input).not.toContain('test-key')
      }
      expect(request.headers.authorization).toBe('Bearer test-key')
    }

    const turn = 'Privacy turn for retrieval'
    env.server.setVector(queryTextOf(turn), [1, 0, 0, 0])
    await retrieve(env, turn, [{ role: 'user', text: 'Earlier visible message' }])
    const queryRequest = env.server.requests.at(-1)!
    expect(queryRequest.body.input).toEqual([
      ['user: Earlier visible message', `user: ${turn}`].join('\n'),
    ])
  })

  it('never lets the triggering assistant reply or budget state reach any provider input', async () => {
    const env = await semanticHarness()
    await indexedIdea(env)
    const turn = 'A triggering user turn'
    env.server.setVector(queryTextOf(turn), [1, 0, 0, 0])
    await retrieve(env, turn)
    const queryRequest = env.server.requests.at(-1)!
    const inputText = JSON.stringify(queryRequest.body.input)
    expect(inputText).not.toContain('assistant:')
    expect(inputText).not.toContain('budget')
    expect(inputText).not.toContain('CLAIMED')
  })

  it('makes zero provider calls when disabled even across a full retrieval flow', async () => {
    const env = await semanticHarness({ enabled: false })
    await env.service.create(draft(), sourceDraft())
    await retrieve(env, 'Turn text')
    await sleep(20)
    expect(servers.every(server => server.requests.length === 0) || env.server.requests.length === 0).toBe(true)
    expect(env.server.requests).toHaveLength(0)
  })
})
