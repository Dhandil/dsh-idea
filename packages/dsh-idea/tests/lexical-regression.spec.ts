/**
 * Lexical regression tests: the shared primitives in `src/retrieval/` must
 * reproduce the accepted T6 behavior exactly — the same normalization, the
 * same feature shapes (Latin tokens of two or more, CJK bigrams with
 * single-character runs contributing themselves), the same distinct-feature
 * weighted field scoring, and the same recency-then-id ordering. The frozen
 * vectors below pin the observable outputs against silent drift.
 * @module tests/lexical-regression.spec
 */

import { describe, expect, it } from 'vitest'
import { normalizeLexical, extractQueryFeatures, scoreLexicalFields, recencyThenIdOrder } from '../src/retrieval/lexical.ts'
import { extractQueryFeatures as relatedExtract, scoreCandidate, selectCandidates } from '../src/related/retrieval.ts'
import { RELATED_FIELD_WEIGHTS } from '../src/related/types.ts'
import type { IdeaId, IdeaVersionId } from '../src/types.ts'
import type { RelatedIdeaCandidate } from '../src/related/types.ts'

describe('normalization', () => {
  it('applies NFKC, lowercasing, and whitespace collapsing', () => {
    expect(normalizeLexical('ＲＡＧ  Ｓystem')).toBe('rag system')
    expect(normalizeLexical('A\n\t B   C')).toBe('a b c')
    expect(normalizeLexical('向量 数据库')).toBe('向量 数据库')
  })
})

describe('feature extraction', () => {
  it('keeps Latin tokens of length two or more, lowercased', () => {
    expect(extractQueryFeatures('a Rag SYSTEMS x1 abc')).toEqual(['rag', 'systems', 'x1', 'abc'])
  })

  it('drops single Latin characters', () => {
    expect(extractQueryFeatures('a b ab')).toEqual(['ab'])
  })

  it('extracts CJK bigrams; a single-character run contributes itself', () => {
    expect(extractQueryFeatures('向量数据库')).toEqual(['向量', '量数', '数据', '据库'])
    expect(extractQueryFeatures('想')).toEqual(['想'])
  })

  it('deduplicates and yields both feature kinds on mixed text', () => {
    const features = extractQueryFeatures('RAG 检索 RAG')
    expect(features.filter(feature => feature === 'rag')).toHaveLength(1)
    expect(features).toContain('检索')
  })

  it('is the exact function the T6 related module re-exports', () => {
    expect(extractQueryFeatures('向量 database')).toEqual(relatedExtract('向量 database'))
  })
})

describe('weighted field scoring', () => {
  const fields = {
    title: 'vector database',
    core: 'vector storage',
    motivation: 'fast retrieval',
  }

  it('counts distinct present features per field times the frozen weight', () => {
    const score = scoreLexicalFields(fields, RELATED_FIELD_WEIGHTS, ['vector', 'database', 'retrieval'])
    expect(score).toBe(2 * 5 + 1 * 4 + 1 * 3)
  })

  it('repeated occurrences inside one field count once', () => {
    expect(scoreLexicalFields({ core: 'vector vector vector' }, { core: 4 }, ['vector'])).toBe(4)
  })

  it('zero when no feature is present', () => {
    expect(scoreLexicalFields(fields, RELATED_FIELD_WEIGHTS, ['missing'])).toBe(0)
  })

  it('reproduces the T6 candidate score through the re-exported path', () => {
    const candidate: RelatedIdeaCandidate = {
      ideaId: 'c1' as IdeaId,
      currentVersionId: 'v1' as IdeaVersionId,
      title: 'Vector database',
      core: 'embedding storage and ranking',
      motivation: 'fast',
      currentConclusion: '',
      possibleValue: '',
      useWhen: ['vector queries'],
      openQuestions: [],
      updatedAt: 1,
    }
    const features = relatedExtract('vector database queries')
    expect(scoreCandidate(candidate, features)).toBe(2 * 5 + 2 * 3)
  })
})

describe('candidate selection ordering', () => {
  const candidateOf = (ideaId: string, updatedAt: number, title: string): RelatedIdeaCandidate => ({
    ideaId: ideaId as IdeaId,
    currentVersionId: `${ideaId}_v1` as IdeaVersionId,
    title,
    core: '',
    motivation: '',
    currentConclusion: '',
    possibleValue: '',
    useWhen: [],
    openQuestions: [],
    updatedAt,
  })

  it('keeps a corpus within the frozen limit in corpus order', () => {
    const corpus = [candidateOf('b', 1, 'x'), candidateOf('a', 9, 'y')]
    expect(selectCandidates(corpus, relatedExtract('x')).map(c => c.ideaId)).toEqual(['b', 'a'])
  })

  it('ranks larger corpora score DESC then updatedAt DESC then id ASC', () => {
    const corpus = [
      candidateOf('old-hit', 1, 'vector'),
      candidateOf('new-hit', 9, 'vector'),
      candidateOf('zero', 99, 'unrelated'),
      candidateOf('aa', 9, 'vector'),
    ]
    const beyondLimit = Array.from({ length: 13 }, (_, index) =>
      candidateOf(`fill_${String(index).padStart(2, '0')}`, 100 - index, 'filler'))
    const ranked = selectCandidates([...corpus, ...beyondLimit], relatedExtract('vector'))
    expect(ranked.slice(0, 3).map(c => c.ideaId)).toEqual(['aa', 'new-hit', 'old-hit'])
  })
})

describe('recency-then-id order', () => {
  it('orders by updatedAt DESC, then id ASC, and is a full comparator', () => {
    expect(recencyThenIdOrder({ updatedAt: 2, id: 'b' }, { updatedAt: 1, id: 'a' })).toBeLessThan(0)
    expect(recencyThenIdOrder({ updatedAt: 1, id: 'b' }, { updatedAt: 1, id: 'a' })).toBeGreaterThan(0)
    expect(recencyThenIdOrder({ updatedAt: 1, id: 'a' }, { updatedAt: 1, id: 'a' })).toBe(0)
  })
})
