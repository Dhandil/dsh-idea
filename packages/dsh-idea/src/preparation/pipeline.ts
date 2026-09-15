/**
 * Shared plumbing of the two Host preparation pipelines (Save Idea and
 * Evolution): the bounded session-surface read, the Harness model-route
 * resolution, and the one direct `ctx.llm.stream()` extraction drain. Both
 * pipelines share one error taxonomy — `IdeaPreparationError` — and make
 * exactly one model call per prepare with no retry. The captured discussion
 * is never replayed as privileged model turns; the caller frames it as data.
 * @module @dsh-external/dsh-idea/src/preparation/pipeline
 */

import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { IdeaPreparationError } from './errors.ts'
import type { IdeaPreparationModelRoute } from './types.ts'

/** Provider-route codes that mean the route cannot be served at all. */
export const ROUTE_UNAVAILABLE_CODES = new Set(['NO_ADAPTER', 'MISSING_CREDENTIAL', 'INVALID_CREDENTIAL', 'UNSUPPORTED_REASONING_EFFORT'])

/** Session-query codes that mean the session is absent rather than unreadable. */
export const SESSION_NOT_FOUND_CODE = 'SESSION_QUERY_SESSION_NOT_FOUND'

/** Every caller-abort check inside a preparation throws the taxonomy code. */
export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new IdeaPreparationError('request-cancelled', 'idea preparation was cancelled')
  }
}

/** Release one caller-owned observation lease without depending on `using`. */
export function disposeObservation(observation: object): void {
  const dispose = (observation as Record<symbol, (() => void) | undefined>)[Symbol.dispose]
  dispose?.()
}

/** Translate session-query failures onto the preparation taxonomy. */
export function sessionQueryError(error: unknown, sessionId: string): IdeaPreparationError {
  if (error instanceof SessionQueryError && error.code === SESSION_NOT_FOUND_CODE) {
    return new IdeaPreparationError('source-not-found', `session '${sessionId}' does not exist`, { cause: error })
  }
  return new IdeaPreparationError('source-unavailable', `session '${sessionId}' could not be read`, { cause: error })
}

/** Read the current Session surface, translating query failures. */
export async function readSessionSurface(sessionQuery: NonNullable<Context['sessionQuery']>, sessionId: string) {
  try {
    return await sessionQuery.readSurface(SessionId(sessionId))
  } catch (error) {
    throw sessionQueryError(error, sessionId)
  }
}

/**
 * Resolve the model route exactly as Harness does: the Session's projected
 * next selection when available, otherwise the host default. The optional
 * reasoning effort is preserved.
 */
export async function resolveModelRoute(
  sessionQuery: NonNullable<Context['sessionQuery']>,
  agentDefaultModel: NonNullable<Context['agentDefaultModel']>,
  sessionId: string,
  signal?: AbortSignal,
): Promise<IdeaPreparationModelRoute> {
  let observation: Awaited<ReturnType<NonNullable<Context['sessionQuery']>['observeSession']>>
  try {
    observation = await sessionQuery.observeSession(SessionId(sessionId), {
      ...(signal !== undefined ? { signal } : {}),
      projectionMode: 'all',
    })
  } catch (error) {
    throw sessionQueryError(error, sessionId)
  }
  try {
    const selection = observation.projections?.values.modelSelection?.next
      ?? agentDefaultModel.currentSelection()
    return {
      provider: selection.provider,
      model: selection.model,
      ...(selection.reasoningEffort !== undefined ? { reasoningEffort: selection.reasoningEffort } : {}),
    }
  } catch (error) {
    throw new IdeaPreparationError(
      'model-unavailable',
      `no usable model route is available for session '${sessionId}'`,
      { cause: error },
    )
  } finally {
    disposeObservation(observation)
  }
}

/**
 * The single extraction attempt behind one prepared `GenerateOptions`: one
 * `ctx.llm.stream()` call, drained through `BlockAssembler`, classified by
 * its terminal finish, and joined from its text blocks. A failed or
 * malformed attempt is never retried here; the caller parses the text.
 */
export async function extractModelText(
  llm: NonNullable<Context['llm']>,
  options: GenerateOptions,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const assembler = new BlockAssembler()
  try {
    for await (const chunk of llm.stream(options)) {
      signal?.throwIfAborted()
      assembler.push(chunk)
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new IdeaPreparationError('request-cancelled', 'idea preparation was cancelled', { cause: error })
    }
    throw new IdeaPreparationError('model-failed', 'the idea extraction stream failed', { cause: error })
  }
  checkCancelled(signal)

  assertSuccessfulFinish(assembler.finish.kind, assembler.finish, sessionId)
  const blocks = assembler.blocks()
  if (blocks.some(block => block.type === 'tool-call')) {
    throw new IdeaPreparationError('invalid-model-output', 'model produced a tool call instead of a draft')
  }
  return blocks
    .filter(block => block.type === 'text')
    .map(block => (block as { text: string }).text)
    .join('')
}

/** Map every non-success terminal finish onto the preparation taxonomy. */
function assertSuccessfulFinish(kind: string, finish: unknown, sessionId: string): void {
  if (kind === 'stop') return
  if (kind === 'aborted') {
    throw new IdeaPreparationError('request-cancelled', 'idea preparation was cancelled', { cause: finish })
  }
  if (kind === 'error') {
    const code = (finish as { failure?: { code?: string } }).failure?.code
    if (code !== undefined && ROUTE_UNAVAILABLE_CODES.has(code)) {
      throw new IdeaPreparationError(
        'model-unavailable',
        `model route for session '${sessionId}' cannot be served (${code})`,
        { cause: finish },
      )
    }
    throw new IdeaPreparationError('model-failed', 'the idea extraction model call failed', { cause: finish })
  }
  if (kind === 'tool-calls') {
    throw new IdeaPreparationError('invalid-model-output', 'model produced tool calls instead of a draft')
  }
  // 'max-tokens' and any unrecognized terminal finish are provider failures.
  throw new IdeaPreparationError(
    'model-failed',
    `the idea extraction stream ended prematurely (${kind})`,
    { cause: finish },
  )
}
