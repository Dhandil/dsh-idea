/**
 * The deterministic Opportunity Detector over the frozen §17 vectors:
 * continuation-only turns stay silent, strong signals admit, medium signals
 * never admit alone, compounds report their atomic derivations without
 * double counting, and the short-form decision probe admits only with a
 * deterministic entity-plus-choice context. Pure and offline.
 * @module tests/resurfacing-detector.spec
 */

import { describe, expect, it } from 'vitest'
import { detectResurfacingOpportunity } from '../src/resurfacing/detector.ts'
import { RESURFACING_SIGNAL_EVIDENCE_LIMIT } from '../src/resurfacing/types.ts'
import type { ResurfacingContextMessage } from '../src/resurfacing/types.ts'

const detect = (currentTurn: string, recentContext: ResurfacingContextMessage[] = []) =>
  detectResurfacingOpportunity({ currentTurn, recentContext })

const typesOf = (currentTurn: string, recentContext: ResurfacingContextMessage[] = []) =>
  detect(currentTurn, recentContext).signals.map(signal => signal.type)

describe('continuation-only turns stay silent', () => {
  const silent = ['继续', '为什么？', '详细一点', '好的', '再详细一点吧', '明白了', '嗯。']
  for (const turn of silent) {
    it(`does not admit: ${turn}`, () => {
      const detection = detect(turn)
      expect(detection.admitted).toBe(false)
      expect(detection.signals).toEqual([])
    })
  }

  it('does not admit an empty turn', () => {
    expect(detect('。').admitted).toBe(false)
    expect(detect('   ').admitted).toBe(false)
  })
})

describe('strong atomic signals admit', () => {
  it('admits a goal declaration', () => {
    const detection = detect('我准备重新做一个个人知识管理工具。')
    expect(detection.admitted).toBe(true)
    expect(typesOf('我准备重新做一个个人知识管理工具。')).toContain('GOAL_DECLARATION')
  })

  it('admits a problem recurrence', () => {
    const detection = detect('之前那个问题又出现了。')
    expect(detection.admitted).toBe(true)
    expect(detection.signals.some(signal => signal.type === 'PROBLEM_RECURRENCE')).toBe(true)
  })

  it('admits a memory gap', () => {
    expect(detect('我们之前讨论过这个吗？').admitted).toBe(true)
  })

  it('admits an explicit either-or decision point', () => {
    const detection = detect('这个方案和另一个方案哪个更好？')
    expect(detection.admitted).toBe(true)
    expect(detection.signals.some(signal => signal.type === 'DECISION_POINT')).toBe(true)
  })

  it('bounds every evidence snippet to the frozen limit', () => {
    const detection = detect(`我准备重新做一个${'很'.repeat(200)}大的系统。`)
    for (const signal of detection.signals) {
      expect(signal.evidence.length).toBeLessThanOrEqual(RESURFACING_SIGNAL_EVIDENCE_LIMIT)
    }
  })
})

describe('strong compound signals admit through their atomics', () => {
  it('reports TOPIC_REENTRY with ATTITUDE_REOPENING derived, never double counted', () => {
    const detection = detect('塔防那个方向其实又有点意思。')
    expect(detection.admitted).toBe(true)
    expect(detection.signals.map(signal => signal.type)).toEqual(['TOPIC_REENTRY'])
    const compound = detection.signals[0]!
    expect(compound.derivedFrom).toEqual(['ATTITUDE_REOPENING'])
  })

  it('reports STRATEGY_RESET with FRUSTRATION derived, never double counted', () => {
    const detection = detect('还是不行，我可能得换一种办法了。')
    expect(detection.admitted).toBe(true)
    expect(detection.signals.map(signal => signal.type)).toEqual(['STRATEGY_RESET'])
    const compound = detection.signals[0]!
    expect(compound.derivedFrom).toEqual(['FRUSTRATION'])
  })

  it('omits derivedFrom when no atomic component fired', () => {
    const detection = detect('这条路走不通，此路不通。')
    const compound = detection.signals.find(signal => signal.type === 'STRATEGY_RESET')
    expect(compound).toBeDefined()
    expect(compound!.derivedFrom).toBeUndefined()
  })
})

describe('medium signals never admit alone', () => {
  it('records medium observations but stays silent', () => {
    const detection = detect('先不谈这个，下一步做什么？')
    expect(detection.admitted).toBe(false)
    expect(detection.signals.length).toBeGreaterThan(0)
    expect(detection.signals.every(signal => signal.strength === 'medium')).toBe(true)
  })
})

describe('the short-form decision probe needs its context', () => {
  const entity = { role: 'user' as const, text: 'Mac mini 和树莓派到底怎么选，纠结中' }

  it('stays silent without any context', () => {
    expect(detect('那Mac mini呢？').admitted).toBe(false)
  })

  it('stays silent when the entity is absent from the context', () => {
    const detection = detect('那Mac mini呢？', [{ role: 'user', text: '我们之前在讨论路由器还是软路由' }])
    expect(detection.admitted).toBe(false)
  })

  it('stays silent when the context has the entity but no choice structure', () => {
    const detection = detect('那Mac mini呢？', [{ role: 'assistant', text: 'Mac mini 的功耗很低，适合常开' }])
    expect(detection.admitted).toBe(false)
  })

  it('admits only with the entity and a choice structure in context', () => {
    const detection = detect('那Mac mini呢？', [entity])
    expect(detection.admitted).toBe(true)
    expect(detection.signals.map(signal => signal.type)).toEqual(['DECISION_POINT'])
  })
})
