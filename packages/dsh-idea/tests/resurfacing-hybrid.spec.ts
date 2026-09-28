/**
 * Pure hybrid rank fusion (T11 §42): deterministic RRF over the lexical
 * branch's positional order and the semantic branch's rank order. Pins the
 * frozen constants (RRF_K=60, FINAL_JUDGE_POOL_LIMIT=3), identity
 * deduplication on ideaId+evaluatedVersionId, the exactly-once double
 * contribution for dual-branch candidates, the frozen tie ordering
 * (fusedScore DESC → lexical-present first → bestBranchRank ASC → ideaId
 * ASC → evaluatedVersionId ASC), and that no raw score material of either
 * branch participates. Pure functions only — no provider, storage, or
 * network.
 * @module tests/resurfacing-hybrid.spec
 */

import { describe, expect, it } from 'vitest'
import {
  FINAL_JUDGE_POOL_LIMIT,
  RRF_K,
  fuseHybridCandidates,
  type HybridRankInput,
} from '../src/resurfacing/hybrid.ts'

const entry = (ideaId: string, evaluatedVersionId = `ver_${ideaId}`): HybridRankInput => ({
  ideaId,
  evaluatedVersionId,
})

/** The frozen RRF contribution of a 1-based branch rank. */
const contribution = (rank: number): number => 1 / (RRF_K + rank)

describe('frozen constants', () => {
  it('pins RRF_K and FINAL_JUDGE_POOL_LIMIT', () => {
    expect(RRF_K).toBe(60)
    expect(FINAL_JUDGE_POOL_LIMIT).toBe(3)
  })
})

describe('single-branch orders', () => {
  it('preserves lexical order and its positional ranks', () => {
    const fused = fuseHybridCandidates([entry('a'), entry('b'), entry('c')], [])
    expect(fused.map(f => f.ideaId)).toEqual(['a', 'b', 'c'])
    expect(fused.map(f => f.fusedScore)).toEqual([contribution(1), contribution(2), contribution(3)])
    expect(fused.every(f => f.presentInLexical && !f.presentInSemantic)).toBe(true)
    expect(fused.map(f => f.lexicalRank)).toEqual([1, 2, 3])
    expect(fused.every(f => f.semanticRank === undefined)).toBe(true)
    expect(fused.map(f => f.bestBranchRank)).toEqual([1, 2, 3])
  })

  it('preserves semantic order and its ranks when the lexical branch is empty', () => {
    const fused = fuseHybridCandidates([], [entry('x'), entry('y')])
    expect(fused.map(f => f.ideaId)).toEqual(['x', 'y'])
    expect(fused.map(f => f.fusedScore)).toEqual([contribution(1), contribution(2)])
    expect(fused.every(f => f.presentInSemantic && !f.presentInLexical)).toBe(true)
    expect(fused.map(f => f.semanticRank)).toEqual([1, 2])
  })
})

describe('dual-branch fusion', () => {
  it('adds both contributions exactly once for one identity present in both branches', () => {
    const shared = entry('shared')
    const fused = fuseHybridCandidates(
      [entry('lexOnly'), shared, entry('lexTail')],
      [shared, entry('semOnly')],
    )
    const fusedShared = fused.find(f => f.ideaId === 'shared')!
    expect(fusedShared.fusedScore).toBeCloseTo(contribution(2) + contribution(1), 15)
    expect(fusedShared.presentInLexical).toBe(true)
    expect(fusedShared.presentInSemantic).toBe(true)
    expect(fusedShared.lexicalRank).toBe(2)
    expect(fusedShared.semanticRank).toBe(1)
    expect(fusedShared.bestBranchRank).toBe(1)
    // The shared candidate's double contribution outranks every single-branch
    // candidate, including the lexical rank-1 entry.
    expect(fused[0]!.ideaId).toBe('shared')
    expect(fused.filter(f => f.ideaId === 'shared')).toHaveLength(1)
  })

  it('deduplicates on ideaId+evaluatedVersionId, not ideaId alone', () => {
    const fused = fuseHybridCandidates(
      [entry('idea', 'ver-1'), entry('idea', 'ver-2')],
      [entry('idea', 'ver-2')],
    )
    expect(fused).toHaveLength(2)
    expect(fused.map(f => f.evaluatedVersionId)).toEqual(['ver-2', 'ver-1'])
    expect(fused[0]!.fusedScore).toBeCloseTo(contribution(2) + contribution(1), 15)
    expect(fused[1]!.fusedScore).toBeCloseTo(contribution(1), 15)
  })
})

describe('frozen tie ordering', () => {
  it('breaks an exact single-contribution tie: lexical-present first', () => {
    // Both rank 1 in their single branch → both exactly 1/61 → the lexical
    // one first.
    const fused = fuseHybridCandidates([entry('zeta')], [entry('alpha')])
    expect(fused.map(f => f.ideaId)).toEqual(['zeta', 'alpha'])
    expect(fused[0]!.presentInLexical).toBe(true)
    expect(fused[1]!.presentInLexical).toBe(false)
  })

  it('lets mirror-rank dual candidates fall through equal flags to ideaId ASC', () => {
    // lex r1 + sem r2 and lex r2 + sem r1 sum identically (FP-commutative),
    // flags and bestBranchRank are equal, so the frozen chain lands on
    // ideaId string order.
    const low = entry('low') // lexical r1 + semantic r2
    const high = entry('high') // lexical r2 + semantic r1
    const fused = fuseHybridCandidates([low, high], [high, low])
    expect(fused[0]!.fusedScore).toBeCloseTo(fused[1]!.fusedScore, 15)
    expect(fused.every(f => f.presentInLexical && f.presentInSemantic)).toBe(true)
    expect(fused.map(f => f.bestBranchRank)).toEqual([1, 1])
    expect(fused.map(f => f.ideaId)).toEqual(['high', 'low'])
  })

  it('falls to evaluatedVersionId ASC when even ideaId ties', () => {
    // Same ideaId on both sides of a mirror-rank tie: every earlier tie key
    // is equal, so the frozen evaluatedVersionId ordering decides.
    const older = { ideaId: 'idea', evaluatedVersionId: 'ver-b' } // lexical r1 + semantic r2
    const newer = { ideaId: 'idea', evaluatedVersionId: 'ver-a' } // lexical r2 + semantic r1
    const fused = fuseHybridCandidates([older, newer], [newer, older])
    expect(fused[0]!.fusedScore).toBeCloseTo(fused[1]!.fusedScore, 15)
    expect(fused.map(f => f.evaluatedVersionId)).toEqual(['ver-a', 'ver-b'])
  })
})

describe('raw-score isolation', () => {
  it('accepts only identities: extra numeric fields on inputs change nothing', () => {
    const plain = [entry('a'), entry('b'), entry('c')]
    const rigged = plain.map((candidate, index) => ({
      ...candidate,
      // Inverted raw scores: if any raw material leaked into fusion, the
      // order would flip.
      lexicalScore: 100 - index,
      similarity: 0.01 * index,
    }) as HybridRankInput)
    expect(fuseHybridCandidates(rigged, []).map(f => f.ideaId))
      .toEqual(fuseHybridCandidates(plain, []).map(f => f.ideaId))
  })
})

describe('pool size contract', () => {
  it('applies no cap here; the caller owns FINAL_JUDGE_POOL_LIMIT', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map(id => entry(id))
    const fused = fuseHybridCandidates(five, [])
    expect(fused).toHaveLength(5)
    expect(FINAL_JUDGE_POOL_LIMIT).toBeLessThan(fused.length)
  })

  it('returns an empty pool when both branches are empty', () => {
    expect(fuseHybridCandidates([], [])).toEqual([])
  })
})
