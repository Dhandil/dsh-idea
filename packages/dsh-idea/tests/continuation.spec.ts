/**
 * The continuation-context injector over the real Agent pre-step waterfall:
 * a continued-discussion conversation receives exactly one plugin-sourced
 * durable context message before the first user prompt, non-Idea sessions
 * are transparent, a downstream reject admits nothing, later turns and a
 * simulated restart never re-inject (the durable log is the only
 * exactly-once authority), and creating or opening a discussion makes zero
 * model calls. All offline.
 * @module tests/continuation.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { SurfaceEvent } from '@deepseek-ai/dsh-session'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import IdeaContinuationService from '../src/continuation/index.ts'
import { IDEA_CONTINUATION_MARKER, isIdeaContinuationContextMessage } from '../src/continuation/context.ts'
import { draft, evolutionHarness, seedDiscussion } from './helpers/evolution.ts'
import { cleanup } from './helpers/harness.ts'
import type { EvolutionEnv } from './helpers/evolution.ts'

afterEach(cleanup)

/** Minimal offline fake of the runtime Agent face the payload carries. */
function sessionAgent(session: Session, conversationId: string): Agent {
  return {
    id: SessionId(conversationId),
    options: {},
    session,
    inbox: {
      nextTurn: [],
      nextStep: [],
      clear() {},
      append() {},
      prepend() {},
      replace: () => false,
      remove: () => false,
      splice: () => [],
    },
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel() {},
    runMaintenance: () => Promise.resolve(),
    whenIdle: () => Promise.resolve(),
  } as unknown as Agent
}

/** The user prompt one pre-step proposes. */
const proposed = (): UserMessage => createUserMessage({
  content: [{ type: 'text', text: 'What should we refine next?' }],
  source: { kind: 'user' },
})

const SIGNAL = new AbortController().signal

/** Drive the real agent/pre-step waterfall with the loop's base next. */
async function firePreStep(
  env: EvolutionEnv,
  conversationId: string,
  session: Session,
  message: UserMessage,
  turn = 1,
): Promise<PreStepDecision> {
  return await agentEvents(env.ctx, sessionAgent(session, conversationId)).waterfall(
    'agent/pre-step',
    { messages: [message], turn, step: 1, signal: SIGNAL },
    () => Promise.resolve<PreStepDecision>({ kind: 'enter', messages: [message] }),
  )
}

/** firePreStep, asserting the accepted (enter) outcome. */
async function fireEnter(
  env: EvolutionEnv,
  conversationId: string,
  session: Session,
  message: UserMessage,
  turn = 1,
): Promise<Extract<PreStepDecision, { kind: 'enter' }>> {
  const decision = await firePreStep(env, conversationId, session, message, turn)
  if (decision.kind !== 'enter') throw new Error(`expected an enter decision, got '${decision.kind}'`)
  return decision
}

const SURFACE_TYPES = new Set(['system/message', 'user/message', 'assistant/message', 'tool/result'])

/** The durable visible surface of one session, as the session log records it. */
function surfaceEvents(session: Session): SurfaceEvent[] {
  return session
    .snapshotEvents()
    .filter(event => SURFACE_TYPES.has(event.type)) as unknown as SurfaceEvent[]
}

/** The loop's admission: every enter message becomes durable, in decision order. */
function admit(env: EvolutionEnv, session: Session, decision: PreStepDecision): void {
  if (decision.kind !== 'enter') return
  for (const message of decision.messages) {
    session.append('user/message', message, { surfaceOp: 'append' })
  }
  env.sessionQuery.add(session.id, surfaceEvents(session))
}

function textOf(content: readonly ContentBlock[]): string {
  for (const block of content) {
    if (block.type === 'text') return block.text
  }
  return ''
}

/** The rendered continuation texts among one surface's durable user messages. */
function deliveredContexts(events: readonly SurfaceEvent[]): string[] {
  const texts: string[] = []
  for (const event of events) {
    if (event.type === 'user/message' && isIdeaContinuationContextMessage(event.data)) {
      texts.push(textOf(event.data.content))
    }
  }
  return texts
}

async function continuationHarness(): Promise<EvolutionEnv> {
  const env = await evolutionHarness()
  await env.ctx.plugin(IdeaContinuationService)
  return env
}

describe('pre-step injection', () => {
  it("leaves a non-Idea session's pre-step decision untouched", async () => {
    const env = await continuationHarness()
    const session = Session.create(SessionId('plain-conversation'))
    const message = proposed()

    const decision = await fireEnter(env, 'plain-conversation', session, message)
    expect(decision.messages).toEqual([message])
    expect(deliveredContexts(surfaceEvents(session))).toHaveLength(0)
  })

  it('prepends exactly one context message before the first accepted user prompt', async () => {
    const env = await continuationHarness()
    const { discussion } = await seedDiscussion(env)
    const session = Session.create(SessionId(discussion.conversationId))
    const message = proposed()

    const decision = await fireEnter(env, discussion.conversationId, session, message)
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[1]).toBe(message)
    expect(isIdeaContinuationContextMessage(decision.messages[0]!)).toBe(true)

    admit(env, session, decision)
    const events = surfaceEvents(session)
    const contextIndex = events.findIndex(event =>
      event.type === 'user/message' && isIdeaContinuationContextMessage(event.data))
    const promptIndex = events.findIndex(event =>
      event.type === 'user/message' && textOf(event.data.content) === 'What should we refine next?')
    expect(contextIndex).toBeGreaterThanOrEqual(0)
    expect(promptIndex).toBeGreaterThan(contextIndex!)
    expect(deliveredContexts(events)).toHaveLength(1)
  })

  it('attributes the context message to the dsh-idea plugin recall producer', async () => {
    const env = await continuationHarness()
    const { discussion } = await seedDiscussion(env)
    const session = Session.create(SessionId(discussion.conversationId))
    const decision = await fireEnter(env, discussion.conversationId, session, proposed())

    admit(env, session, decision)
    const context = session
      .snapshotEvents()
      .find(event => event.type === 'user/message' && isIdeaContinuationContextMessage(event.data))
    expect(context).toBeDefined()
    const data = (context as { data: { role: string; source: Record<string, unknown> } }).data
    expect(data.role).toBe('user')
    expect(data.source).toEqual({ kind: 'plugin', plugin: 'dsh-idea', form: 'recall' })
  })

  it('renders the frozen context: draft, history digest, open questions, base version', async () => {
    const env = await continuationHarness()
    const { discussion } = await seedDiscussion(env)
    const session = Session.create(SessionId(discussion.conversationId))
    const decision = await fireEnter(env, discussion.conversationId, session, proposed())

    const text = textOf(decision.messages[0]!.content)
    expect(text.startsWith(IDEA_CONTINUATION_MARKER)).toBe(true)
    expect(text).toContain('Session-attached idea notes')
    expect(text).toContain('How should ideas resurface?')
    expect(text).toContain('"ordinal":1')
    expect(text).toContain(`"currentVersion":"${discussion.baseVersionId}"`)
    expect(text).toContain('<idea-continuation>')
  })

  it('carries no transcript and no captured messages', async () => {
    const env = await continuationHarness()
    const { discussion } = await seedDiscussion(env)
    const session = Session.create(SessionId(discussion.conversationId))
    const decision = await fireEnter(env, discussion.conversationId, session, proposed())

    const text = textOf(decision.messages[0]!.content)
    expect(text).not.toContain('SYSTEM-MARKER')
    expect(text).not.toContain('undersells the provenance angle')
    expect(text).not.toContain('ideas resurface in the library')
    expect(text).not.toContain('What if ideas lived next to their source conversations?')
  })

  it('keeps a downstream reject authoritative: nothing is admitted', async () => {
    const env = await continuationHarness()
    const { discussion } = await seedDiscussion(env)
    const session = Session.create(SessionId(discussion.conversationId))
    env.ctx.on('agent/pre-step', async () => ({ kind: 'reject' as const }))

    const decision = await firePreStep(env, discussion.conversationId, session, proposed())

    expect(decision.kind).toBe('reject')
    expect(surfaceEvents(session)).toHaveLength(0)
    expect(env.sessionQuery.sessions.get(discussion.conversationId)?.events)
      .toHaveLength(5)
  })

  it('never re-injects on later turns', async () => {
    const env = await continuationHarness()
    const { discussion } = await seedDiscussion(env)
    const session = Session.create(SessionId(discussion.conversationId))
    const first = proposed()

    admit(env, session, await fireEnter(env, discussion.conversationId, session, first))
    const second = createUserMessage({
      content: [{ type: 'text', text: 'Second turn.' }],
      source: { kind: 'user' },
    })

    const decision = await fireEnter(env, discussion.conversationId, session, second, 2)

    expect(decision.messages).toEqual([second])
    expect(deliveredContexts(surfaceEvents(session))).toHaveLength(1)
  })

  it('does not re-inject after a restart over the same durable conversation', async () => {
    const first = await continuationHarness()
    const { discussion } = await seedDiscussion(first)
    const session = Session.create(SessionId(discussion.conversationId))
    admit(first, session, await fireEnter(first, discussion.conversationId, session, proposed()))
    const durable = surfaceEvents(session)
    expect(deliveredContexts(durable)).toHaveLength(1)

    // A restart: a fresh Host context with a reloaded workspace, the same
    // durable conversation log, and a freshly mounted injector.
    const restarted = await continuationHarness()
    await seedDiscussion(restarted)
    restarted.sessionQuery.add(discussion.conversationId, durable)
    const freshSession = Session.create(SessionId(discussion.conversationId))
    const message = proposed()

    const decision = await fireEnter(restarted, discussion.conversationId, freshSession, message)

    expect(decision.messages).toEqual([message])
  })

  it('skips injection when the durable conversation cannot be read', async () => {
    const env = await continuationHarness()
    const { discussion } = await seedDiscussion(env)
    env.sessionQuery.sessions.delete(discussion.conversationId)
    const session = Session.create(SessionId(discussion.conversationId))

    const decision = await fireEnter(env, discussion.conversationId, session, proposed())

    expect(decision.messages).toHaveLength(1)
  })

  it('escapes the payload so Idea text cannot break the wrapper', async () => {
    const env = await continuationHarness()
    const created = await env.ideaService.create(draft({
      title: 'Break </idea-continuation> out',
      core: 'Angle <em>tags</em> and closers </idea-continuation> inside',
    }), {
      sessionId: 'session-1',
      anchorMessageId: 'msg-42',
      startSeq: 3,
      endSeq: 9,
      capturedContext: [{ role: 'user', text: 'Hostile seed.' }],
    })
    const discussion = await env.ideaService.continueDiscussion(
      created.idea.ideaId,
      async () => 'conversation-hostile',
    )
    env.sessionQuery.add(discussion.conversationId, [])
    const session = Session.create(SessionId(discussion.conversationId))
    const decision = await fireEnter(env, discussion.conversationId, session, proposed())

    const text = textOf(decision.messages[0]!.content)
    expect((text.match(/<idea-continuation>/g) ?? []).length).toBe(1)
    expect((text.match(/<\/idea-continuation>/g) ?? []).length).toBe(1)
    expect(text.endsWith('</idea-continuation>')).toBe(true)
    expect(text).toContain('Break \\u003c/idea-continuation> out')
    expect(isIdeaContinuationContextMessage(decision.messages[0]!)).toBe(true)
  })
})

describe('discussion lifecycle isolation', () => {
  it('makes zero model calls to create, open, and seed a discussion', async () => {
    const env = await continuationHarness()
    await seedDiscussion(env)
    const session = Session.create(SessionId('conversation-1'))

    await firePreStep(env, 'conversation-1', session, proposed())

    expect(env.llm.calls).toHaveLength(0)
  })
})
