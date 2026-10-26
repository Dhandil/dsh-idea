/** Explicit library target + one bounded conversation → one Host-owned update. */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionSurfaceSnapshot } from '@deepseek-ai/dsh-session-query'
import { z } from 'zod'
import { IDEA_LIMITS, ideaDraftSchema } from '../schema.ts'
import { IdeaError } from '../errors.ts'
import { IdeaId, IdeaVersionId } from '../types.ts'
import { buildIdeaEvolutionPrompt } from '../evolution/prompt.ts'
import { captureDiscussionFromSurface, normalizeCapturedText, visibleText } from './context.ts'
import { parseIdeaDraftOutput } from './parser.ts'
import { IdeaPreparationError } from './errors.ts'
import { checkCancelled, extractModelText, readSessionSurface, resolveModelRoute } from './pipeline.ts'
import { IdeaUpdateRegistry } from './update-registry.ts'
import { IdeaUpdateError } from './update-types.ts'
import type { IdeaPrepareUpdateRequest, IdeaUpdateId, IdeaUpdatePreview, IdeaUpdateResult, PreparedUpdate } from './update-types.ts'
import { IdeaPerfMetrics } from '../perf/metrics.ts'

const id = z.string().min(1).max(IDEA_LIMITS.idMax).refine(value => value.trim() === value)
const requestSchema = z.strictObject({ requestKey: id, sessionId: id, messageId: id, ideaId: id, expectedCurrentVersionId: id })

/** One public surface is the only content authority; no raw/recall ownership inference. */
export function captureUpdateSource(surface: SessionSurfaceSnapshot, sessionId: string, messageId: string) {
  const anchors = surface.events.filter(event => event.type === 'assistant/message' && event.data.message.id === messageId)
  if (surface.session.id !== sessionId || anchors.length !== 1) throw new IdeaPreparationError('source-not-found', 'the update anchor is absent or ambiguous')
  const anchor = anchors[0]!
  if (!Number.isSafeInteger(surface.inheritedEventCount) || surface.inheritedEventCount < 0
    || !Number.isSafeInteger(anchor.seq) || anchor.seq < 0
    || anchor.type !== 'assistant/message' || anchor.seq < surface.inheritedEventCount
    || !normalizeCapturedText(visibleText(anchor.data.message.content))) {
    throw new IdeaPreparationError('source-unavailable', 'the update anchor has no local finalized text')
  }
  const prefix = surface.events.slice(0, surface.events.indexOf(anchor) + 1)
  if (prefix.some(event => event.seq > anchor.seq)) throw new IdeaPreparationError('source-unavailable', 'the source changed after the requested anchor')
  const captured = captureDiscussionFromSurface(surface.events, messageId)
  const start = prefix.findIndex(event => event.seq === captured.startSeq)
  const texts = (events: typeof prefix) => events.flatMap(event => {
    const content = event.type === 'assistant/message' ? event.data.message.content
      : event.type === 'user/message' && event.data.source.kind === 'user' ? event.data.content : undefined
    const text = content ? normalizeCapturedText(visibleText(content)) : ''
    return text ? [text] : []
  })
  const original = texts(prefix.slice(start))
  if (start < 0 || original.length !== captured.messages.length) throw new IdeaPreparationError('source-unavailable', 'the bounded source cannot be verified')
  return { captured, truncated: texts(prefix).length > captured.messages.length
    || captured.messages.some((message, index) => message.text !== original[index]) }
}

export class IdeaUpdatePipeline {
  /** Separate aggregates keep update and new-Idea samples distinguishable. */
  readonly performance: IdeaPerfMetrics = new IdeaPerfMetrics()
  private readonly lifetime = new AbortController()
  constructor(private readonly ctx: Context, readonly registry = new IdeaUpdateRegistry()) {
    ctx.effect(() => () => { this.lifetime.abort(); this.registry.dispose() })
  }

  async prepare(request: IdeaPrepareUpdateRequest, signal?: AbortSignal): Promise<IdeaUpdatePreview> {
    const totalStartedAt = performance.now()
    try {
      const parsed = requestSchema.safeParse(request)
      if (!parsed.success) throw new IdeaUpdateError('invalid-update-request', 'the update request binding is invalid')
      const input = parsed.data
      const abort = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal
      checkCancelled(abort)
      return await this.registry.prepare(input, async () => {
        checkCancelled(abort)
        const { target, currentDraft } = this.current(input)
        const readStartedAt = performance.now()
        let surface: SessionSurfaceSnapshot
        try { surface = structuredClone(await readSessionSurface(this.ctx.sessionQuery, input.sessionId)) }
        finally { this.performance.record('host.session-read', readStartedAt) }
        checkCancelled(abort)
        const captureStartedAt = performance.now()
        const { captured, truncated } = captureUpdateSource(surface, input.sessionId, input.messageId)
        this.performance.record('host.capture', captureStartedAt)
        const routeStartedAt = performance.now()
        let route: Awaited<ReturnType<typeof resolveModelRoute>>
        try { route = await resolveModelRoute(this.ctx.sessionQuery, this.ctx.agentDefaultModel, input.sessionId, abort) }
        finally { this.performance.record('host.route', routeStartedAt) }
        checkCancelled(abort)
        const promptStartedAt = performance.now()
        const prompt = buildIdeaEvolutionPrompt({ currentDraft, historySummary: [], openQuestions: currentDraft.openQuestions, messages: captured.messages })
        this.performance.record('host.prompt', promptStartedAt)
        const modelStartedAt = performance.now()
        const text = await extractModelText(this.ctx.llm, {
          provider: route.provider, model: route.model,
          ...(route.reasoningEffort !== undefined ? { reasoningEffort: ReasoningEffortId(route.reasoningEffort) } : {}),
          system: prompt.system,
          messages: [createUserMessage({ content: [{ type: 'text', text: prompt.user }], source: { kind: 'dsh-idea' } })],
          sessionId: SessionId(input.sessionId), signal: abort,
        }, input.sessionId, abort, {
          onFirstResponse: () => { this.performance.record('host.model-first-response', modelStartedAt) },
          onFirstText: () => { this.performance.record('host.model-first-text', modelStartedAt) },
          onComplete: () => { this.performance.record('host.model-complete', modelStartedAt) },
        })
        const parseStartedAt = performance.now()
        let draft: ReturnType<typeof parseIdeaDraftOutput>
        try { draft = parseIdeaDraftOutput(text) }
        finally { this.performance.record('host.parse', parseStartedAt) }
        checkCancelled(abort)
        this.current(input) // no stale preview or silent rebase after the single call
        return {
          target, currentDraft, draft,
          source: { sessionId: input.sessionId, anchorMessageId: captured.anchorMessageId, startSeq: captured.startSeq, endSeq: captured.endSeq, capturedContext: captured.messages },
          sourceStats: { sessionId: input.sessionId, anchorMessageId: captured.anchorMessageId, startSeq: captured.startSeq, endSeq: captured.endSeq,
            messageCount: captured.messages.length, characterCount: captured.characterCount, truncated },
        }
      }, abort)
    } finally { this.performance.record('host.prepare-total', totalStartedAt) }
  }

  async commit(updateId: IdeaUpdateId, draft: unknown, signal?: AbortSignal): Promise<IdeaUpdateResult> {
    checkCancelled(signal); checkCancelled(this.lifetime.signal)
    const parsed = ideaDraftSchema.safeParse(draft)
    if (!parsed.success) throw new IdeaError('invalid-input', 'the approved update draft is invalid')
    return this.registry.commit(updateId, JSON.stringify(parsed.data), async entry => {
      checkCancelled(signal); checkCancelled(this.lifetime.signal)
      const aggregate = await this.ctx.ideaService.evolve(entry.target.ideaId, parsed.data, entry.source,
        entry.target.currentVersionId, 'continued-discussion', { skipUnchanged: true })
      const version = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
      if (!version) throw Error('update returned no current content')
      return { ideaId: aggregate.idea.ideaId, currentVersionId: aggregate.idea.currentVersionId,
        title: version.draft.title, status: aggregate.idea.status, updated: aggregate.idea.currentVersionId !== entry.target.currentVersionId }
    }, error => error instanceof IdeaError && ['version-conflict', 'archived', 'deleting', 'idea-not-found', 'invalid-input'].includes(error.code)
      || error instanceof IdeaPreparationError && error.code === 'request-cancelled')
  }

  private current(input: IdeaPrepareUpdateRequest): Pick<PreparedUpdate, 'target' | 'currentDraft'> {
    const startedAt = performance.now()
    try {
      const aggregate = this.ctx.ideaService.get(IdeaId(input.ideaId))
      if (aggregate.idea.currentVersionId !== input.expectedCurrentVersionId) throw new IdeaError('version-conflict', 'the selected idea content changed')
      if (aggregate.idea.status === 'archived') throw new IdeaError('archived', 'restore the idea before preparing an update')
      const version = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
      if (!version) throw new IdeaError('invalid-input', 'the current idea content is unavailable')
      return { target: { ideaId: aggregate.idea.ideaId, currentVersionId: IdeaVersionId(version.versionId),
        title: version.draft.title, status: aggregate.idea.status }, currentDraft: version.draft }
    } finally { this.performance.record('host.target-read', startedAt) }
  }
}
