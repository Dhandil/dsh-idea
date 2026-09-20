/**
 * The deterministic, zero-model Opportunity Detector (§6). It answers only
 * one question — is now worth checking historical Ideas — from the current
 * user turn plus a small bounded recent context; it never selects an Idea
 * and never reads the corpus. Continuation-only turns stay silent; a strong
 * signal admits the evaluation, medium signals never do; strong compounds
 * report the atomic observations they were seen through without counting
 * them twice. False negatives are preferred over false positives: the
 * default is silence.
 * @module @dsh-external/dsh-idea/src/resurfacing/detector
 */

import { normalizeLexical } from '../retrieval/lexical.ts'
import { RESURFACING_SIGNAL_EVIDENCE_LIMIT } from './types.ts'
import type {
  ResurfacingContextMessage,
  ResurfacingDetection,
  ResurfacingMediumAtomicSignal,
  ResurfacingSignal,
  ResurfacingSignalType,
} from './types.ts'

/**
 * Turns made only of these tokens (after punctuation and trailing-particle
 * stripping) are continuations of the current exchange: the user asked for
 * more of the same, so there is no new opportunity to check.
 */
const CONTINUATION_ONLY = new Set([
  '继续', '请继续', '继续说', '说下去', '再说说', '详细说说', '展开说说',
  '详细一点', '再详细一点', '为什么', '为什么呢', '好的', '好', '行', '嗯', '哦',
  '了解了', '明白', '明白了', '收到', 'ok', 'okay', 'sure', 'yes',
])

interface SignalRule {
  type: ResurfacingSignalType
  strength: 'strong' | 'medium'
  pattern: RegExp
}

const STRONG_RULES: SignalRule[] = [
  {
    type: 'GOAL_DECLARATION',
    strength: 'strong',
    pattern: /(准备|打算|想要|计划|决定)(重新|从头|再)?(做|写|搭|建|开发|实现|设计|搞|弄)|(重新|再)(做|写|搞|弄)一个|从头(开始|做)|我(要|想)(做|写|开发|设计)一个/,
  },
  {
    type: 'PROBLEM_RECURRENCE',
    strength: 'strong',
    pattern: /(问题|错误|报错|bug|故障|异常)又(出现|发生|来了|复现|犯了)|又出现(了)?(同样|相同|一样)?的?(问题|错误|报错)|老问题又?(出现|来了)|还是(那个|同样)的?(问题|报错|错误)/,
  },
  {
    type: 'MEMORY_GAP',
    strength: 'strong',
    pattern: /之前.*(讨论|研究|聊|记录|保存|提)过|(有没有|记得不)之前|上次(那个|说的|讨论的)那个?|之前(做过|研究过|讨论过|写过)|记得以前(有个|做过)/,
  },
  {
    type: 'DECISION_POINT',
    strength: 'strong',
    pattern: /该?[^，,。；;？?！!]{0,16}(选|用|买|挑|定)还是[^，,。；;？?！!]{1,16}|[^，,。；;？?！!]{1,16}还是[^，,。；;？?！!]{1,16}(呢|哪个|更好|更合适)|哪个(更好|更合适|靠谱)|怎么选/,
  },
]

const COMPOUND_RULES: Array<SignalRule & { atomics: readonly ResurfacingMediumAtomicSignal[] }> = [
  {
    type: 'TOPIC_REENTRY',
    strength: 'strong',
    pattern: /(那个|之前的?)(方向|思路|话题|想法|方案)其实?又(有点|挺|很|还是)?(意思|吸引|可行|想(做|试试))|又(回到|想起)(了)?那个|(重新|又)考虑(一下)?那个|那个方向其实又有点意思/,
    atomics: ['ATTITUDE_REOPENING'],
  },
  {
    type: 'STRATEGY_RESET',
    strength: 'strong',
    pattern: /换(一种|个|条|种)?(办法|方法|思路|方向|方案|路子)|此路不通|走不通|行不通|只能(换|改)(了|方案|思路)?|推倒重来/,
    atomics: ['FRUSTRATION'],
  },
]

const MEDIUM_RULES: SignalRule[] = [
  { type: 'TOPIC_SHIFT', strength: 'medium', pattern: /换个(话题|方向|问题)|说(个)?(点)?别的|先不(谈|说|聊)|说回|聊回/ },
  { type: 'FRUSTRATION', strength: 'medium', pattern: /还是不行|不行了|搞不定|卡住了|卡在(这里|这步)|又失败|太麻烦|解决不了/ },
  { type: 'ATTITUDE_REOPENING', strength: 'medium', pattern: /又有点意思|好像(也)?可以|重新想想|再想想|倒是可以|说不定(也)?行/ },
  { type: 'STAGE_TRANSITION', strength: 'medium', pattern: /下一步|接下来|开始动手|着手|先做(哪个|什么)|规划(一下)?|排个计划/ },
  { type: 'PARTIAL_RECALL', strength: 'medium', pattern: /之前有个|好像(以前|之前)?(做过|见过|写过)|记得(以前|之前)|之前提到/ },
]

/** The short-form follow-up "那X呢？" — a decision probe only with context. */
const SHORT_FORM_DECISION = /^那[^，,。；;？?！!]{1,20}(呢|怎么样|如何)$/

/** Alternative/choice structure markers a context must show for the short form. */
const DECISION_CONTEXT_MARKERS = /还是|或者|对比|比起|两个|哪个|选|考虑/

/** Strip punctuation and trailing mood particles for the continuation check. */
function continuationKey(normalized: string): string {
  return normalized
    .replace(/[？?！!。.，,、；;：:～~\s]/g, '')
    .replace(/[吧呢啊吗哈呀哦嗯么]+$/, '')
}

/** Bounded verbatim evidence snippet of one rule hit. */
function evidenceOf(normalized: string, pattern: RegExp): string {
  const matched = pattern.exec(normalized)?.[0] ?? normalized
  return matched.slice(0, RESURFACING_SIGNAL_EVIDENCE_LIMIT)
}

/**
 * Detect whether the current turn is worth checking historical Ideas for.
 * @param input.currentTurn - The completed turn's user text.
 * @param input.recentContext - A small bounded recent visible context.
 * @returns the detection verdict; `admitted` requires one strong signal.
 */
export function detectResurfacingOpportunity(input: {
  currentTurn: string
  recentContext: readonly ResurfacingContextMessage[]
}): ResurfacingDetection {
  const normalized = normalizeLexical(input.currentTurn)
  if (normalized.length === 0) return { admitted: false, signals: [] }

  if (CONTINUATION_ONLY.has(continuationKey(normalized))) {
    return { admitted: false, signals: [] }
  }
  const stripped = normalized.replace(/[？?！!。.～~]+$/, '')

  const signals: ResurfacingSignal[] = []
  const covered = new Set<ResurfacingMediumAtomicSignal>()

  for (const rule of COMPOUND_RULES) {
    if (!rule.pattern.test(normalized)) continue
    const derivedFrom = rule.atomics.filter(atomic =>
      MEDIUM_RULES.some(medium => medium.type === atomic && medium.pattern.test(normalized)))
    for (const atomic of derivedFrom) covered.add(atomic)
    signals.push({
      type: rule.type,
      strength: rule.strength,
      evidence: evidenceOf(normalized, rule.pattern),
      ...(derivedFrom.length > 0 ? { derivedFrom } : {}),
    })
  }

  for (const rule of STRONG_RULES) {
    if (!rule.pattern.test(normalized)) continue
    if (rule.type === 'DECISION_POINT' && isShortFormDecision(normalized)) continue
    signals.push({ type: rule.type, strength: rule.strength, evidence: evidenceOf(normalized, rule.pattern) })
  }

  if (!signals.some(signal => signal.type === 'DECISION_POINT') && isShortFormDecision(stripped)) {
    if (shortFormAdmits(stripped, input.recentContext)) {
      signals.push({
        type: 'DECISION_POINT',
        strength: 'strong',
        evidence: normalized.slice(0, RESURFACING_SIGNAL_EVIDENCE_LIMIT),
      })
    }
  }

  for (const rule of MEDIUM_RULES) {
    if (covered.has(rule.type as ResurfacingMediumAtomicSignal)) continue
    if (!rule.pattern.test(normalized)) continue
    signals.push({ type: rule.type, strength: rule.strength, evidence: evidenceOf(normalized, rule.pattern) })
  }

  return { admitted: signals.some(signal => signal.strength === 'strong'), signals }
}

function isShortFormDecision(normalized: string): boolean {
  return SHORT_FORM_DECISION.test(normalized)
}

/**
 * The short form admits only when the bounded recent context deterministically
 * shows an active choice structure about the very entity the user names:
 * the entity must already be present, and the context must carry an
 * alternative/choice marker. Otherwise the turn stays silent.
 */
function shortFormAdmits(
  normalized: string,
  recentContext: readonly ResurfacingContextMessage[],
): boolean {
  const entity = normalized.slice(1).replace(/(呢|怎么样|如何)$/, '')
  if (entity.length === 0) return false
  const contextText = normalizeLexical(recentContext.map(message => message.text).join('\n'))
  if (contextText.length === 0) return false
  return contextText.includes(entity) && DECISION_CONTEXT_MARKERS.test(contextText)
}
