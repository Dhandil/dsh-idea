/** Actual Harness Agent Loop, durable JSONL and in-memory adapter; no network/Profile. */
import { join } from 'node:path'
import LlmRuntime, { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { IdeaReferenceService } from '../../src/reference/service.ts'
import { harness } from './harness.ts'
import { direct } from './reference-guidance.ts'

export function textResponse(text = 'offline answer'): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

export function toolResponse(id: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(id), name: 'offline_echo', arguments: '{"text":"synthetic"}' } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

export const failureResponse = (): StreamChunk[] => [{ type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: 'controlled failure' } } }]

export class OfflineAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly script: (request: GenerateOptions, index: number) => StreamChunk[]) { super() }
  override async *stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(request)
    yield* this.script(request, this.requests.length - 1)
  }
}

export async function referenceLoop(adapter: OfflineAdapter, options: { root?: string; sessionDirectory?: string } = {}) {
  const base = await harness(options.root)
  const { ctx } = base
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false })
  ctx.systemPrompt.section({ name: 'offline:persona', order: 0, complete: true, text: 'Offline persona: retain all normal tool and permission decisions.' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlPersistence, { root: join(base.root, options.sessionDirectory ?? 'loop-sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['offline'], adapter)
  await ctx.plugin(IdeaReferenceService)
  const executions: string[] = []
  ctx.tools.register(defineContentToolFixture({
    name: 'offline_echo', description: 'Deterministic local test tool, no file/network access',
    parameters: { text: { type: 'string' } },
    async execute(args) { executions.push(args.text as string); return [{ type: 'text', text: 'controlled result' }] },
  }))
  return {
    ...base, adapter, executions,
    create: (id: string) => ctx.agentLoop.create(SessionId(id), { provider: 'offline', model: 'fixture' }),
  }
}

export async function send(agent: Agent, text: string): Promise<void> {
  agent.followup(direct(text))
  await agent.whenIdle()
}

/** Replay an actual flushed event prefix into an isolated disk generation, like restart after power loss. */
export async function seedPrefix(env: Awaited<ReturnType<typeof referenceLoop>>, header: SessionHeader, events: readonly SessionEvent[]) {
  const handle = await env.ctx.sessionPersistence.create(header)
  try { await handle.append(events) } finally { await handle.close() }
}
