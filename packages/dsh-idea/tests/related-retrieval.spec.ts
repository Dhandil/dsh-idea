/**
 * The Related Ideas retrieval stage: query-feature extraction (English word
 * tokens, CJK bigrams, mixed text, NFKC normalization, deduplication), the
 * frozen weighted field scoring without double counting, the top-pool
 * selection with its recency recall fallback, and the eligible-corpus rules
 * over the real IdeaService — active and dormant included, archived and the
 * current discussion's own Idea excluded, one current-version candidate per
 * Idea, detached results. All offline.
 * @module tests/related-retrieval.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { eligibleRelatedCandidates } from '../src/related/service.ts'
import {
  extractQueryFeatures,
  scoreCandidate,
  selectCandidates,
} from '../src/related/retrieval.ts'
import { cleanup, draft, storedAggregate } from './helpers/harness.ts'
import { evolutionHarness, seedDiscussion } from './helpers/evolution.ts'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IdeaId } from '../src/types.ts'
import type { EvolutionEnv } from './helpers/evolution.ts'
import type { RelatedIdeaCandidate } from '../src/related/types.ts'

afterEach(cleanup)

describe('query features', () => {
  it('extracts deduplicated English word tokens of length two or more', () => {
    expect(extractQueryFeatures('Ideas resurface  later! a I'))
      .toEqual(['ideas', 'resurface', 'later'])
  })

  it('extracts CJK bigrams over contiguous CJK runs', () => {
    expect(extractQueryFeatures('想法与讨论'))
      .toEqual(['想法', '法与', '与讨', '讨论'])
  })

  it('keeps a single-character CJK run as itself', () => {
    expect(extractQueryFeatures('想')).toEqual(['想'])
  })

  it('handles mixed CJK and English text', () => {
    expect(extractQueryFeatures('使用 idea 保存 discussion'))
      .toEqual(['使用', 'idea', '保存', 'discussion'])
  })

  it('normalizes NFKC and whitespace before extraction', () => {
    expect(extractQueryFeatures('Ｉｄｅａ\t resurface\n\nlater'))
      .toEqual(['idea', 'resurface', 'later'])
  })
})

describe('weighted scoring', () => {
  const features = ['provenance']

  const base: RelatedIdeaCandidate = {
    ideaId: IdeaId('idea_a'),
    currentVersionId: 'idea_ver_a1' as RelatedIdeaCandidate['currentVersionId'],
    title: 'One title',
    core: 'One core',
    motivation: '',
    currentConclusion: '',
    possibleValue: '',
    useWhen: [],
    openQuestions: [],
    updatedAt: 1,
  }

  const withField = (field: keyof RelatedIdeaCandidate, value: string): RelatedIdeaCandidate => ({
    ...base,
    [field]: value,
  }) as RelatedIdeaCandidate

  it('weighs a title hit above lower-weight fields', () => {
    const titleHit = scoreCandidate(withField('title', 'provenance angle'), features)
    const coreHit = scoreCandidate(withField('core', 'provenance angle'), features)
    const valueHit = scoreCandidate(withField('possibleValue', 'provenance angle'), features)
    expect(titleHit).toBeGreaterThan(coreHit)
    expect(coreHit).toBeGreaterThan(valueHit)
    expect(titleHit).toBe(5)
    expect(coreHit).toBe(4)
    expect(valueHit).toBe(2)
  })

  it('sums distinct feature hits across fields but counts one hit per field', () => {
    const candidate: RelatedIdeaCandidate = {
      ...base,
      title: 'provenance provenance provenance',
      useWhen: ['provenance later', 'provenance again'],
    }
    expect(scoreCandidate(candidate, features)).toBe(5 + 3)
  })

  it('scores list fields over their joined items', () => {
    const candidate: RelatedIdeaCandidate = { ...base, openQuestions: ['why provenance matters'] }
    expect(scoreCandidate(candidate, features)).toBe(2)
  })
})

const candidate = (ideaId: string, overrides: Partial<RelatedIdeaCandidate> = {}): RelatedIdeaCandidate => ({
  ideaId: IdeaId(ideaId),
  currentVersionId: `idea_ver_${ideaId}` as RelatedIdeaCandidate['currentVersionId'],
  title: `${ideaId} title`,
  core: '',
  motivation: '',
  currentConclusion: '',
  possibleValue: '',
  useWhen: [],
  openQuestions: [],
  updatedAt: 1,
  ...overrides,
})

describe('pool selection', () => {
  it('passes a corpus within the limit through in corpus order', () => {
    const corpus = Array.from({ length: 12 }, (_, index) => candidate(`idea_${index}`))
    expect(selectCandidates(corpus, ['provenance'])).toEqual(corpus)
  })

  it('ranks a larger corpus by score, then recency, then id', async () => {
    const corpus = Array.from({ length: 13 }, (_, index) => candidate(`idea_${String(index).padStart(2, '0')}`, {
      updatedAt: 100 - index,
    }))
    corpus[12]!.title = 'the provenance angle'
    const pool = selectCandidates(corpus, ['provenance'])
    expect(pool).toHaveLength(12)
    expect(pool[0]!.ideaId).toBe('idea_12')
  })

  it('breaks score ties by updatedAt DESC then ideaId ASC', () => {
    const filler = Array.from({ length: 10 }, (_, index) => candidate(`idea_x${String(index + 1).padStart(2, '0')}`, {
      updatedAt: 4 - index,
    }))
    const corpus = [
      candidate('idea_b', { updatedAt: 5 }),
      candidate('idea_c', { updatedAt: 9 }),
      candidate('idea_a', { updatedAt: 9 }),
      ...filler,
    ]
    const pool = selectCandidates(corpus, [])
    expect(pool).toHaveLength(12)
    expect(pool.slice(0, 3).map(entry => entry.ideaId)).toEqual(['idea_a', 'idea_c', 'idea_b'])
  })

  it('fills the remaining slots from zero-score candidates by recency', () => {
    const corpus = Array.from({ length: 14 }, (_, index) => candidate(`idea_${String(index).padStart(2, '0')}`, {
      updatedAt: 100 - index,
    }))
    corpus[13]!.title = 'the provenance angle'
    corpus[12]!.core = 'also provenance here'
    const pool = selectCandidates(corpus, ['provenance'])
    expect(pool).toHaveLength(12)
    expect(pool.map(entry => entry.ideaId).slice(0, 2)).toEqual(['idea_13', 'idea_12'])
    // Zero-score fill runs newest-first.
    expect(pool.map(entry => entry.ideaId).slice(2)).toEqual(
      Array.from({ length: 10 }, (_, index) => `idea_${String(index).padStart(2, '0')}`),
    )
  })
})

/** Boot the harness, seed a discussion, and expose the eligibility helper. */
async function seeded(): Promise<{ env: EvolutionEnv, ideaId: string }> {
  const env = await evolutionHarness()
  const { ideaId } = await seedDiscussion(env)
  return { env, ideaId }
}

describe('eligible corpus', () => {
  it('includes an active Idea of an unrelated session', async () => {
    const { env, ideaId } = await seeded()
    const candidates = eligibleRelatedCandidates(env.ideaService, 'session-unrelated')
    expect(candidates.map(entry => entry.ideaId)).toEqual([ideaId])
  })

  it('excludes an archived Idea', async () => {
    const { env, ideaId } = await seeded()
    const aggregate = env.ideaService.get(IdeaId(ideaId))
    await env.ideaService.archive(IdeaId(ideaId), aggregate.idea.currentVersionId)
    expect(eligibleRelatedCandidates(env.ideaService, 'session-unrelated')).toEqual([])
  })

  it('excludes the current discussion Idea but not a source-snapshot session match', async () => {
    const { env, ideaId } = await seeded()
    // The discussion conversation's own Idea never comes back.
    expect(eligibleRelatedCandidates(env.ideaService, 'conversation-1')).toEqual([])
    // The Idea's historical save source session is not a discussion binding.
    expect(eligibleRelatedCandidates(env.ideaService, 'session-1').map(entry => entry.ideaId))
      .toEqual([ideaId])
  })

  it('includes a dormant Idea and contributes exactly one current-version candidate', async () => {
    const { env, ideaId } = await seeded()
    const root = env.root
    await env.ideaService.evolve(
      IdeaId(ideaId),
      draft({ title: 'Evolved title' }),
      { sessionId: 'conversation-1', capturedContext: [{ role: 'user', text: 'one more exchange' }] },
      env.ideaService.get(IdeaId(ideaId)).idea.currentVersionId,
      'manual-edit',
    )
    // No domain mutation sets dormant in V1; flip the stored record and
    // reload, exactly the way a durable dormant Idea arrives.
    const recordPath = join(root, 'idea', 'ideas', `${ideaId}.json`)
    const document = JSON.parse(await readFile(recordPath, 'utf8')) as { record: { idea: { status: string } } }
    document.record.idea.status = 'dormant'
    await writeFile(recordPath, JSON.stringify(document))

    const reopened = await evolutionHarness(root)
    const candidates = eligibleRelatedCandidates(reopened.ideaService, 'session-unrelated')
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.title).toBe('Evolved title')
    expect(candidates[0]!.currentVersionId)
      .toBe(reopened.ideaService.get(IdeaId(ideaId)).idea.currentVersionId)
  })

  it('yields detached candidates: mutating a result never touches storage', async () => {
    const { env, ideaId } = await seeded()
    const candidates = eligibleRelatedCandidates(env.ideaService, 'session-unrelated')
    candidates[0]!.title = 'Mutated title'
    ;(candidates[0]!.useWhen as string[]).push('mutated')

    const again = eligibleRelatedCandidates(env.ideaService, 'session-unrelated')
    expect(again[0]!.title).not.toBe('Mutated title')
    const stored = await storedAggregate(env.root, ideaId)
    expect(stored?.versions[0]!.draft.title).not.toBe('Mutated title')
  })
})
