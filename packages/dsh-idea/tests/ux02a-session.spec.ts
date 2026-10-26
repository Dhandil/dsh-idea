/** Host-only evidence. These tests are not real-browser latency acceptance. */
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import SessionStore, { SessionId, SessionSeq, snapshotSessionEvent } from '@deepseek-ai/dsh-session'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import type { SessionEventSearchPage, SessionSearchHit, SessionSearchPage } from '@deepseek-ai/dsh-session-query'
import * as JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import IdeaPreparationService from '../src/preparation/index.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import { draft, sourceDraft, harness, storedBytes } from './helpers/harness.ts'
import { FakeLlm, FakeAgentDefaultModel, textStream } from './helpers/preparation.ts'
import { cleanupUpdates, noNetwork, trackUpdateRoot } from './helpers/update.ts'

class ExactQuery extends SessionQuery {
  override async searchSessions(): Promise<SessionSearchPage<SessionSearchHit>> { throw Error('not used') }
  override async searchEvents(): Promise<SessionEventSearchPage> { throw Error('not used') }
}
beforeEach(noNetwork); afterEach(cleanupUpdates)

describe('UX02A official short/long live/cold Host observation', () => {
  for (const mode of ['new', 'update'] as const) for (const size of ['short', 'long'] as const) for (const availability of ['live', 'cold'] as const) {
    it(`${mode}/${size}/${availability}: exact public Session, one model call and zero preparation writes`, async () => {
      const env = await harness(); trackUpdateRoot(env.root)
      await env.ctx.plugin(SessionStore)
      await env.ctx.plugin(JsonlPersistence, { root: join(env.root, 'sessions'), compression: 'none' })
      await env.ctx.plugin(ExactQuery)
      const llm = new FakeLlm()
      env.ctx.provide('llm', llm as never); env.ctx.provide('agentDefaultModel', new FakeAgentDefaultModel() as never)
      await env.ctx.plugin(IdeaPreparationService)
      for (const name of ['ideaEvolutions', 'ideaRelated', 'ideaResurfacing', 'ideaSemantic'] as const) env.ctx.provide(name, {} as never)
      await env.ctx.plugin(IdeaRemoteService)
      const initial = await env.service.create(draft(), sourceDraft()), before = await storedBytes(env.root, initial.idea.ideaId)
      const session = availability === 'cold'
        ? env.ctx.sessions.prepare(SessionId('synthetic-source'), { meta: { cwd: env.root, delegationDepth: 0 } })
        : env.ctx.sessions.create(SessionId('synthetic-source'), { meta: { cwd: env.root, delegationDepth: 0 } })
      let anchor = ''
      for (let turn = 1; turn <= (size === 'short' ? 2 : 80); turn++) {
        session.append('turn/start', { turn }); session.append('step/start', { turn, step: 1 })
        session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Synthetic discussion. '.repeat(size === 'short' ? 1 : 70) }], source: { kind: 'user' } }), { surfaceOp: 'append' })
        anchor = session.append('assistant/message', { turn, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: 'Synthetic finalized answer. '.repeat(size === 'short' ? 1 : 50) }], source: { provider: 'offline', model: 'fixture' } }) }, { surfaceOp: 'append' }).data.message.id
        session.append('step/end', { turn, step: 1 }); session.append('turn/end', { turn, reason: { kind: 'completed' } })
      }
      if (availability === 'cold') {
        const handle = await env.ctx.sessionPersistence.create(session.header)
        try { await handle.append(Array.from({ length: session.seq }, (_, seq) => snapshotSessionEvent(session.eventAt(SessionSeq(seq))!))); await handle.flush() }
        finally { await handle.close() }
      }
      expect(env.ctx.sessions.get(session.id) !== undefined).toBe(availability === 'live')
      llm.enqueueChunks(textStream(JSON.stringify(draft())))
      if (mode === 'new') await env.ctx.idea.prepareFromMessage({ sessionId: session.id, messageId: anchor })
      else await env.ctx.idea.prepareUpdateFromMessage({ requestKey: 'one-prepare', sessionId: session.id, messageId: anchor,
        ideaId: initial.idea.ideaId, expectedCurrentVersionId: initial.idea.currentVersionId })
      expect(env.ctx.sessions.get(session.id) !== undefined).toBe(availability === 'live')
      expect(llm.calls).toHaveLength(1)
      expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(before)
      const metrics = (mode === 'new' ? env.ctx.ideaPreparations.performance : env.ctx.ideaPreparations.updates.performance).snapshot()
      for (const stage of ['host.session-read', 'host.capture', 'host.route', 'host.prompt', 'host.model-first-response', 'host.model-first-text', 'host.model-complete', 'host.parse', 'host.prepare-total', 'host.rpc-handler'] as const) expect(metrics[stage]?.count).toBe(1)
      expect(metrics['host.model-first-text']!.totalMs).toBeGreaterThanOrEqual(metrics['host.model-first-response']!.totalMs)
      expect(metrics['host.model-complete']!.totalMs).toBeGreaterThanOrEqual(metrics['host.model-first-text']!.totalMs)
      // Explicit opt-in: promote only static case names, event counts and numeric timings.
      if (process.env.DSH_IDEA_UX02A_HOST_EVIDENCE === '1') {
        if (!process.env.DSH_IDEA_LOGS) throw Error('isolated logs required')
        writeFileSync(join(process.env.DSH_IDEA_LOGS, `ux02a-host-${mode}-${size}-${availability}.json`),
          JSON.stringify({ mode, size, availability, sessionEvents: session.seq, modelDoubleCalls: 1, metrics }))
      }
    })
  }
})
