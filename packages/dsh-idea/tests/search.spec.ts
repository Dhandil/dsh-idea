/**
 * Search-core tests: scope filtering, the blank-query recency list, the
 * positive-score-only ranking with its deterministic tie-break, Chinese /
 * English / mixed matching, the frozen result cap, and the leak guarantees
 * (archived exclusion under `current`, zero-score rows never surface).
 * No LLM, no embeddings, no network, no durable write.
 * @module tests/search.spec
 */

import { describe, expect, it } from 'vitest'
import { isBlankQuery, searchRecords, SEARCH_FIELD_WEIGHTS } from '../src/search/service.ts'
import { IDEA_SEARCH_RESULT_LIMIT } from '../src/search/types.ts'
import { RELATED_FIELD_WEIGHTS } from '../src/related/types.ts'
import type { IdeaSearchRecord } from '../src/search/types.ts'

const recordOf = (overrides: Partial<IdeaSearchRecord> & { ideaId: string }): IdeaSearchRecord => ({
  currentVersionId: `${overrides.ideaId}_ver_1`,
  status: 'active',
  title: `Title of ${overrides.ideaId}`,
  core: `Core of ${overrides.ideaId}`,
  motivation: `Motivation of ${overrides.ideaId}`,
  currentConclusion: `Conclusion of ${overrides.ideaId}`,
  possibleValue: `Value of ${overrides.ideaId}`,
  useWhen: [],
  openQuestions: [],
  updatedAt: 1,
  ...overrides,
})

describe('scope', () => {
  it('current excludes archived Ideas; all includes them', () => {
    const records = [
      recordOf({ ideaId: 'a', status: 'active' }),
      recordOf({ ideaId: 'b', status: 'dormant' }),
      recordOf({ ideaId: 'c', status: 'archived' }),
    ]
    expect(searchRecords(records, '', 'current').map(r => r.ideaId)).toEqual(['a', 'b'])
    expect(searchRecords(records, '', 'all').map(r => r.ideaId)).toEqual(['a', 'b', 'c'])
  })
})

describe('blank query', () => {
  const records = [
    recordOf({ ideaId: 'a', updatedAt: 10 }),
    recordOf({ ideaId: 'b', updatedAt: 30, status: 'archived' }),
    recordOf({ ideaId: 'c', updatedAt: 20 }),
    recordOf({ ideaId: 'd', updatedAt: 20 }),
  ]

  it('surfaces every in-scope Idea by updatedAt DESC then ideaId ASC', () => {
    expect(searchRecords(records, '   ', 'all').map(r => r.ideaId)).toEqual(['b', 'c', 'd', 'a'])
    expect(searchRecords(records, '', 'current').map(r => r.ideaId)).toEqual(['c', 'd', 'a'])
  })

  it('normalizes the blankness check (whitespace-only is blank)', () => {
    expect(isBlankQuery('')).toBe(true)
    expect(isBlankQuery(' \t\n')).toBe(true)
    expect(isBlankQuery('x')).toBe(false)
  })
})

describe('non-blank query', () => {
  const records = [
    recordOf({ ideaId: 'hit', title: 'vector database', core: 'embedding storage', updatedAt: 5 }),
    recordOf({ ideaId: 'miss', title: 'gardening notes', core: 'soil and seeds', updatedAt: 99 }),
    recordOf({
      ideaId: 'strong',
      title: 'vector search',
      core: 'vector database ranking',
      motivation: 'vector',
      currentConclusion: 'vector',
      possibleValue: 'vector',
      useWhen: ['vector queries'],
      openQuestions: ['vector shards'],
      updatedAt: 1,
    }),
  ]

  it('surfaces only positive-score rows, score DESC, no zero-score recency fill', () => {
    const rows = searchRecords(records, 'vector database', 'all')
    expect(rows.map(r => r.ideaId)).toEqual(['strong', 'hit'])
    expect(rows.some(r => r.ideaId === 'miss')).toBe(false)
  })

  it('breaks score ties by updatedAt DESC then ideaId ASC', () => {
    const tied = [
      recordOf({ ideaId: 'older', title: 'alpha', updatedAt: 1 }),
      recordOf({ ideaId: 'newer', title: 'alpha', updatedAt: 2 }),
      recordOf({ ideaId: 'zz', title: 'alpha', updatedAt: 2 }),
    ]
    expect(searchRecords(tied, 'alpha', 'all').map(r => r.ideaId)).toEqual(['newer', 'zz', 'older'])
  })

  it('matches Chinese, English, and mixed text over every weighted field', () => {
    const zh = recordOf({
      ideaId: 'zh',
      title: '向量数据库',
      core: '存储与检索',
      useWhen: ['需要本地向量检索时'],
      openQuestions: ['分片策略'],
    })
    expect(searchRecords([zh], '向量', 'all').map(r => r.ideaId)).toEqual(['zh'])
    expect(searchRecords([zh], '检索', 'all').map(r => r.ideaId)).toEqual(['zh'])
    expect(searchRecords([zh], 'shards', 'all')).toEqual([])
    const mixed = recordOf({ ideaId: 'mixed', title: 'RAG 检索增强' })
    expect(searchRecords([mixed], 'rag', 'all').map(r => r.ideaId)).toEqual(['mixed'])
    expect(searchRecords([mixed], '检索', 'all').map(r => r.ideaId)).toEqual(['mixed'])
  })

  it('reads all seven content fields', () => {
    const seven = recordOf({
      ideaId: 'seven',
      title: 'x title',
      core: 'x core',
      motivation: 'x motivation',
      currentConclusion: 'x currentConclusion',
      possibleValue: 'x possibleValue',
      useWhen: ['x useWhen'],
      openQuestions: ['x openQuestions'],
    })
    for (const feature of ['title', 'core', 'motivation', 'currentConclusion', 'possibleValue', 'useWhen', 'openQuestions']) {
      expect(searchRecords([seven], `x ${feature}`, 'all').map(r => r.ideaId)).toEqual(['seven'])
    }
  })
})

describe('cap and weights', () => {
  it('caps at the explicit limit with no pagination', () => {
    const records = Array.from({ length: IDEA_SEARCH_RESULT_LIMIT + 50 }, (_, index) =>
      recordOf({ ideaId: `idea_${String(index).padStart(3, '0')}`, title: 'shared token', updatedAt: index }))
    const rows = searchRecords(records, 'shared', 'all')
    expect(rows).toHaveLength(IDEA_SEARCH_RESULT_LIMIT)
    expect(rows[0]!.ideaId).toBe('idea_149')
    expect(rows.at(-1)!.ideaId).toBe('idea_050')
  })

  it('keeps the frozen T6 field weights', () => {
    expect(SEARCH_FIELD_WEIGHTS).toEqual(RELATED_FIELD_WEIGHTS)
    expect(SEARCH_FIELD_WEIGHTS).toEqual({
      title: 5,
      core: 4,
      motivation: 3,
      currentConclusion: 3,
      useWhen: 3,
      possibleValue: 2,
      openQuestions: 2,
    })
  })
})
