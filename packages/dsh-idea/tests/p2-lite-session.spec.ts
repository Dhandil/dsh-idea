/** Public official Session/Query/JSONL integration; deliberately no Agent Loop. */
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SessionStore, { SessionId, SessionSeq, snapshotSessionEvent } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import type { SessionEventSearchPage, SessionSearchHit, SessionSearchPage, SessionObservation } from '@deepseek-ai/dsh-session-query'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import IdeaPreparationService from '../src/preparation/index.ts'
import { draft, sourceDraft, harness } from './helpers/harness.ts'
import { FakeLlm, FakeAgentDefaultModel, textStream } from './helpers/preparation.ts'
import { cleanupUpdates, noNetwork, trackUpdateRoot } from './helpers/update.ts'

class ExactQuery extends SessionQuery {
  override async searchSessions(): Promise<SessionSearchPage<SessionSearchHit>> { throw Error('not used') }
  override async searchEvents(): Promise<SessionEventSearchPage> { throw Error('not used') }
}
function exchange(session: Session, turn: number) {
  session.append('turn/start', { turn }); session.append('step/start', { turn, step: 1 })
  session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Official source discussion' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  const answer = session.append('assistant/message', { turn, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: 'Official finalized answer' }], source: { provider: 'offline', model: 'fixture' } }) }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 }); session.append('turn/end', { turn, reason: { kind: 'completed' } })
  return answer.data.message.id
}
beforeEach(noNetwork); afterEach(cleanupUpdates)

describe('P2-Lite one-surface integration', () => {
  it.each(['live', 'cold', 'fork'] as const)('S01 official %s source captures and durably commits without G0 or an Agent Loop', async mode => {
    const env = await harness(); trackUpdateRoot(env.root)
    await env.ctx.plugin(SessionStore)
    await env.ctx.plugin(JsonlPersistence, { root: join(env.root, 'isolated-sessions'), compression: 'none' })
    await env.ctx.plugin(ExactQuery)
    const llm = new FakeLlm()
    env.ctx.provide('llm', llm as never); env.ctx.provide('agentDefaultModel', new FakeAgentDefaultModel() as never)
    await env.ctx.plugin(IdeaPreparationService)
    const initial = await env.service.create(draft(), sourceDraft())
    let session = mode === 'cold'
      ? env.ctx.sessions.prepare(SessionId('source'), { meta: { cwd: env.root, delegationDepth: 0 } })
      : env.ctx.sessions.create(SessionId('source'), { meta: { cwd: env.root, delegationDepth: 0 } })
    let anchor = exchange(session, 1)
    if (mode === 'fork') {
      const parentAnchor = anchor
      session = env.ctx.sessions.fork(session, undefined, SessionId('child-source'))
      await expect(env.ctx.ideaPreparations.updates.prepare({ requestKey: 'inherited', sessionId: session.id, messageId: parentAnchor,
        ideaId: initial.idea.ideaId, expectedCurrentVersionId: initial.idea.currentVersionId })).rejects.toMatchObject({ code: 'source-unavailable' })
      anchor = exchange(session, 2)
    }
    if (mode === 'cold') {
      const handle = await env.ctx.sessionPersistence.create(session.header)
      try {
        await handle.append(Array.from({ length: session.seq }, (_, seq) => snapshotSessionEvent(session.eventAt(SessionSeq(seq))!)))
        await handle.flush()
      } finally { await handle.close() }
      expect(env.ctx.sessions.get(session.id)).toBeUndefined()
    }
    const read = vi.spyOn(env.ctx.sessionQuery, 'readSurface')
    const observations: SessionObservation[] = []
    const original = env.ctx.sessionQuery.observeSession.bind(env.ctx.sessionQuery)
    vi.spyOn(env.ctx.sessionQuery, 'observeSession').mockImplementation(async (...args) => {
      const lease = await original(...args); observations.push(lease); return lease
    })
    llm.enqueueChunks(textStream(JSON.stringify(draft({ title: 'Approved official-source update' }))))
    const preview = await env.ctx.ideaPreparations.updates.prepare({ requestKey: 'valid', sessionId: session.id, messageId: anchor,
      ideaId: initial.idea.ideaId, expectedCurrentVersionId: initial.idea.currentVersionId })
    expect(read).toHaveBeenCalledTimes(1); expect(llm.calls).toHaveLength(1)
    for (const lease of observations) expect(() => lease.retain()).toThrow(/disposed/)
    const result = await env.ctx.ideaPreparations.updates.commit(preview.updateId, preview.draft)
    expect(result.updated).toBe(true)
    const saved = env.service.get(initial.idea.ideaId)
    expect(saved.sourceDiscussions[1]).toMatchObject({ sessionId: session.id, anchorMessageId: anchor })
    expect(saved.sourceDiscussions[1]!.capturedContext.at(-1)).toEqual({ role: 'assistant', text: 'Official finalized answer' })
    expect(saved.versions[1]!.sourceDiscussionIds).toEqual([saved.sourceDiscussions[1]!.sourceDiscussionId])
  })
})
