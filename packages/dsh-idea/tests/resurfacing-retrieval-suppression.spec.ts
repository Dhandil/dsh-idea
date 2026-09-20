/**
 * T10 retrieval and deterministic suppression, pure and offline: the frozen
 * positive-evidence floor (no zero-score fill, no recency fallback), the
 * frozen pool cap with score → recency → id ranking, the four host-side
 * suppression reasons in check order, and the shared scoring mechanics
 * (distinct feature count per field × frozen weight).
 * @module tests/resurfacing-retrieval-suppression.spec
 */

import { describe, expect, it } from 'vitest'
import { extractQueryFeatures } from '../src/retrieval/lexical.ts'
import { scoreResurfacingCandidate, selectResurfacingPool } from '../src/resurfacing/retrieval.ts'
import { suppressResurfacingCandidates } from '../src/resurfacing/suppression.ts'
import { RESURFACING_CANDIDATE_LIMIT, RESURFACING_RETRIEVAL_FLOOR } from '../src/resurfacing/types.ts'
import type { ResurfacingCandidate } from '../src/resurfacing/types.ts'
import { IdeaId, IdeaVersionId } from '../src/types.ts'

let sequence = 0

const candidate = (over: Partial<ResurfacingCandidate> = {}): ResurfacingCandidate => {
  sequence += 1
  const id = over.ideaId ?? IdeaId(`idea-${sequence}`)
  return {
    ideaId: id,
    evaluatedVersionId: IdeaVersionId(`${id}:v1`),
    title: '',
    core: '',
    motivation: '',
    currentConclusion: '',
    possibleValue: '',
    useWhen: [],
    openQuestions: [],
    updatedAt: 1_000,
    score: 0,
    status: 'active',
    createdInConversation: false,
    ...over,
  }
}

const scored = (candidates: ResurfacingCandidate[], turn: string) => {
  const features = extractQueryFeatures(turn)
  return candidates.map(entry => ({ candidate: entry, score: scoreResurfacingCandidate(entry, features) }))
}

describe('frozen limits', () => {
  it('keeps the floor at two independent evidences and the pool at three', () => {
    expect(RESURFACING_RETRIEVAL_FLOOR).toBe(8)
    expect(RESURFACING_CANDIDATE_LIMIT).toBe(3)
  })
})

describe('lexical scoring', () => {
  it('sums distinct feature counts per field times the frozen weight', () => {
    const turn = '塔防游戏的方向'
    const features = extractQueryFeatures(turn)
    expect(features).toContain('塔防')
    expect(features).toContain('游戏')
    const hit = candidate({
      title: '塔防游戏的方向',
      core: '核心与塔防无关',
    })
    const score = scoreResurfacingCandidate(hit, features)
    // The title contains all six CJK bigrams of the turn; the core only 塔防.
    expect(features).toHaveLength(6)
    expect(score).toBe(6 * 5 + 1 * 4)
  })

  it('counts a repeated feature within one field once', () => {
    const features = extractQueryFeatures('塔防')
    const repeated = candidate({ title: '塔防塔防塔防' })
    expect(scoreResurfacingCandidate(repeated, features)).toBe(5)
  })
})

describe('the retrieval pool', () => {
  it('returns no candidate below the floor and never fills with zero scores', () => {
    const below = candidate({ title: '完全无关的主题' })
    const { pool, belowFloor } = selectResurfacingPool(scored([below], '塔防游戏的方向'))
    expect(pool).toEqual([])
    expect(belowFloor.map(entry => entry.ideaId)).toEqual([below.ideaId])
  })

  it('keeps only candidates at or above the floor, capped at three, ranked score → recency → id', () => {
    const turn = '塔防游戏的方向'
    const strong = candidate({ title: '塔防游戏的方向', core: '塔防游戏的思路', updatedAt: 500 })
    const equalNewer = candidate({ title: '塔防游戏的方向', updatedAt: 2_000 })
    const equalOlder = candidate({ title: '塔防游戏的方向', updatedAt: 1_000 })
    const weak = candidate({ title: '提到塔防而已' })
    const { pool, belowFloor } = selectResurfacingPool(
      scored([weak, equalOlder, strong, equalNewer], turn),
    )
    expect(pool.map(entry => entry.ideaId)).toEqual([
      strong.ideaId,
      equalNewer.ideaId,
      equalOlder.ideaId,
    ])
    expect(belowFloor.map(entry => entry.ideaId)).toEqual([weak.ideaId])
  })

  it('caps the pool at three even with many eligible candidates', () => {
    const turn = '塔防游戏的方向'
    const many = Array.from({ length: 5 }, () => candidate({ title: '塔防游戏的方向' }))
    const { pool } = selectResurfacingPool(scored(many, turn))
    expect(pool).toHaveLength(3)
  })
})

describe('deterministic suppression reasons in check order', () => {
  const turn = '塔防游戏的方向'

  it('suppresses an inactive lifecycle first', () => {
    const dormant = candidate({ title: '塔防游戏的方向', status: 'dormant' })
    const { kept, suppressed } = suppressResurfacingCandidates(scored([dormant], turn), {})
    expect(kept).toEqual([])
    expect(suppressed).toEqual([{ ideaId: dormant.ideaId, reason: 'IDEA_LIFECYCLE_INACTIVE' }])
  })

  it('suppresses the Idea this conversation continues from', () => {
    const source = candidate({ title: '塔防游戏的方向' })
    const { kept, suppressed } = suppressResurfacingCandidates(scored([source], turn), {
      discussionIdeaId: source.ideaId,
    })
    expect(kept).toEqual([])
    expect(suppressed).toEqual([{ ideaId: source.ideaId, reason: 'CURRENT_DISCUSSION_DESCENDS_FROM_IDEA' }])
  })

  it('suppresses an Idea created in this conversation', () => {
    const created = candidate({ title: '塔防游戏的方向', createdInConversation: true })
    const { suppressed } = suppressResurfacingCandidates(scored([created], turn), {})
    expect(suppressed).toEqual([{ ideaId: created.ideaId, reason: 'CREATED_IN_CURRENT_CONVERSATION' }])
  })

  it('suppresses a below-floor score after the earlier checks', () => {
    const weak = candidate({ title: '提到塔防而已' })
    const { kept, suppressed } = suppressResurfacingCandidates(scored([weak], turn), {})
    expect(kept).toEqual([])
    expect(suppressed).toEqual([{ ideaId: weak.ideaId, reason: 'BELOW_RETRIEVAL_FLOOR' }])
  })

  it('lifecycle wins over provenance and floor on the same candidate', () => {
    const archived = candidate({ title: '完全无关', status: 'archived', createdInConversation: true })
    const { suppressed } = suppressResurfacingCandidates(scored([archived], turn), {})
    expect(suppressed).toEqual([{ ideaId: archived.ideaId, reason: 'IDEA_LIFECYCLE_INACTIVE' }])
  })

  it('keeps an eligible candidate untouched', () => {
    const good = candidate({ title: '塔防游戏的方向' })
    const { kept, suppressed } = suppressResurfacingCandidates(scored([good], turn), {})
    expect(suppressed).toEqual([])
    expect(kept.map(entry => entry.candidate.ideaId)).toEqual([good.ideaId])
  })
})
