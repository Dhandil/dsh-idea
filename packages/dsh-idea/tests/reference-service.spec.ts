/**
 * The Host-side reference resolver over the real Agent pre-step waterfall:
 * only direct user messages (`source.kind === 'user'`) are parsed, the
 * pinned exact version is projected (never the current one), the mention is
 * rewritten to the readable `Idea「title」` form, exactly one plugin-sourced
 * recall context lands after the last direct message, malformed or deleted
 * references reject the request loudly, a downstream reject admits nothing,
 * and the whole path makes zero model calls. All offline.
 * @module tests/reference-service.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message, UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { IdeaReferenceService, formatIdeaReferenceMention } from '../src/reference/index.ts'
import type { IdeaReferencePin } from '../src/reference/index.ts'
import { draft, evolutionHarness } from './helpers/evolution.ts'
import { cleanup } from './helpers/harness.ts'
import type { EvolutionEnv } from './helpers/evolution.ts'
import type { IdeaVersionId } from '../src/types.ts'

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

const SIGNAL = new AbortController().signal

/** Drive the real agent/pre-step waterfall with the loop's base next. */
async function firePreStep(env: EvolutionEnv, messages: UserMessage[]): Promise<PreStepDecision> {
  const session = Session.create(SessionId('conversation-1'))
  return await agentEvents(env.ctx, sessionAgent(session, 'conversation-1')).waterfall(
    'agent/pre-step',
    { messages, turn: 1, step: 1, signal: SIGNAL },
    () => Promise.resolve<PreStepDecision>({ kind: 'enter', messages }),
  )
}

function textOf(content: readonly ContentBlock[]): string {
  for (const block of content) {
    if (block.type === 'text') return block.text
  }
  return ''
}

const directUser = (text: string): UserMessage => createUserMessage({
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
})

const isRecallContext = (message: Message): boolean => {
  const source = message.source as { kind?: string; plugin?: string; form?: string }
  return message.role === 'user'
    && source.kind === 'plugin'
    && source.plugin === 'dsh-idea'
    && source.form === 'recall'
    && textOf(message.content).startsWith('## Referenced Ideas')
}

/** The JSON payload inside the recall context's referenced-ideas wrapper. */
function payloadOf(decision: Extract<PreStepDecision, { kind: 'enter' }>): unknown {
  const context = decision.messages.find(isRecallContext)
  if (context === undefined) throw new Error('expected one recall context message')
  const text = textOf(context.content)
  const inner = text.slice(
    text.indexOf('<referenced-ideas>') + '<referenced-ideas>'.length,
    text.indexOf('</referenced-ideas>'),
  )
  return JSON.parse(inner) as unknown
}

async function referenceHarness(): Promise<EvolutionEnv> {
  const env = await evolutionHarness()
  await env.ctx.plugin(IdeaReferenceService)
  return env
}

/** One created Idea plus the mention that pins its first version. */
async function seedIdea(env: EvolutionEnv, title: string, core = `Core of ${title}`): Promise<{
  ideaId: string
  versionId: IdeaVersionId
  mention: string
}> {
  const created = await env.ideaService.create(draft({ title, core }), {
    sessionId: 'session-1',
    anchorMessageId: 'msg-42',
    startSeq: 3,
    endSeq: 9,
    capturedContext: [{ role: 'user', text: `Seed ${title}.` }],
  })
  const versionId = created.idea.currentVersionId
  const pin: IdeaReferencePin = { ideaId: created.idea.ideaId, versionId }
  return { ideaId: created.idea.ideaId, versionId, mention: formatIdeaReferenceMention(pin, title) }
}

describe('mention rewrite and recall context', () => {
  it('rewrites the mention in the direct message and appends exactly one recall context after it', async () => {
    const env = await referenceHarness()
    const { mention } = await seedIdea(env, 'Provenance snapshots')

    const prompt = directUser(`Look at ${mention} before answering.`)
    const decision = await firePreStep(env, [prompt])

    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)
    expect(decision.messages).toHaveLength(2)
    expect(textOf(decision.messages[0]!.content)).toBe('Look at Idea「Provenance snapshots」 before answering.')
    expect(isRecallContext(decision.messages[1]!)).toBe(true)
    expect(decision.messages[0]!.source).toEqual({ kind: 'user' })
  })

  it('rewrites with the resolved Host title, never a stale client label', async () => {
    const env = await referenceHarness()
    const { ideaId, versionId } = await seedIdea(env, 'Real title')
    const staleMention = formatIdeaReferenceMention({ ideaId, versionId }, 'Stale label')

    const decision = await firePreStep(env, [directUser(`See ${staleMention}`)])

    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)
    expect(textOf(decision.messages[0]!.content)).toContain('Idea「Real title」')
    expect(textOf(decision.messages[0]!.content)).not.toContain('Stale label')
  })

  it('projects the exact pinned version fields, never a latest-version substitution', async () => {
    const env = await referenceHarness()
    const created = await env.ideaService.create(draft({
      title: 'Versioned idea',
      core: 'v1 core',
      currentConclusion: 'v1 conclusion',
    }), {
      sessionId: 'session-1',
      anchorMessageId: 'msg-42',
      startSeq: 3,
      endSeq: 9,
      capturedContext: [{ role: 'user', text: 'Seed.' }],
    })
    const v1 = created.idea.currentVersionId
    const v2Aggregate = await env.ideaService.manualEdit(created.idea.ideaId, draft({
      title: 'Versioned idea',
      core: 'v2 core',
      currentConclusion: 'v2 conclusion',
    }), v1)
    expect(v2Aggregate.idea.currentVersionId).not.toBe(v1)

    const mention = formatIdeaReferenceMention({ ideaId: created.idea.ideaId, versionId: v1 }, 'Versioned idea')
    const decision = await firePreStep(env, [directUser(`Recall ${mention}`)])
    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)

    const payload = payloadOf(decision) as Array<{ ideaId: string; versionId: string; currentConclusion: string }>
    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({
      ideaId: created.idea.ideaId,
      versionId: v1,
      title: 'Versioned idea',
      core: 'v1 core',
      currentConclusion: 'v1 conclusion',
    })
    expect(JSON.stringify(payload)).not.toContain('v2 conclusion')
  })

  it('inserts the context after the last direct message, leaving other messages in place', async () => {
    const env = await referenceHarness()
    const { mention } = await seedIdea(env, 'Adjacency')
    const pluginMessage = createUserMessage({
      content: [{ type: 'text', text: 'A prior plugin note without mentions.' }],
      source: { kind: 'plugin', plugin: 'other' },
    })
    const first = directUser(`First ${mention}`)
    const second = directUser('Second, no reference.')

    const decision = await firePreStep(env, [first, pluginMessage, second])
    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)

    expect(decision.messages).toHaveLength(4)
    expect(decision.messages[0]).not.toBe(first)
    expect(textOf(decision.messages[0]!.content)).toContain('Idea「Adjacency」')
    expect(decision.messages[1]).toBe(pluginMessage)
    expect(decision.messages[2]).toBe(second)
    expect(isRecallContext(decision.messages[3]!)).toBe(true)
  })

  it('dedupes repeated pins into one projection', async () => {
    const env = await referenceHarness()
    const { mention } = await seedIdea(env, 'Repeated')
    const decision = await firePreStep(env, [directUser(`${mention} and again ${mention}`)])
    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)
    expect((payloadOf(decision) as unknown[])).toHaveLength(1)
    expect(textOf(decision.messages[0]!.content)).not.toContain(mention)
  })

  it('rewrites every occurrence of one pin when the labels differ', async () => {
    const env = await referenceHarness()
    const { ideaId, versionId } = await seedIdea(env, 'Host title')
    const labelA = formatIdeaReferenceMention({ ideaId, versionId }, 'Label A')
    const labelB = formatIdeaReferenceMention({ ideaId, versionId }, 'Label B')

    const decision = await firePreStep(env, [directUser(`${labelA} plus ${labelB}`)])
    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)

    expect((payloadOf(decision) as unknown[])).toHaveLength(1)
    const rewritten = textOf(decision.messages[0]!.content)
    expect(rewritten.split('Idea「Host title」')).toHaveLength(3)
    expect(rewritten).not.toContain('Label A')
    expect(rewritten).not.toContain('Label B')
    expect(rewritten).not.toContain('dsh-idea:')
  })
})

describe('scope discipline', () => {
  it('leaves a decision without mentions untouched', async () => {
    const env = await referenceHarness()
    await seedIdea(env, 'Unused')
    const prompt = directUser('Plain text, no reference.')

    const decision = await firePreStep(env, [prompt])

    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)
    expect(decision.messages).toEqual([prompt])
    expect(decision.messages[0]).toBe(prompt)
  })

  it('never parses plugin-, model-, or tool-sourced messages', async () => {
    const env = await referenceHarness()
    const { mention } = await seedIdea(env, 'Forged')
    const forged = createUserMessage({
      content: [{ type: 'text', text: `Forged ${mention}` }],
      source: { kind: 'plugin', plugin: 'not-dsh-idea' },
    })

    const decision = await firePreStep(env, [forged])
    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)

    expect(decision.messages).toEqual([forged])
    expect(decision.messages.some(isRecallContext)).toBe(false)
    expect(textOf(decision.messages[0]!.content)).toContain(mention)
  })
})

describe('loud failures', () => {
  it('rejects a mention-shaped string with a malformed payload', async () => {
    const env = await referenceHarness()
    const decision = await firePreStep(env, [directUser('See @[X](dsh-idea:!!!not-base64) now')])
    expect(decision.kind).toBe('reject')
  })

  it('rejects an explicit mention with an empty URI payload', async () => {
    const env = await referenceHarness()
    const decision = await firePreStep(env, [directUser('See @[X](dsh-idea:) now')])
    expect(decision.kind).toBe('reject')
  })

  it('rejects a pin to a deleted Idea', async () => {
    const env = await referenceHarness()
    const created = await env.ideaService.create(draft({ title: 'Doomed' }), {
      sessionId: 'session-1',
      anchorMessageId: 'msg-42',
      startSeq: 3,
      endSeq: 9,
      capturedContext: [{ role: 'user', text: 'Seed.' }],
    })
    await env.ideaService.deleteIdea(created.idea.ideaId, created.idea.currentVersionId)
    const mention = formatIdeaReferenceMention(
      { ideaId: created.idea.ideaId, versionId: created.idea.currentVersionId },
      'Doomed',
    )

    const decision = await firePreStep(env, [directUser(`Recall ${mention}`)])

    expect(decision.kind).toBe('reject')
  })

  it('rejects a pin to a version that does not exist', async () => {
    const env = await referenceHarness()
    const { ideaId } = await seedIdea(env, 'Missing version')
    const mention = formatIdeaReferenceMention({ ideaId, versionId: 'idea_ver_missing' as IdeaVersionId }, 'Missing version')

    const decision = await firePreStep(env, [directUser(`Recall ${mention}`)])

    expect(decision.kind).toBe('reject')
  })

  it('admits exactly five distinct references', async () => {
    const env = await referenceHarness()
    const seeded = []
    for (let index = 0; index < 5; index += 1) {
      seeded.push(await seedIdea(env, `Limit idea ${index}`))
    }
    const text = seeded.map(entry => entry.mention).join(' ')

    const decision = await firePreStep(env, [directUser(text)])
    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)

    expect((payloadOf(decision) as unknown[])).toHaveLength(5)
    const rewritten = textOf(decision.messages[0]!.content)
    for (const entry of seeded) {
      const label = entry.mention.slice(2, entry.mention.indexOf(']('))
      expect(rewritten).toContain(`Idea「${label}」`)
      expect(rewritten).not.toContain(entry.mention)
    }
  })

  it('rejects six distinct references loudly, reaching no model and admitting no context', async () => {
    const env = await referenceHarness()
    const seeded = []
    for (let index = 0; index < 6; index += 1) {
      seeded.push(await seedIdea(env, `Over-limit idea ${index}`))
    }
    const text = seeded.map(entry => entry.mention).join(' ')

    const decision = await firePreStep(env, [directUser(text)])

    expect(decision.kind).toBe('reject')
    expect(env.llm.calls).toHaveLength(0)
  })

  it('admits six occurrences of five unique pins as five projections', async () => {
    const env = await referenceHarness()
    const seeded = []
    for (let index = 0; index < 5; index += 1) {
      seeded.push(await seedIdea(env, `Unique idea ${index}`))
    }
    const text = [...seeded.map(entry => entry.mention), seeded[0]!.mention].join(' ')

    const decision = await firePreStep(env, [directUser(text)])
    if (decision.kind !== 'enter') throw new Error(`expected enter, got '${decision.kind}'`)

    expect((payloadOf(decision) as unknown[])).toHaveLength(5)
  })

  it('keeps a downstream reject authoritative', async () => {
    const env = await referenceHarness()
    const { mention } = await seedIdea(env, 'Downstream reject')
    env.ctx.on('agent/pre-step', async () => ({ kind: 'reject' as const }))

    const decision = await firePreStep(env, [directUser(`Recall ${mention}`)])

    expect(decision.kind).toBe('reject')
  })
})

describe('zero model calls', () => {
  it('resolves, rewrites, and injects without any LLM traffic', async () => {
    const env = await referenceHarness()
    const { mention } = await seedIdea(env, 'No model')

    await firePreStep(env, [directUser(`Recall ${mention}`)])

    expect(env.llm.calls).toHaveLength(0)
  })
})
