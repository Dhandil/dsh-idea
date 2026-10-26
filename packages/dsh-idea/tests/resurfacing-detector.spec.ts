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

describe('T13.3B explicit saved-Idea recall', () => {
  const positive = [
    '帮我找找以前保存的 Idea。',
    '请找回我保存的那个想法。',
    '把上次存的那个点子找回来。',
    '能帮我翻出先前记下的方案吗？',
    '我想找回曾经收藏的那个创意。',
    '我以前存过一个想法，帮我找出来。',
    '你还记得我保存的那个 Idea 吗？',
    '麻烦列出我之前记录的 Idea。',
    '请帮我回忆一下以前保存的检索方案。',
    'Find the idea I saved earlier.',
    'Could you help me retrieve my saved idea about retrieval?',
    'Can you remind me of the idea I bookmarked last week?',
    'Do you remember the idea I saved before?',
    'Please bring back the idea I recorded yesterday.',
    'Show me my previously saved ideas.',
    'Help me look up an idea I saved.',
    'I want to find that idea I saved earlier.',
    'Where is the idea I saved about retrieval?',
    'Please find my saved idea named "Rocket".',
    'ＰＬＥＡＳＥ ＦＩＮＤ ＭＹ ＳＡＶＥＤ ＩＤＥＡ．',
    '帮我找回之前 saved 的 Idea。',
    'Please 找回我以前保存的那个 Idea。',
    'Can you find 我上次保存的想法？',
    '把我 bookmarked 的 idea 找出来。',
    'Show me 我以前收藏的那个 Idea。',
    'Could you locate the idea I saved?',
    'Search for my saved ideas.',
    'Remind me of my saved idea.',
    '你能帮我找到我之前收藏的 Idea 吗？',
    '帮我把以前存下的 Idea 翻出来。',
    '帮我找回之前保存过的 Idea。',
    '不要找新的点子；帮我找回以前保存的 Idea。',
    "Don't create a new idea; find the idea I saved.",
  ]
  for (const turn of positive) {
    it(`admits one bounded MEMORY_GAP: ${turn}`, () => {
      const detection = detect(turn)
      expect(detection.admitted).toBe(true)
      const memory = detection.signals.filter(signal => signal.type === 'MEMORY_GAP')
      expect(memory).toHaveLength(1)
      expect(memory[0]!.strength).toBe('strong')
      expect(memory[0]!.evidence.length).toBeGreaterThan(0)
      expect(memory[0]!.evidence.length).toBeLessThanOrEqual(RESURFACING_SIGNAL_EVIDENCE_LIMIT)
    })
  }

  const negative = [
    '不要帮我找以前保存的 Idea。',
    '不用回忆之前保存过的那个方案。',
    '我不想找回以前收藏的点子。',
    '别找我存过的 Idea。',
    '不是让你找以前保存的 Idea。',
    '请取消查找以前保存的 Idea。',
    "Don't find the idea I saved.",
    'Please do not retrieve my saved ideas.',
    'No need to look up the idea I saved.',
    'I am not asking you to recall the idea I saved.',
    'Never show me my saved ideas.',
    'Please stop finding my saved ideas.',
    '帮我不要 retrieve 我保存的 Idea。',
    'Please 不要找回我保存的 Idea。',
    '“帮我找回以前保存的 Idea。”',
    '「请找回我之前保存过的 Idea」这句话是什么意思？',
    '他说：“帮我找回以前保存的想法。”',
    'Please translate "Find the idea I saved earlier."',
    "Explain 'Find my saved idea'.",
    '> Find the idea I saved earlier.\n这是一段引用。',
    '```text\n帮我找回以前保存的 Idea\n```',
    '~~~text\nFind my saved idea\n~~~',
    '`Find my saved idea` 是示例。',
    'Find my saved idea means what?',
    '请解释如何找回以前保存的 Idea。',
    'How do I find my saved ideas?',
    'If I ask you to find my saved idea, what happens?',
    'What is an Idea?',
    '如何保存 Idea？',
    'What does saved idea mean?',
    'I saved an idea yesterday.',
    '以前保存的 Idea 很有趣。',
    'Find a new idea for saving money.',
    '帮我找一个新想法。',
    'Find my saved files.',
    '帮我找以前保存的密码。',
    'Can you save this idea?',
    '继续',
    '帮我找回没有保存过的 Idea。',
    '请找回未收藏的想法。',
    '不是找回之前保存过的 Idea。',
    'Find the idea I did not save.',
    "Find the idea I didn't save.",
    "Could you find the idea I haven't saved?",
    'Please find my not-yet-saved idea.',
    'The user said please find my saved idea.',
    'He asked: please retrieve the idea I saved.',
    '``Please find my saved idea``',
    '＂Please find my saved idea＂',
    '«Please find my saved idea»',
    '"Please find my saved idea\nThis is still quoted text',
    'Find the word idea in my saved document.',
    'Find my saved file called Idea.txt.',
    '帮我找一下新的 Idea 保存起来。',
    '请评价找回以前保存的 Idea 这个功能。',
    '帮我设计找回以前保存的 Idea 的流程。',
    'Please tell me how to find my saved ideas.',
    'Please evaluate how to retrieve the idea I saved.',
    'Find an idea that should be saved.',
    '比如帮我找回以前保存的 Idea 就是一个例子。',
    '这是一个例子：请找回以前保存的 Idea。',
    'A sample request is please find my saved idea.',
  ]
  for (const turn of negative) {
    it(`stays silent for non-request/negated/quoted input: ${turn}`, () => {
      expect(detect(turn).admitted).toBe(false)
    })
  }

  it('does not promote a recall request from recent context into the current turn', () => {
    expect(detect('好的', [{ role: 'user', text: 'Find my saved idea.' }]).admitted).toBe(false)
  })

  it('keeps a genuine request outside quoted data and bounds its evidence', () => {
    const result = detect(`“Find my saved idea” 请找回我以前保存的${'检索'.repeat(100)}方案。`)
    expect(result.admitted).toBe(true)
    expect(result.signals.filter(signal => signal.type === 'MEMORY_GAP')).toHaveLength(1)
    expect(result.signals.find(signal => signal.type === 'MEMORY_GAP')!.evidence.length)
      .toBeLessThanOrEqual(RESURFACING_SIGNAL_EVIDENCE_LIMIT)
  })
})

describe('T13.3B Repair1: direct retrieval versus procedural questions', () => {
  const directRequests = [
    '帮我找之前保存的 Idea',
    '帮我找以前收藏的那个点子。',
    '请找我上次记录的方案。',
    '给我找以前存的 Idea。',
    '麻烦找我保存的想法。',
    '你能帮我找之前保存的 Idea 吗？',
    'Please 帮我找之前保存的 Idea。',
    'Can you find 我之前保存的 Idea？',
    '请找回我以前保存的关于如何写测试的 Idea。',
    'Find the idea I saved about how to write tests.',
    'Could you find my saved idea named "How to retrieve documents"?',
    '帮我找之前保存的 Idea；而不是教我怎么查。',
    '请找我保存的关于如何部署的 Idea。',
  ]
  for (const turn of directRequests) {
    it(`admits the direct request, including bare 找 or a how-to topic: ${turn}`, () => {
      const result = detect(turn)
      expect(result.admitted).toBe(true)
      expect(result.signals.filter(signal => signal.type === 'MEMORY_GAP')).toHaveLength(1)
    })
  }

  const howQuestions = [
    '请问怎么找回以前保存的 Idea？',
    '请问如何找之前保存的 Idea？',
    '能告诉我怎么找回之前保存的 Idea 吗？',
    '你能解释一下怎样检索以前保存的 Idea 吗？',
    '帮我了解如何找回以前保存的 Idea。',
    '我想知道怎么找回之前保存的 Idea。',
    '请问之前保存过的 Idea 应该怎么找回？',
    '找回以前保存的 Idea 的方法是什么？',
    '请列出找回以前保存的 Idea 的步骤。',
    'Can you explain how to retrieve my saved idea?',
    'Could you tell me how I can find the idea I saved?',
    'I want to know how to look up my saved ideas.',
    'Help me understand how to find the idea I saved.',
    'Please show me the steps to find my saved ideas.',
    'How can I retrieve my saved idea?',
    'Where is the button to find my saved ideas?',
    'Can you explain the procedure for finding the idea I saved?',
    '能告诉我 how to find 我保存的 Idea 吗？',
    'Can you explain 如何找回我保存的 Idea？',
    'Can you find information about how to retrieve my saved idea?',
    'Can you find saved information about how to retrieve my idea?',
    '帮我找保存的资料，关于如何找回 Idea 的。',
  ]
  for (const turn of howQuestions) {
    it(`does not retrieve for a procedural question: ${turn}`, () => {
      expect(detect(turn).admitted).toBe(false)
    })
  }

  const nonRequests = [
    '不要帮我找之前保存的 Idea。',
    '请不找我之前保存的 Idea。',
    '帮我找没有保存过的 Idea。',
    '「帮我找之前保存的 Idea」这句话是什么意思？',
    "Translate 'Help me find my saved idea'.",
    'Can you explain what saved Idea means?',
    '帮我解释找之前保存的 Idea 这个说法。',
    'Find a new idea to save.',
    '帮我找之前保存的文件。',
    'Please do not find the idea I saved.',
  ]
  for (const turn of nonRequests) {
    it(`preserves negative boundaries after admitting bare 找: ${turn}`, () => {
      expect(detect(turn).admitted).toBe(false)
    })
  }
})
