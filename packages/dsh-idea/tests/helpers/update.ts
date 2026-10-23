/** Isolated real Idea storage and preparation/Remote, with offline model/query seams. */
import { access } from 'node:fs/promises'
import { expect, vi } from 'vitest'
import { cleanup, harness } from './harness.ts'
import { FakeAgentDefaultModel, FakeLlm, FakeSessionQuery, assistantEvent, systemEvent, userEvent } from './preparation.ts'
import IdeaPreparationService from '../../src/preparation/index.ts'
import IdeaRemoteService from '../../src/remote-host/index.ts'
import type { IdeaAggregate, IdeaId } from '../../src/types.ts'
import type { IdeaService } from '../../src/index.ts'

const roots = new Set<string>()
export const trackUpdateRoot = (root: string) => { roots.add(root) }
export const sourceEvents = () => [
  systemEvent('excluded system', 1), userEvent('human', 'Improve the current conclusion.', 2),
  userEvent('recall', 'excluded recall', 3, 'dsh-idea'), assistantEvent('answer', 'Keep the useful fields and revise the conclusion.', 4),
  userEvent('future-human', 'excluded future input', 5), assistantEvent('future-answer', 'excluded future answer', 6),
]
export async function updateHarness(root?: string) {
  const env = await harness(root)
  trackUpdateRoot(env.root)
  const sessionQuery = new FakeSessionQuery(), llm = new FakeLlm(), agentDefaultModel = new FakeAgentDefaultModel()
  env.ctx.provide('sessionQuery', sessionQuery as never)
  env.ctx.provide('llm', llm as never)
  env.ctx.provide('agentDefaultModel', agentDefaultModel as never)
  await env.ctx.plugin(IdeaPreparationService)
  for (const name of ['ideaEvolutions', 'ideaRelated', 'ideaResurfacing', 'ideaSemantic'] as const) env.ctx.provide(name, {} as never)
  await env.ctx.plugin(IdeaRemoteService)
  sessionQuery.add('ordinary-session', sourceEvents())
  return { ...env, sessionQuery, llm, agentDefaultModel, updates: env.ctx.ideaPreparations.updates, remote: env.ctx.idea }
}
export function updateRequest(aggregate: IdeaAggregate, requestKey = 'request-1') {
  return { requestKey, sessionId: 'ordinary-session', messageId: 'answer', ideaId: aggregate.idea.ideaId, expectedCurrentVersionId: aggregate.idea.currentVersionId }
}
/** Fault/ledger seam only; production code never reaches a private table. */
export function recordsOf(service: IdeaService) {
  return (service as unknown as { records: {
    update(id: IdeaId, transform: (current: IdeaAggregate) => IdeaAggregate): Promise<IdeaAggregate>
    put(id: IdeaId, aggregate: IdeaAggregate): Promise<void>
  } }).records
}
export function noNetwork() { vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw Error('offline tests forbid network') }) }
export async function cleanupUpdates() {
  await cleanup()
  for (const root of roots) await expect(access(root)).rejects.toMatchObject({ code: 'ENOENT' })
  roots.clear()
  expect(globalThis.fetch).not.toHaveBeenCalled()
  vi.restoreAllMocks()
}
