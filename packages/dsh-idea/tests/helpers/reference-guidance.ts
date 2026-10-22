/** Offline reference fixtures shared by Host-waterfall and real-loop regressions. */
import { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message, UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { IdeaService } from '../../src/index.ts'
import { formatIdeaReferenceMention } from '../../src/reference/uri.ts'
import { EVALUATION_GUIDANCE } from '../../src/reference/evaluation-guidance.ts'
import { draft } from './harness.ts'

export const direct = (text: string) => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
export const textOf = (message: Pick<Message, 'content'>) => message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
export const recalls = (messages: readonly Message[]) => messages.filter(message => message.role === 'user'
  && message.source.kind === 'dsh-idea' && textOf(message).startsWith('## Referenced Ideas\n'))
export const guided = (messages: readonly Message[]) => recalls(messages).filter(message =>
  textOf(message).split('<referenced-ideas>')[0]!.split('\n').includes(EVALUATION_GUIDANCE))
export const payloadOf = (message: Message) => JSON.parse(textOf(message).split('<referenced-ideas>\n')[1]!.split('\n</referenced-ideas>')[0]!) as Array<Record<string, unknown>>

export async function seedReference(service: IdeaService, title = 'Synthetic idea', core = 'Synthetic evidence') {
  const aggregate = await service.create(draft({ title, core }), {
    sessionId: 'synthetic-source', anchorMessageId: 'synthetic-anchor', startSeq: 1, endSeq: 2,
    capturedContext: [{ role: 'user', text: 'Synthetic source.' }],
  })
  const pin = { ideaId: aggregate.idea.ideaId, versionId: aggregate.idea.currentVersionId }
  return { ...pin, mention: formatIdeaReferenceMention(pin, 'Client label') }
}

/** Real Cordis waterfall; this is not a loop-admission or resume test. */
export async function fireReference(ctx: Context, claimed: UserMessage[], options: {
  accepted?: UserMessage[]
  signal?: AbortSignal
  startsRequestSeries?: true
} = {}): Promise<Extract<PreStepDecision, { kind: 'enter' }>> {
  const result = await decideReference(ctx, claimed, options)
  if (result.kind !== 'enter') throw new Error('Expected admitted reference')
  return result
}

export async function decideReference(ctx: Context, claimed: UserMessage[], options: {
  accepted?: UserMessage[]
  signal?: AbortSignal
  startsRequestSeries?: true
} = {}): Promise<PreStepDecision> {
  const session = Session.create(SessionId('conversation-1'))
  const agent = { id: session.id, session, ctx: new Context() } as unknown as Agent
  return agentEvents(ctx, agent).waterfall('agent/pre-step', {
    messages: claimed, turn: 1, step: 1, signal: options.signal ?? new AbortController().signal,
  }, async () => ({ kind: 'enter' as const, messages: options.accepted ?? claimed,
    ...(options.startsRequestSeries ? { startsRequestSeries: true as const } : {}) }))
}
