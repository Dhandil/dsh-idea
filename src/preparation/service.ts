/**
 * The Save Idea preparation service (`ctx.ideaPreparations`). One call is one
 * bounded proposal: read the Session surface, capture the visible discussion
 * behind the requested assistant anchor, resolve the current model route
 * (projection first, host default as fallback), make exactly one direct
 * `ctx.llm.stream()` call — no Agent Loop, no tools, no hidden retry — parse
 * the response strictly against the T1 `IdeaDraft`, and register the
 * canonical captured source in the ephemeral registry. Preparation itself
 * never writes durable Idea state; `IdeaService` stays the only writer.
 * @module @dsh-external/dsh-idea/src/preparation/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { captureDiscussionFromSurface } from './context.ts'
import { IdeaPreparationError } from './errors.ts'
import type { IdeaPreparationErrorCode } from './errors.ts'
import { parseIdeaDraftOutput } from './parser.ts'
import { buildIdeaExtractionPrompt } from './prompt.ts'
import { IdeaPreparationRegistry } from './registry.ts'
import type {
  IdeaPreparationModelRoute,
  IdeaPreparationPreview,
  PreparedIdeaSource,
} from './types.ts'
import type { SourceDiscussionDraft } from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaPreparations: IdeaPreparationService
  }
}

/** Provider-route codes that mean the route cannot be served at all. */
const ROUTE_UNAVAILABLE_CODES = new Set(['NO_ADAPTER', 'MISSING_CREDENTIAL', 'INVALID_CREDENTIAL', 'UNSUPPORTED_REASONING_EFFORT'])

/** Session-query codes that mean the session is absent rather than unreadable. */
const SESSION_NOT_FOUND_CODE = 'SESSION_QUERY_SESSION_NOT_FOUND'

/** Release one caller-owned observation lease without depending on `using`. */
function disposeObservation(observation: object): void {
  const dispose = (observation as Record<symbol, (() => void) | undefined>)[Symbol.dispose]
  dispose?.()
}

export class IdeaPreparationService extends Service {
  static inject = ['sessionQuery', 'agentDefaultModel', 'llm']

  /** Host-only ephemeral registry; a later commit task resolves through it. */
  readonly preparations: IdeaPreparationRegistry

  constructor(ctx: Context) {
    super(ctx, 'ideaPreparations')
    this.preparations = new IdeaPreparationRegistry()
  }

  /** Every caller-abort check inside preparation throws the taxonomy code. */
  private static checkCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new IdeaPreparationError('request-cancelled', 'idea preparation was cancelled')
    }
  }

  /**
   * Turn one finalized assistant message into an editable Idea draft
   * proposal plus an opaque preparation reference.
   * @param sessionId - The Session the discussion lives in.
   * @param anchorMessageId - The finalized assistant message to anchor on.
   * @param signal - Optional caller cancellation; checked at every stage.
   * @returns the preview proposal carrying the model draft and capture stats.
   * @throws `IdeaPreparationError` with a stable {@link IdeaPreparationErrorCode}.
   */
  async prepareFromMessage(
    sessionId: string,
    anchorMessageId: string,
    signal?: AbortSignal,
  ): Promise<IdeaPreparationPreview> {
    IdeaPreparationService.checkCancelled(signal)

    const surface = await this.readSurface(sessionId)
    IdeaPreparationService.checkCancelled(signal)

    const captured = captureDiscussionFromSurface(surface.events, anchorMessageId)

    const route = await this.resolveModelRoute(sessionId, signal)
    IdeaPreparationService.checkCancelled(signal)

    const draft = await this.extractDraft(captured.messages, sessionId, route, signal)

    IdeaPreparationService.checkCancelled(signal)
    const preparedSource: SourceDiscussionDraft = {
      sessionId,
      anchorMessageId,
      startSeq: captured.startSeq,
      endSeq: captured.endSeq,
      capturedContext: captured.messages,
    }
    const entry: PreparedIdeaSource = { source: preparedSource, model: route, createdAt: Date.now() }
    const preparationId = this.preparations.register(entry)
    return {
      preparationId,
      draft,
      source: {
        sessionId,
        anchorMessageId,
        startSeq: captured.startSeq,
        endSeq: captured.endSeq,
        messageCount: captured.messages.length,
        characterCount: captured.characterCount,
      },
      model: route,
    }
  }

  /** Read the current Session surface, translating query failures. */
  private async readSurface(sessionId: string) {
    try {
      return await this.ctx.sessionQuery.readSurface(SessionId(sessionId))
    } catch (error) {
      throw this.sessionError(error, sessionId)
    }
  }

  /**
   * Resolve the model route exactly as Harness does: the Session's projected
   * next selection when available, otherwise the host default. The optional
   * reasoning effort is preserved.
   */
  private async resolveModelRoute(sessionId: string, signal?: AbortSignal): Promise<IdeaPreparationModelRoute> {
    let observation: SessionObservation
    try {
      observation = await this.ctx.sessionQuery.observeSession(SessionId(sessionId), {
        ...(signal !== undefined ? { signal } : {}),
        projectionMode: 'all',
      })
    } catch (error) {
      throw this.sessionError(error, sessionId)
    }
    try {
      const selection = observation.projections?.values.modelSelection?.next
        ?? this.ctx.agentDefaultModel.currentSelection()
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
   * The single extraction attempt: one `ctx.llm.stream()` call, drained
   * through `BlockAssembler`, classified by its terminal finish, then parsed
   * strictly. A failed or malformed attempt is never retried here.
   */
  private async extractDraft(
    messages: SourceDiscussionDraft['capturedContext'],
    sessionId: string,
    route: IdeaPreparationModelRoute,
    signal?: AbortSignal,
  ) {
    const prompt = buildIdeaExtractionPrompt(messages)
    const options: GenerateOptions = {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort !== undefined ? { reasoningEffort: ReasoningEffortId(route.reasoningEffort) } : {}),
      messages: [createUserMessage({
        content: [{ type: 'text', text: prompt.user }],
        source: { kind: 'plugin', plugin: 'dsh-idea' },
      })],
      system: prompt.system,
      sessionId: SessionId(sessionId),
      ...(signal !== undefined ? { signal } : {}),
    }

    const assembler = new BlockAssembler()
    try {
      for await (const chunk of this.ctx.llm.stream(options)) {
        signal?.throwIfAborted()
        assembler.push(chunk)
      }
    } catch (error) {
      if (signal?.aborted) {
        throw new IdeaPreparationError('request-cancelled', 'idea preparation was cancelled', { cause: error })
      }
      throw new IdeaPreparationError('model-failed', 'the idea extraction stream failed', { cause: error })
    }
    IdeaPreparationService.checkCancelled(signal)

    this.assertSuccessfulFinish(assembler.finish.kind, assembler.finish, sessionId)
    const blocks = assembler.blocks()
    if (blocks.some(block => block.type === 'tool-call')) {
      throw new IdeaPreparationError('invalid-model-output', 'model produced a tool call instead of a draft')
    }
    const text = blocks
      .filter(block => block.type === 'text')
      .map(block => (block as { text: string }).text)
      .join('')
    return parseIdeaDraftOutput(text)
  }

  /** Map every non-success terminal finish onto the preparation taxonomy. */
  private assertSuccessfulFinish(kind: string, finish: unknown, sessionId: string): void {
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

  /** Translate session-query failures onto the preparation taxonomy. */
  private sessionError(error: unknown, sessionId: string): IdeaPreparationError {
    if (error instanceof IdeaPreparationError) return error
    if (error instanceof SessionQueryError && error.code === SESSION_NOT_FOUND_CODE) {
      return new IdeaPreparationError('source-not-found', `session '${sessionId}' does not exist`, { cause: error })
    }
    return new IdeaPreparationError('source-unavailable', `session '${sessionId}' could not be read`, { cause: error })
  }
}
