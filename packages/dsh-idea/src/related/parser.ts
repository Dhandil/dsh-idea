/**
 * Strict parser of the Related Ideas judgment output: the entire response
 * must be exactly one JSON object — raw, or in exactly one fenced `json`
 * block (the shared Save/Evolution convention) — whose root carries exactly
 * the `matches` key: an array of at most three entries, each carrying
 * exactly `ideaId` and `whyUsefulNow` (extra model keys like score or
 * confidence reject the output). Every entry must reference a known
 * candidate id
 * exactly once with a trimmed, non-empty `whyUsefulNow` within the frozen
 * limit. Nothing is partially accepted; a malformed judgment produces no
 * writes and no retry.
 * @module @dsh-external/dsh-idea/src/related/parser
 */

import { IdeaPreparationError } from '../preparation/errors.ts'
import { parseStrictJsonObject } from '../preparation/parser.ts'
import { RELATED_MATCH_LIMIT, RELATED_WHY_LIMIT } from './types.ts'
import type { RelatedJudgment } from './types.ts'

function invalid(message: string, cause?: unknown): IdeaPreparationError {
  return new IdeaPreparationError('invalid-model-output', message, { cause })
}

/**
 * Parse and validate one judgment response against the supplied candidate
 * ids. An empty `matches` array is a valid zero-match judgment.
 * @param text - The joined text output of the judgment stream.
 * @param candidateIds - Every id the candidate pool supplied.
 * @returns the validated judgments, in model order.
 * @throws `IdeaPreparationError` with code `invalid-model-output` on any
 * framing, JSON, or constraint failure.
 */
export function parseRelatedMatches(text: string, candidateIds: ReadonlySet<string>): RelatedJudgment[] {
  const parsed = parseStrictJsonObject(text)
  for (const key of Object.keys(parsed)) {
    if (key !== 'matches') {
      throw invalid(`model output carries unknown root key '${key}'`)
    }
  }
  const rawMatches = parsed.matches
  if (!Array.isArray(rawMatches)) {
    throw invalid('model output has no matches array')
  }
  if (rawMatches.length > RELATED_MATCH_LIMIT) {
    throw invalid(`model output exceeds ${RELATED_MATCH_LIMIT} matches`)
  }

  const judgments: RelatedJudgment[] = []
  const seen = new Set<string>()
  for (const entry of rawMatches) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw invalid('model output has a non-object match entry')
    }
    const match = entry as Record<string, unknown>
    for (const key of Object.keys(match)) {
      if (key !== 'ideaId' && key !== 'whyUsefulNow') {
        throw invalid(`model output match carries unknown key '${key}'`)
      }
    }
    const ideaId = match.ideaId
    const whyUsefulNow = match.whyUsefulNow
    if (typeof ideaId !== 'string') {
      throw invalid('model output has a match without an ideaId')
    }
    if (!candidateIds.has(ideaId)) {
      throw invalid(`model output references unknown candidate '${ideaId}'`)
    }
    if (seen.has(ideaId)) {
      throw invalid(`model output repeats candidate '${ideaId}'`)
    }
    if (typeof whyUsefulNow !== 'string') {
      throw invalid(`match '${ideaId}' carries no whyUsefulNow text`)
    }
    const why = whyUsefulNow.trim()
    if (why.length === 0) {
      throw invalid(`match '${ideaId}' has a blank whyUsefulNow`)
    }
    if (why.length > RELATED_WHY_LIMIT) {
      throw invalid(`match '${ideaId}' exceeds the ${RELATED_WHY_LIMIT}-character whyUsefulNow limit`)
    }
    seen.add(ideaId)
    judgments.push({ ideaId, whyUsefulNow: why })
  }
  return judgments
}
