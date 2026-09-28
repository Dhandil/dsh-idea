/**
 * Pure semantic core (T11 §37): the deterministic document builder and its
 * hash, the embedding profile identity (canonical base URL, stability,
 * secret exclusion), vector validation / L2 normalization / dot-product
 * ordering, and the durable `idea_semantic` record schema round-trip —
 * including the domain's backup-and-skip policy over real storage-domain +
 * json fixtures. No provider, network, or model call.
 * @module tests/semantic-core.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply,
  Config as storageJsonConfig,
  inject as storageJsonInject,
  name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply,
  Config as storageDomainConfig,
  inject as storageDomainInject,
  name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import { buildSemanticDocument, hashSemanticDocument, semanticContentHash } from '../src/semantic/document.ts'
import {
  canonicalizeBaseURL,
  resolveEmbeddingProfile,
  BaseURLValidationError,
} from '../src/semantic/profile.ts'
import {
  normalizeVector,
  normalizeEmbeddingBatch,
  dotProduct,
  VectorValidationError,
} from '../src/semantic/vector.ts'
import { semanticEmbeddingRecordSchema } from '../src/semantic/schema.ts'
import { ideaDomainSpec } from '../src/spec.ts'
import { ideaSemanticDomainSpec } from '../src/semantic/spec.ts'
import { IdeaId, IdeaVersionId } from '../src/types.ts'
import { draft } from './helpers/harness.ts'
import { closeServers } from './helpers/semantic.ts'

afterEach(closeServers)

const draftA = draft()
const draftB = draft({ currentConclusion: 'A different conclusion changes the document' })

describe('deterministic document', () => {
  it('renders the frozen field order exactly', () => {
    expect(buildSemanticDocument(draftA)).toBe([
      `Title: ${draftA.title}`,
      `Core: ${draftA.core}`,
      `Motivation: ${draftA.motivation}`,
      `Current Conclusion: ${draftA.currentConclusion}`,
      `Possible Value: ${draftA.possibleValue}`,
      `Use When: ${draftA.useWhen.join('; ')}`,
      `Open Questions: ${draftA.openQuestions.join('; ')}`,
    ].join('\n') + '\n')
  })

  it('is byte-identical for identical content across calls', () => {
    expect(buildSemanticDocument(draftA)).toBe(buildSemanticDocument(draft({ ...draftA })))
  })

  it('renders list fields with "; " separators', () => {
    const document = buildSemanticDocument(draftA)
    expect(document).toContain(`Use When: ${draftA.useWhen.join('; ')}`)
    expect(document).toContain(`Open Questions: ${draftA.openQuestions.join('; ')}`)
  })

  it('hashes identical content identically and changed content differently', () => {
    expect(hashSemanticDocument(buildSemanticDocument(draftA)))
      .toBe(hashSemanticDocument(buildSemanticDocument(draftA)))
    expect(hashSemanticDocument(buildSemanticDocument(draftA)))
      .not.toBe(hashSemanticDocument(buildSemanticDocument(draftB)))
    expect(semanticContentHash(draftA)).toBe(hashSemanticDocument(buildSemanticDocument(draftA)))
  })
})

describe('embedding profile', () => {
  it('canonicalizes base URLs: trailing slashes stripped, origin preserved', () => {
    expect(canonicalizeBaseURL('http://example.com')).toBe('http://example.com')
    expect(canonicalizeBaseURL('https://api.example.com/v1///')).toBe('https://api.example.com/v1')
    expect(canonicalizeBaseURL('https://api.example.com////embeddings').endsWith('/embeddings')).toBe(true)
  })

  it('rejects embedded URL credentials and unsupported protocols', () => {
    for (const bad of ['http://user:pass@example.com/v1', 'https://u@example.com', 'ftp://example.com', 'not a url']) {
      expect(() => canonicalizeBaseURL(bad)).toThrow(BaseURLValidationError)
    }
  })

  it('produces a stable profile id for identical identity input', () => {
    const input = {
      adapter: 'openai-compatible',
      baseURL: 'https://api.example.com/v1/',
      model: 'm',
      expectedDimensions: 4,
      documentVersion: 1,
      normalizationVersion: 'l2-v1',
    }
    const first = resolveEmbeddingProfile(input)
    const second = resolveEmbeddingProfile({ ...input })
    expect(first.embeddingProfileId).toBe(second.embeddingProfileId)
    expect(first.embeddingProfileId).toMatch(/^[0-9a-f]{64}$/)
    expect(first.canonicalBaseURL).toBe('https://api.example.com/v1')
  })

  it('changes the profile id when any identity field changes', () => {
    const input = {
      adapter: 'openai-compatible',
      baseURL: 'https://api.example.com/v1',
      model: 'm',
      expectedDimensions: 4,
      documentVersion: 1,
      normalizationVersion: 'l2-v1',
    }
    const baseline = resolveEmbeddingProfile(input).embeddingProfileId
    expect(resolveEmbeddingProfile({ ...input, model: 'other' }).embeddingProfileId).not.toBe(baseline)
    expect(resolveEmbeddingProfile({ ...input, baseURL: 'https://other.example.com' }).embeddingProfileId).not.toBe(baseline)
    expect(resolveEmbeddingProfile({ ...input, expectedDimensions: 8 }).embeddingProfileId).not.toBe(baseline)
    expect(resolveEmbeddingProfile({ ...input, documentVersion: 2 }).embeddingProfileId).not.toBe(baseline)
    expect(resolveEmbeddingProfile({ ...input, normalizationVersion: 'l2-v2' }).embeddingProfileId).not.toBe(baseline)
  })

  it('never carries secret material: no apiKey/env/timeout/batch in the profile', () => {
    const resolved = resolveEmbeddingProfile({
      adapter: 'openai-compatible',
      baseURL: 'https://api.example.com/v1',
      model: 'm',
      expectedDimensions: 4,
      documentVersion: 1,
      normalizationVersion: 'l2-v1',
    })
    const text = JSON.stringify(resolved)
    expect(text).not.toContain('apiKey')
    expect(text).not.toContain('timeoutMs')
    expect(text).not.toContain('batchSize')
    expect(text).not.toContain('secret-value')
  })
})

describe('vector validation', () => {
  it('accepts a finite non-zero vector of the expected length and L2-normalizes it', () => {
    const normalized = normalizeVector([3, 4], 2)
    expect(normalized).toEqual([0.6, 0.8])
    const norm = Math.sqrt(dotProduct(normalized, normalized))
    expect(norm).toBeCloseTo(1, 12)
  })

  it('rejects wrong dimensions, NaN/Infinity, and the zero vector', () => {
    expect(() => normalizeVector([1, 2], 3)).toThrow(VectorValidationError)
    expect(() => normalizeVector([Number.NaN, 1], 2)).toThrow(VectorValidationError)
    expect(() => normalizeVector([Number.POSITIVE_INFINITY, 1], 2)).toThrow(VectorValidationError)
    expect(() => normalizeVector([0, 0], 2)).toThrow(VectorValidationError)
  })

  it('rejects wrong batch counts and duplicate/missing indices', () => {
    expect(() => normalizeEmbeddingBatch([], 1, 2)).toThrow(VectorValidationError)
    expect(() => normalizeEmbeddingBatch([
      { index: 0, embedding: [1, 0] },
      { index: 0, embedding: [0, 1] },
    ], 2, 2)).toThrow(VectorValidationError)
    expect(() => normalizeEmbeddingBatch([{ index: 0, embedding: [1, 0] }], 2, 2)).toThrow(VectorValidationError)
  })

  it('reconstructs request order from response indices, whatever the response order', () => {
    const ordered = normalizeEmbeddingBatch([
      { index: 2, embedding: [0, 0, 1] },
      { index: 0, embedding: [1, 0, 0] },
      { index: 1, embedding: [0, 1, 0] },
    ], 3, 3)
    expect(ordered).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]])
  })

  it('ranks by dot product the way the exact scan expects', () => {
    const query = [1, 0]
    const close = [0.99, Math.sqrt(1 - 0.99 * 0.99)]
    const far = [0, 1]
    expect(dotProduct(query, close)).toBeGreaterThan(dotProduct(query, far))
  })
})

describe('idea_semantic record schema', () => {
  const validRecord = () => ({
    ideaId: IdeaId('idea_1'),
    versionId: IdeaVersionId('idea_ver_1'),
    embeddingProfileId: 'a'.repeat(64),
    documentVersion: 1,
    contentHash: 'b'.repeat(64),
    dimensions: 2,
    vector: [0.6, 0.8],
    createdAt: 1,
  })

  it('round-trips a valid record', () => {
    const parsed = semanticEmbeddingRecordSchema.parse(validRecord())
    expect(parsed.ideaId).toBe('idea_1')
    expect(parsed.vector).toEqual([0.6, 0.8])
  })

  it('rejects a vector whose length differs from dimensions', () => {
    expect(() => semanticEmbeddingRecordSchema.parse({ ...validRecord(), vector: [1] })).toThrow()
    expect(() => semanticEmbeddingRecordSchema.parse({ ...validRecord(), vector: [1, 0, 0] })).toThrow()
  })

  it('rejects structural drift: document version, hash shape, dimensions, non-finite vectors', () => {
    expect(() => semanticEmbeddingRecordSchema.parse({ ...validRecord(), documentVersion: 2 })).toThrow()
    expect(() => semanticEmbeddingRecordSchema.parse({ ...validRecord(), contentHash: 'short' })).toThrow()
    expect(() => semanticEmbeddingRecordSchema.parse({ ...validRecord(), dimensions: 0 })).toThrow()
    expect(() => semanticEmbeddingRecordSchema.parse({ ...validRecord(), vector: [Number.NaN, 1] })).toThrow()
  })

  it('is backup-and-skip compatible: a malformed stored record opens as absent over real storage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-semantic-'))
    try {
      const boot = async () => {
        const ctx = new Context()
        await ctx.plugin(Storage)
        await ctx.plugin(
          { name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig },
          { root },
        )
        await ctx.plugin(
          { name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig },
          { backend: 'json' },
        )
        return ctx
      }
      const tableDir = join(root, 'idea_semantic', 'embeddings')
      const good = semanticEmbeddingRecordSchema.parse(validRecord())
      const write = async (name: string, document: unknown): Promise<void> => {
        const { mkdirSync } = await import('node:fs')
        mkdirSync(tableDir, { recursive: true })
        await writeFile(join(tableDir, name), JSON.stringify(document), 'utf8')
      }
      // First context writes one valid record through the real domain.
      const writer = await boot()
      const domain = await writer.storageDomain.open(ideaSemanticDomainSpec)
      await domain.table('embeddings').put(IdeaId('idea_1'), good)
      await writer.fiber.dispose()

      // Corrupt bytes for a second key land directly on disk: a valid
      // version-stamped document envelope whose record fails the schema.
      await write('idea_2.json', { version: 1, record: { ideaId: 'idea_2', vector: 'not-a-vector' } })

      // Reopen: the malformed record is moved aside and treated as absent.
      const reader = await boot()
      const reopened = await reader.storageDomain.open(ideaSemanticDomainSpec)
      const keys = [...reopened.table('embeddings').keys()]
      expect(keys).toEqual(['idea_1'])
      const files = await readdir(tableDir)
      expect(files.some(file => file.startsWith('idea_2.json.bak.'))).toBe(true)
      await reader.fiber.dispose()
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  })

  it('lives in its own derived domain, separate from the authoritative idea domain', () => {
    expect(ideaSemanticDomainSpec.name).toBe('idea_semantic')
    expect(ideaSemanticDomainSpec.version).toBe(1)
    expect(ideaSemanticDomainSpec.compatibleVersions).toEqual([])
    expect(ideaSemanticDomainSpec.layout).toBe('per-record')
    expect(ideaSemanticDomainSpec.invalidRecords).toBe('backup-and-skip')
    expect(Object.keys(ideaSemanticDomainSpec.tables)).toEqual(['embeddings'])
    expect(ideaDomainSpec.name).toBe('idea')
    expect(ideaDomainSpec.version).toBe(3)
    expect(Object.keys(ideaDomainSpec.tables).sort()).toEqual([
      'discussions',
      'ideas',
      'resurfacing_budgets',
    ])
  })
})
