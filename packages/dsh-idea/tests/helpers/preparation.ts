/**
 * Offline fakes for the preparation pipeline: scripted surface snapshots,
 * model-selection providers, and LLM streams. Nothing here touches the
 * network or a real provider — every stream is a scripted async iterable and
 * every stream call is recorded for assertions.
 * @module tests/helpers/preparation
 */

import { Context } from '@deepseek-ai/cordis'
import type { FinishReason, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SurfaceEvent } from '@deepseek-ai/dsh-session'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import IdeaPreparationService from '../../src/preparation/index.ts'
import type { IdeaService } from '../../src/index.ts'
import { harness } from './harness.ts'

export type { SurfaceEvent }

type SessionQueryFace = Context['sessionQuery']
type AgentDefaultModelFace = Context['agentDefaultModel']
type LlmFace = Context['llm']

let seqCounter = 100

/** One human-authored `user/message` surface event. */
export const userEvent = (id: string, text: string, seq: number = ++seqCounter, sourceKind = 'user'): SurfaceEvent =>
  ({
    type: 'user/message',
    seq,
    time: 0,
    data: {
      id,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: sourceKind },
    },
  }) as unknown as SurfaceEvent

/** One `assistant/message` surface event. */
export const assistantEvent = (id: string, text: string, seq: number = ++seqCounter, extra: Record<string, unknown> = {}): SurfaceEvent =>
  ({
    type: 'assistant/message',
    seq,
    time: 0,
    data: {
      turn: 0,
      step: 0,
      message: { id, role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model' } },
      stream: [],
      ...extra,
    },
  }) as unknown as SurfaceEvent

/** One `system/message` surface event (never capturable). */
export const systemEvent = (text = 'system prompt', seq: number = ++seqCounter): SurfaceEvent =>
  ({
    type: 'system/message',
    seq,
    time: 0,
    data: {
      turn: 0,
      step: 0,
      message: { role: 'system', content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'test' } },
    },
  }) as unknown as SurfaceEvent

/** One `tool/result` surface event (never capturable). */
export const toolResultEvent = (text = '{"ok":true}', seq: number = ++seqCounter): SurfaceEvent =>
  ({
    type: 'tool/result',
    seq,
    time: 0,
    data: {
      turn: 0,
      step: 0,
      message: { role: 'tool', content: [{ type: 'text', text }], source: { kind: 'tool', tool: 'test' } },
    },
  }) as unknown as SurfaceEvent

/** Scripted, host-owned model-selection source. */
export class FakeAgentDefaultModel {
  selection: { provider: string; model: string; reasoningEffort?: string } = {
    provider: 'default-provider',
    model: 'default-model',
  }

  currentSelection(): { provider: string; model: string; reasoningEffort?: string } {
    return this.selection
  }
}

interface FakeProjection {
  lastUsed: null
  next: { provider: string; model: string; reasoningEffort?: string } | null
}

/** Scripted session-query engine over in-memory surface snapshots. */
export class FakeSessionQuery {
  readonly sessions = new Map<string, { events?: SurfaceEvent[]; projections?: { asOfSeq: number; values: { modelSelection?: FakeProjection } } }>()

  add(id: string, events: SurfaceEvent[]): void {
    this.sessions.set(id, { events })
  }

  addProjection(id: string, next: { provider: string; model: string; reasoningEffort?: string } | null): void {
    const session = this.sessions.get(id) ?? {}
    session.projections = { asOfSeq: 0, values: { modelSelection: { lastUsed: null, next } } }
    this.sessions.set(id, session)
  }

  async readSurface(sessionId: string): Promise<unknown> {
    const session = this.sessions.get(sessionId)
    if (session?.events === undefined) {
      throw new SessionQueryError(`session "${sessionId}" not found`, 'SESSION_QUERY_SESSION_NOT_FOUND')
    }
    return {
      session: { id: sessionId },
      inheritedEventCount: 0,
      capturedThroughSeq: session.events.at(-1)?.seq ?? null,
      events: session.events,
    }
  }

  async observeSession(sessionId: string, options: { signal?: AbortSignal; projectionMode?: string }): Promise<unknown> {
    options.signal?.throwIfAborted()
    const session = this.sessions.get(sessionId)
    if (session === undefined) {
      throw new SessionQueryError(`session "${sessionId}" not found`, 'SESSION_QUERY_SESSION_NOT_FOUND')
    }
    return {
      source: 'live',
      header: { id: sessionId },
      projections: session.projections,
      [Symbol.dispose]() {
        // observed lease released
      },
    }
  }
}

/** One scripted chunk batch shaped like an adapter stream. */
export const textStream = (text: string, reason: FinishReason = { kind: 'stop' }): StreamChunk[] =>
  [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason },
  ] as unknown as StreamChunk[]

/** Scripted tool-call output under a stop finish (invalid for extraction). */
export const toolCallStream = (): StreamChunk[] =>
  [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: 'call_1', name: 'save_idea', argumentsDelta: '{}' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'call_1', name: 'save_idea', arguments: '{}' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] as unknown as StreamChunk[]

/** Scripted LLM runtime: records every call, replays queued streams. */
export class FakeLlm {
  readonly calls: GenerateOptions[] = []
  private readonly queue: Array<() => AsyncIterable<StreamChunk>> = []

  enqueueChunks(chunks: StreamChunk[]): void {
    this.queue.push(() => (async function* () {
      for (const chunk of chunks) yield chunk
    })())
  }

  enqueueFailure(error: unknown): void {
    this.queue.push(() => (async function* () {
      throw error
    })())
  }

  /** Yields `before`, aborts the controller, then yields `after`. */
  enqueueAbort(controller: AbortController, before: StreamChunk, after: StreamChunk): void {
    this.queue.push(() => (async function* () {
      yield before
      controller.abort()
      yield after
    })())
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls.push(options)
    const script = this.queue.shift()
    if (script === undefined) {
      throw new Error('FakeLlm: no scripted stream for this call')
    }
    yield* script()
  }
}

/**
 * Full offline preparation harness: the real storage stack plus IdeaService
 * (so durable side effects are observable), with the three preparation seams
 * provided as scripted fakes.
 */
export async function preparationHarness(fakes: {
  sessionQuery: FakeSessionQuery
  agentDefaultModel: FakeAgentDefaultModel
  llm: FakeLlm
}): Promise<{
  ctx: Context
  root: string
  service: IdeaPreparationService
  ideaService: IdeaService
}> {
  const base = await harness()
  base.ctx.provide('sessionQuery', fakes.sessionQuery as unknown as SessionQueryFace)
  base.ctx.provide('agentDefaultModel', fakes.agentDefaultModel as unknown as AgentDefaultModelFace)
  base.ctx.provide('llm', fakes.llm as unknown as LlmFace)
  await base.ctx.plugin(IdeaPreparationService)
  return {
    ctx: base.ctx,
    root: base.root,
    service: base.ctx.ideaPreparations,
    ideaService: base.ctx.ideaService,
  }
}
