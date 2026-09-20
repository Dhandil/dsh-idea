/**
 * Strict parser of the Judge's three-line answer (§11). The vocabulary is
 * closed and cross-checked: a SURFACE decision must carry a positive reason
 * and a known candidate id; a NONE decision must carry a negative reason and
 * no idea line; anything else — extra prose, unknown reasons, an unknown or
 * ambiguous idea id, a positive reason on NONE — is invalid output, which
 * fails closed to silence. Model confidence is never parsed.
 * @module @dsh-external/dsh-idea/src/resurfacing/parser
 */

import { IdeaId } from '../types.ts'
import type {
  ResurfacingJudgeNegativeReason,
  ResurfacingJudgePositiveReason,
  ResurfacingJudgment,
} from './types.ts'

const POSITIVE_REASONS = new Set<ResurfacingJudgePositiveReason>([
  'ADDS_MISSING_OPTION',
  'RESTORES_FORGOTTEN_DIRECTION',
  'ADDS_DECISION_VALUE',
  'ADDS_VALUE_TO_RECURRENT_PROBLEM',
])

const NEGATIVE_REASONS = new Set<ResurfacingJudgeNegativeReason>([
  'NOT_RELEVANT',
  'REDUNDANT_WITH_CONTEXT',
  'INTERESTING_BUT_NOT_USEFUL_NOW',
  'STALE_FOR_CURRENT_SITUATION',
  'TOO_WEAKLY_CONNECTED',
  'MULTIPLE_AMBIGUOUS_CANDIDATES',
])

/** The three answer lines, matched anchored and whole. */
const DECISION_LINE = /^DECISION:\s*(NONE|SURFACE)$/
const REASON_LINE = /^REASON:\s*([A-Z_]+)$/
const IDEA_LINE = /^IDEA:\s*(\S+)$/

/**
 * Parse one Judge answer against the candidate pool it saw.
 * @returns the validated judgment; invalid output yields `JUDGE_INVALID_OUTPUT`.
 */
export function parseResurfacingJudgment(
  text: string,
  poolIdeaIds: ReadonlySet<string>,
): ResurfacingJudgment {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  const decision = lines.map(line => DECISION_LINE.exec(line)).find(entry => entry !== null)?.[1]
  const reason = lines.map(line => REASON_LINE.exec(line)).find(entry => entry !== null)?.[1]
  const ideaId = lines.map(line => IDEA_LINE.exec(line)).find(entry => entry !== null)?.[1]

  if (decision === undefined || reason === undefined) {
    return judgmentInvalid()
  }
  if (lines.some(line => !DECISION_LINE.test(line) && !REASON_LINE.test(line) && !IDEA_LINE.test(line))) {
    return judgmentInvalid()
  }

  if (decision === 'SURFACE') {
    if (!POSITIVE_REASONS.has(reason as ResurfacingJudgePositiveReason)) return judgmentInvalid()
    if (ideaId === undefined || !poolIdeaIds.has(ideaId)) return judgmentInvalid()
    return { outcome: 'surface', reason: reason as ResurfacingJudgePositiveReason, ideaId: IdeaId(ideaId), dropped: [] }
  }

  if (!NEGATIVE_REASONS.has(reason as ResurfacingJudgeNegativeReason)) return judgmentInvalid()
  if (ideaId !== undefined) return judgmentInvalid()
  return { outcome: 'none', reason: reason as ResurfacingJudgeNegativeReason, dropped: [] }
}

function judgmentInvalid(): ResurfacingJudgment {
  return { outcome: 'none', reason: 'JUDGE_INVALID_OUTPUT', dropped: [] }
}
