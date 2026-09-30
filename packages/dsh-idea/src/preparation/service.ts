/**
 * The Save Idea preparation service (`ctx.ideaPreparations`). One call is one
 * bounded proposal: read the Session surface, capture the visible discussion
 * behind the requested assistant anchor, resolve the current model route
 * (projection first, host default as fallback), make exactly one direct
 * `ctx.llm.stream()` call — no Agent Loop, no tools, no hidden retry — parse
 * the response strictly against the T1 `IdeaDraft`, and register the
 * canonical captured source in the ephemeral registry. Preparation itself
 * never writes durable Idea state; `IdeaService` stays the only writer.
 * The route/drain plumbing is shared with the Evolution preparation and,
 * since T12, with the Quick Capture preparation: `prepareQuickCapture`
 * registers the same registry either a zero-model deterministic proposal
 * (direct save) or a one-call AI organization of the user's own note
 * (never a captured discussion, never a privileged model turn).
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
import { buildIdeaExtractionPrompt, buildQuickCapturePrompt } from './prompt.ts'
import { checkCancelled, extractModelText, readSessionSurface, resolveModelRoute } from './pipeline.ts'
import { IdeaPreparationError } from './errors.ts'
import { IdeaPreparationRegistry } from './registry.ts'
import type {
  IdeaPreparationModelRoute,
  IdeaPreparationPreview,
  PreparedIdeaOrigin,
  PreparedIdeaSource,
  QuickCapturePreview,
} from './types.ts'
import { ideaDraftSchema } from '../schema.ts'
import type { IdeaDraft, SourceDiscussionDraft } from '../types.ts'

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
    // The chat-extraction flow keeps its own stricter check (T12 D1): the
    // schema allows an empty motivation for quick-capture drafts, but a
    // proposal distilled from a discussion must state why it is worth keeping.
    if (draft.motivation.trim().length === 0) {
      throw new IdeaPreparationError('invalid-model-output', 'model proposal carries no motivation')
    }

    checkCancelled(signal)
    const preparedSource: SourceDiscussionDraft = {
      sessionId,
      anchorMessageId,
      startSeq: captured.startSeq,
      endSeq: captured.endSeq,
      capturedContext: captured.messages,
    }
    const entry: PreparedIdeaSource = {
      origin: { kind: 'conversation', source: preparedSource, model: route },
      createdAt: Date.now(),
    }
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

  /**
   * Turn the user's own quick-capture note into an editable Idea draft
   * proposal (T12). `direct` is fully deterministic — title from the first
   * non-empty line, the complete original text as `core`, an empty
   * motivation — and makes no model call at all. `ai` resolves the calling
   * conversation's model route and makes exactly one direct `ctx.llm.stream()`
   * call framing the note as data; the strict parser applies unchanged and an
   * empty `motivation` stays legal here (D1). Both modes register the same
   * registry as {@link prepareFromMessage} — one opaque preparation id, one
   * commit through the shared idempotent commit machine — and never record a
   * source discussion: the note is the user's own text, not a captured
   * conversation.
   * @param sessionId - The conversation the capture was written in (the AI
   * route's calling context; never persisted as provenance).
   * @param text - The user's raw note.
   * @param mode - `direct` (zero model calls) or `ai` (exactly one call).
   * @param signal - Optional caller cancellation; checked at every stage.
   * @returns the preview proposal carrying the prepared draft.
   * @throws `IdeaPreparationError` with a stable {@link IdeaPreparationErrorCode}.
   */
  async prepareQuickCapture(
    sessionId: string,
    text: string,
    mode: 'direct' | 'ai',
    signal?: AbortSignal,
  ): Promise<QuickCapturePreview> {
    checkCancelled(signal)
    const normalized = text.trim()
    if (normalized.length === 0) {
      throw new IdeaPreparationError('invalid-quick-capture-input', 'the quick-capture note is empty')
    }

    if (mode === 'direct') {
      return this.registerQuickCapture(this.directQuickCaptureDraft(normalized), undefined)
    }

    const route = await resolveModelRoute(this.ctx.sessionQuery, this.ctx.agentDefaultModel, sessionId, signal)
    checkCancelled(signal)
    const draft = await this.organizeQuickCapture(normalized, sessionId, route, signal)
    return this.registerQuickCapture(draft, route)
  }

  /** The deterministic direct-save draft: verbatim core, derived title. */
  private directQuickCaptureDraft(normalized: string): IdeaDraft {
    // Deterministic title: the first non-empty line, capped to the title
    // bound; the complete note rides `core` verbatim. Normalization and
    // bounding run through the same schema the commit will validate — an
    // over-long note or title is rejected here, before any registry entry.
    const firstLine = normalized.split('\n').find(line => line.trim().length > 0) ?? normalized
    const result = ideaDraftSchema.safeParse({
      title: firstLine,
      core: normalized,
      motivation: '',
      currentConclusion: '',
      possibleValue: '',
      useWhen: [],
      openQuestions: [],
    })
    if (!result.success) {
      throw new IdeaPreparationError('invalid-quick-capture-input', 'the quick-capture note does not fit the Idea bounds', { cause: result.error })
    }
    return result.data
  }

  /** The one AI-organize call over the user's note; strict parsing. */
  private async organizeQuickCapture(
    normalized: string,
    sessionId: string,
    route: IdeaPreparationModelRoute,
    signal?: AbortSignal,
  ): Promise<IdeaDraft> {
    const prompt = buildQuickCapturePrompt(normalized)
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

  /** Validate the organized draft and mint its preparation id. */
  private registerQuickCapture(draft: IdeaDraft, model: IdeaPreparationModelRoute | undefined): QuickCapturePreview {
    const entry: PreparedIdeaSource = {
      origin: { kind: 'quick-capture', model } satisfies PreparedIdeaOrigin,
      createdAt: Date.now(),
    }
    const preparationId = this.preparations.register(entry)
    return { preparationId, draft }
  }
}
