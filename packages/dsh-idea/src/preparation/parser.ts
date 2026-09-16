/**
 * Parser for model extraction output: the entire response must be exactly
 * one JSON object — raw, or wrapped in exactly one fenced `json` block with
 * nothing outside it — carrying exactly the seven IdeaDraft keys; must
 * satisfy the T1 `ideaDraftSchema`. Anything
 * else (prose, multiple objects, arrays, malformed JSON, unknown model keys,
 * schema-invalid
 * fields) is `invalid-model-output`. The model never writes storage; this
 * parser only yields a validated draft proposal.
 * @module @dsh-external/dsh-idea/src/preparation/parser
 */

import { IdeaPreparationError } from './errors.ts'
import { ideaDraftSchema } from '../schema.ts'
import type { IdeaDraft } from '../types.ts'

const FENCE_PATTERN = /```json[ \t]*\r?\n([\s\S]*?)```/g

function invalid(message: string, cause?: unknown): IdeaPreparationError {
  return new IdeaPreparationError('invalid-model-output', message, { cause })
}

/** Parse one JSON object candidate, rejecting arrays, primitives, and null. */
function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw invalid('model output is not valid JSON', error)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalid('model output is not a JSON object')
  }
  return parsed as Record<string, unknown>
}

/**
 * Extract the one JSON object a strict model response carries: the entire
 * text must be exactly one JSON object — raw, or wrapped in exactly one
 * fenced `json` block with nothing outside it. Prose, multiple objects,
 * arrays, primitives, and malformed JSON are `invalid-model-output`.
 */
export function parseStrictJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    throw invalid('model output is empty')
  }

  let candidate: string
  const fences = [...trimmed.matchAll(FENCE_PATTERN)]
  if (fences.length > 0) {
    // Exactly one fenced json block, and nothing outside it.
    if (fences.length > 1) {
      throw invalid('model output contains more than one fenced json block')
    }
    const outside = trimmed.replace(FENCE_PATTERN, '').trim()
    if (outside.length > 0) {
      throw invalid('model output has prose around the fenced json block')
    }
    candidate = fences[0]![1]!
  } else {
    candidate = trimmed
  }

  return parseJsonObject(candidate)
}

/**
 * The exact top-level keys a model extraction output may carry. The shared
 * `ideaDraftSchema` stays permissive for user-edited drafts at the service
 * boundary; the model boundary is stricter — any extra model key (confidence
 * scores, invented fields) rejects the whole output.
 */
const MODEL_DRAFT_KEYS: ReadonlySet<string> = new Set([
  'title',
  'core',
  'motivation',
  'currentConclusion',
  'possibleValue',
  'useWhen',
  'openQuestions',
])

/**
 * Parse and validate one model response into an {@link IdeaDraft}.
 * @param text - The joined text output of the extraction stream.
 * @returns the validated, normalized draft.
 * @throws `IdeaPreparationError` with code `invalid-model-output` on any
 * framing, JSON, unknown-key, or schema failure.
 */
export function parseIdeaDraftOutput(text: string): IdeaDraft {
  const parsed = parseStrictJsonObject(text)
  for (const key of Object.keys(parsed)) {
    if (!MODEL_DRAFT_KEYS.has(key)) {
      throw invalid(`model output carries unknown key '${key}'`)
    }
  }
  const result = ideaDraftSchema.safeParse(parsed)
  if (!result.success) {
    throw invalid('model output does not match the IdeaDraft schema', result.error)
  }
  return result.data
}
