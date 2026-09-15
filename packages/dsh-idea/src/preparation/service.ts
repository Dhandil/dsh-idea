/**
 * The Save Idea preparation service (`ctx.ideaPreparations`). One call is one
 * bounded proposal: read the Session surface, capture the visible discussion
 * behind the requested assistant anchor, resolve the current model route
 * (projection first, host default as fallback), make exactly one direct
 * `ctx.llm.stream()` call — no Agent Loop, no tools, no hidden retry — parse
 * the response strictly against the T1 `IdeaDraft`, and register the
 * canonical captured source in the ephemeral registry. Preparation itself
 * never writes durable Idea state; `IdeaService` stays the only writer.
 * The route/drain plumbing is shared with the Evolution preparation.
 * @module @dsh-external/dsh-idea/src/preparation/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { captureDiscussionFromSurface } from './context.ts'
import { parseIdeaDraftOutput } from './parser.ts'
import { buildIdeaExtractionPrompt } from './prompt.ts'
import { checkCancelled, extractModelText, readSessionSurface, resolveModelRoute } from './pipeline.ts'
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

export class IdeaPreparationService extends Service {
  static inject = ['sessionQuery', 'agentDefaultModel', 'llm']

  /** Host-only ephemeral registry; a later commit task resolves through it. */
  readonly preparations: IdeaPreparationRegistry

  constructor(ctx: Context) {
    super(ctx, 'ideaPreparations')
    this.preparations = new IdeaPreparationRegistry()
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
    checkCancelled(signal)

    const surface = await readSessionSurface(this.ctx.sessionQuery, sessionId)
    checkCancelled(signal)

    const captured = captureDiscussionFromSurface(surface.events, anchorMessageId)

    const route = await resolveModelRoute(this.ctx.sessionQuery, this.ctx.agentDefaultModel, sessionId, signal)
    checkCancelled(signal)

    const draft = await this.extractDraft(captured.messages, sessionId, route, signal)

    checkCancelled(signal)
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

  /**
   * The single extraction attempt: one `ctx.llm.stream()` call drained by the
   * shared pipeline, then parsed strictly against the T1 `IdeaDraft`.
   */
  private async extractDraft(
    messages: SourceDiscussionDraft['capturedContext'],
    sessionId: string,
    route: IdeaPreparationModelRoute,
    signal?: AbortSignal,
  ): Promise<IdeaPreparationPreview['draft']> {
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
    return parseIdeaDraftOutput(await extractModelText(this.ctx.llm, options, sessionId, signal))
  }
}
