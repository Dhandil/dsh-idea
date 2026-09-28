/**
 * Strict parser of the Harness-LLM selector output (T11.1): the entire
 * response must be exactly one raw JSON object — fenced blocks, prose, and
 * Markdown wrappers are rejected, deliberately stricter than the shared
 * fenced-tolerant convention — whose root carries exactly the `ideaIds` key:
 * an array of at most twelve unique string ids, every one belonging to the
 * supplied candidate pool. An empty array is a valid zero-selection verdict.
 * Nothing is partially accepted; a malformed selection empties the whole
 * semantic branch with no retry.
 * @module @dsh-external/dsh-idea/src/semantic/selector-parser
 */

import { IdeaPreparationError } from '../preparation/errors.ts'
import { SEMANTIC_TOP_K } from './types.ts'

function invalid(message: string, cause?: unknown): IdeaPreparationError {
  return new IdeaPreparationError('invalid-model-output', message, { cause })
}

/**
 * Parse and validate one selector response against the supplied pool ids.
 * @param text - The joined text output of the selector stream.
 * @param poolIds - Every id the selector pool supplied.
 * @returns the validated idea ids, in model order.
 * @throws `IdeaPreparationError` with code `invalid-model-output` on any
 * framing, JSON, or constraint failure.
 */
export function parseSelectorIdeaIds(text: string, poolIds: ReadonlySet<string>): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    throw invalid('model output is empty')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw invalid('model output is not valid JSON', error)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalid('model output is not a JSON object')
  }
  const root = parsed as Record<string, unknown>
  for (const key of Object.keys(root)) {
    if (key !== 'ideaIds') {
      throw invalid(`model output carries unknown root key '${key}'`)
    }
  }
  const rawIds = root.ideaIds
  if (!Array.isArray(rawIds)) {
    throw invalid('model output has no ideaIds array')
  }
  if (rawIds.length > SEMANTIC_TOP_K) {
    throw invalid(`model output exceeds ${SEMANTIC_TOP_K} idea ids`)
  }
  const ids: string[] = []
  const seen = new Set<string>()
  for (const entry of rawIds) {
    if (typeof entry !== 'string') {
      throw invalid('model output has a non-string idea id')
    }
    if (!poolIds.has(entry)) {
      throw invalid(`model output references unknown candidate '${entry}'`)
    }
    if (seen.has(entry)) {
      throw invalid(`model output repeats candidate '${entry}'`)
    }
    seen.add(entry)
    ids.push(entry)
  }
  return ids
}
