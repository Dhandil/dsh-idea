import { afterEach, describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { cleanup } from './helpers/harness.ts'
import { direct, guided, recalls, seedReference, textOf } from './helpers/reference-guidance.ts'
import { failureResponse, OfflineAdapter, referenceLoop, seedPrefix, send, textResponse, toolResponse } from './helpers/reference-loop.ts'

afterEach(cleanup)

describe('PERF-C2B actual offline Agent Loop', () => {
  it('C32/C41/C42/C47/C48 keeps tools available through evaluation, later research, and a new evaluation', async () => {
    const adapter = new OfflineAdapter((_r, i) => i === 0 || i === 2 ? toolResponse(`call-${i}`) : textResponse())
    const env = await referenceLoop(adapter)
    const pin = await seedReference(env.service)
    const agent = await env.create('evaluation-then-research')
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(adapter.requests).toHaveLength(2)
    expect(env.executions).toHaveLength(1) // eligible advice did not block the model's tool call
    expect(recalls(agent.session.deriveMessages())).toHaveLength(1)
    expect(guided(agent.session.deriveMessages())).toHaveLength(1)
    expect(adapter.requests[1]!.messages.some(m => m.role === 'tool' && !m.isError && m.toolCallId === 'call-0')).toBe(true)
    await send(agent, 'Investigate the repository implementation and research current alternatives.')
    expect(adapter.requests).toHaveLength(4)
    expect(env.executions).toHaveLength(2)
    expect(guided(agent.session.deriveMessages())).toHaveLength(1) // old prose remains, no new advice
    expect(adapter.requests[2]!.tools).toEqual(adapter.requests[0]!.tools)
    expect(adapter.requests[2]!.messages[0]).toEqual(adapter.requests[0]!.messages[0])
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(adapter.requests).toHaveLength(5)
    expect(guided(agent.session.deriveMessages())).toHaveLength(2) // same pin, new direct request
    expect(agent.session.snapshotEvents().filter(e => e.type === 'tool/call')).toHaveLength(2)
    expect(agent.session.snapshotEvents().filter(e => e.type === 'tool/result')).toHaveLength(2)
  })

  it('C35 same-step official retry admits only one recall and one guidance', async () => {
    const adapter = new OfflineAdapter((_r, i) => i === 0 ? failureResponse() : textResponse())
    const env = await referenceLoop(adapter)
    const pin = await seedReference(env.service)
    env.ctx.on('agent/request-error', async () => ({ kind: 'retry' as const })) // controlled test policy, not product
    let preSteps = 0
    env.ctx.on('agent/pre-step', async (_payload, next) => { preSteps++; return next() })
    const agent = await env.create('retry')
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(adapter.requests).toHaveLength(2)
    expect(preSteps).toBe(1)
    expect(recalls(agent.session.deriveMessages())).toHaveLength(1)
    expect(guided(agent.session.deriveMessages())).toHaveLength(1)
    expect(adapter.requests[1]!.messages).toEqual(adapter.requests[0]!.messages)
  })

  it('C36/C46 other-plugin pre-step rejection prevents every admission and model call', async () => {
    const env = await referenceLoop(new OfflineAdapter(() => textResponse()))
    const pin = await seedReference(env.service)
    const stop = env.ctx.on('agent/pre-step', async () => ({ kind: 'reject' as const }))
    const agent = await env.create('policy-rejection')
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(env.adapter.requests).toHaveLength(0)
    expect(recalls(agent.session.deriveMessages())).toHaveLength(0)
    stop()
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(guided(agent.session.deriveMessages())).toHaveLength(1)
  })

  it.each(['cancel', 'failure'] as const)('C37 %s before prepareCall admission leaves no hint or stale delivered flag', async method => {
    const adapter = new OfflineAdapter(() => textResponse())
    const env = await referenceLoop(adapter)
    const pin = await seedReference(env.service)
    const stop = env.ctx.on('agent/request', async ({ agent }, next) => {
      if (method === 'failure') throw Error('controlled before-admission failure')
      agent.cancel({ kind: 'user' })
      return next()
    })
    const agent = await env.create(`before-admission-${method}`)
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(adapter.requests).toHaveLength(0)
    expect(recalls(agent.session.deriveMessages())).toHaveLength(0)
    stop()
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(adapter.requests).toHaveLength(1)
    expect(guided(agent.session.deriveMessages())).toHaveLength(1)
  })

  it('C38 resumes a failed admitted request from actual JSONL without re-injection', async () => {
    const first = await referenceLoop(new OfflineAdapter(() => failureResponse()))
    const pin = await seedReference(first.service)
    const agent = await first.create('failed-resume')
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(guided(agent.session.deriveMessages())).toHaveLength(1)
    await first.ctx.fiber.dispose()
    const adapter = new OfflineAdapter(() => textResponse())
    const next = await referenceLoop(adapter, { root: first.root })
    const resumed = (await next.ctx.agents.resume({ resumeSessionId: SessionId('failed-resume'), agentOptions: { provider: 'offline', model: 'fixture' } })).agent
    await send(resumed, 'Investigate code and current research now.')
    expect(adapter.requests).toHaveLength(1)
    expect(guided(resumed.session.deriveMessages())).toHaveLength(1)
    expect(recalls(resumed.session.deriveMessages())).toHaveLength(1)
  })

  it('C39 restores a flushed pending inbox prefix and qualifies it only when claimed', async () => {
    const first = await referenceLoop(new OfflineAdapter(() => textResponse()))
    const pin = await seedReference(first.service)
    const agent = await first.create('pending-resume')
    agent.send(direct(`What do you think of ${pin.mention}?`), 'next-turn', false)
    await first.ctx.sessions.flush(agent.session)
    const header = agent.session.header
    const prefix = agent.session.snapshotEvents()
    expect(first.adapter.requests).toHaveLength(0)
    await first.ctx.fiber.dispose()
    const next = await referenceLoop(new OfflineAdapter(() => textResponse()), { root: first.root, sessionDirectory: 'pending-prefix-replay' })
    await seedPrefix(next, header, prefix)
    const resumed = (await next.ctx.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'offline', model: 'fixture' } })).agent
    expect(resumed.inbox.nextTurn).toHaveLength(1)
    expect(guided(resumed.session.deriveMessages())).toHaveLength(0)
    resumed.steer(createUserMessage({ content: [{ type: 'text', text: 'offline wake' }], source: { kind: 'dsh-idea' } }))
    await resumed.whenIdle()
    expect(next.adapter.requests).toHaveLength(1)
    expect(guided(resumed.session.deriveMessages())).toHaveLength(1)
  })

  it('C40 replays the claim-before-admission crash prefix without inventing a recovered message', async () => {
    const first = await referenceLoop(new OfflineAdapter(() => textResponse()))
    const pin = await seedReference(first.service)
    const agent = await first.create('claim-crash-prefix')
    let boundary: { header: SessionHeader; events: readonly SessionEvent[] } | undefined
    first.ctx.on('agent/request', async () => {
      await first.ctx.sessions.flush(agent.session)
      boundary = { header: agent.session.header, events: agent.session.snapshotEvents() }
      throw Error('controlled power-loss boundary')
    })
    await send(agent, `What do you think of ${pin.mention}?`)
    if (boundary === undefined) throw Error('missing captured boundary')
    expect(recalls(agent.session.deriveMessages())).toHaveLength(0)
    await first.ctx.fiber.dispose()
    const next = await referenceLoop(new OfflineAdapter(() => textResponse()), { root: first.root, sessionDirectory: 'claim-prefix-replay' })
    await seedPrefix(next, boundary.header, boundary.events)
    const resumed = (await next.ctx.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'offline', model: 'fixture' } })).agent
    expect(resumed.inbox.nextTurn).toHaveLength(0)
    expect(resumed.inbox.nextStep).toHaveLength(0)
    expect(next.adapter.requests).toHaveLength(0)
    expect(recalls(resumed.session.deriveMessages())).toHaveLength(0)
    await send(resumed, 'Investigate code now.')
    expect(next.adapter.requests).toHaveLength(1)
    expect(guided(resumed.session.deriveMessages())).toHaveLength(0)
  })

  it('C43 concurrent Agents keep evaluation and research independent', async () => {
    const adapter = new OfflineAdapter(request => request.sessionId === 'research-agent'
      && request.messages.every(m => m.role !== 'tool') ? toolResponse('research-tool') : textResponse())
    const env = await referenceLoop(adapter)
    const pin = await seedReference(env.service)
    const a = await env.create('evaluation-agent'), b = await env.create('research-agent')
    await Promise.all([send(a, `What do you think of ${pin.mention}?`), send(b, `Implement and research ${pin.mention}`)])
    expect(guided(a.session.deriveMessages())).toHaveLength(1)
    expect(guided(b.session.deriveMessages())).toHaveLength(0)
    expect(env.executions).toHaveLength(1)
    expect(adapter.requests.filter(r => r.sessionId === b.id)).toHaveLength(2)
  })

  it('C50 complete persona, disabled runtime context and denied tool stay authoritative', async () => {
    const env = await referenceLoop(new OfflineAdapter((_r, i) => i === 0 ? toolResponse('denied-tool') : textResponse()))
    env.ctx.on('tools/pre-execute', async () => ({ kind: 'deny' as const, reason: 'controlled permission boundary' }))
    const pin = await seedReference(env.service)
    const agent = await env.create('permission-boundary')
    await send(agent, `What do you think of ${pin.mention}?`)
    expect(guided(agent.session.deriveMessages())).toHaveLength(1)
    expect(env.executions).toHaveLength(0)
    expect(env.adapter.requests).toHaveLength(2)
    expect(textOf(env.adapter.requests[0]!.messages[0]!)).toBe('Offline persona: retain all normal tool and permission decisions.')
    expect(env.adapter.requests[1]!.messages.some(m => m.role === 'tool' && m.isError)).toBe(true)
    expect(env.adapter.requests[0]!.tools?.map(t => t.name)).toEqual(['offline_echo'])
    expect(env.adapter.requests[1]!.tools).toEqual(env.adapter.requests[0]!.tools)
  })
})
