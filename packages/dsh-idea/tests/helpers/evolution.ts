/**
 * Offline fakes for the evolution pipeline: the real storage stack plus
 * IdeaService (so durable side effects are observable), the evolution
 * service, and the scripted seams (session query, model selection, LLM
 * streams) over one continued-discussion conversation. Nothing touches the
 * network or a real provider.
 * @module tests/helpers/evolution
 */

import { Context } from '@deepseek-ai/cordis'
import {
  FakeAgentDefaultModel,
  FakeLlm,
  FakeSessionQuery,
  assistantEvent,
  systemEvent,
  userEvent,
} from './preparation.ts'
import { draft, harness } from './harness.ts'
import type { SurfaceEvent } from '@deepseek-ai/dsh-session'
import type { IdeaService } from '../../src/index.ts'
import IdeaEvolutionService from '../../src/evolution/index.ts'
import { IdeaId } from '../../src/types.ts'
import type { IdeaDiscussion } from '../../src/types.ts'

export type { SurfaceEvent }
export { assistantEvent, systemEvent, userEvent, draft }

type SessionQueryFace = Context['sessionQuery']
type AgentDefaultModelFace = Context['agentDefaultModel']
type LlmFace = Context['llm']

/** The visible conversation one discussion reads: two exchanges. */
export const discussionEvents = (): SurfaceEvent[] => [
  systemEvent('SYSTEM-MARKER', 1),
  userEvent('d-u1', 'The title undersells the provenance angle.', 2),
  assistantEvent('d-a1', 'Agreed: the core is provenance, not session notes.', 3),
  userEvent('d-u2', 'And the open question about resurfacing is answered — ideas resurface in the library.', 4),
  assistantEvent('d-a2', 'Then the draft can drop that open question.', 5),
]

export interface EvolutionEnv {
  ctx: Context
  root: string
  service: IdeaEvolutionService
  ideaService: IdeaService
  sessionQuery: FakeSessionQuery
  agentDefaultModel: FakeAgentDefaultModel
  llm: FakeLlm
}

/**
 * Boot the evolution service over the real storage stack with scripted
 * seams. Callers still create the idea and discussion via the returned
 * domain service, then register the conversation surface events. An explicit
 * `root` reopens the same durable root instead of a fresh temp dir.
 */
export async function evolutionHarness(root?: string): Promise<EvolutionEnv> {
  const sessionQuery = new FakeSessionQuery()
  const agentDefaultModel = new FakeAgentDefaultModel()
  const llm = new FakeLlm()
  const base = await harness(root)
  base.ctx.provide('sessionQuery', sessionQuery as unknown as SessionQueryFace)
  base.ctx.provide('agentDefaultModel', agentDefaultModel as unknown as AgentDefaultModelFace)
  base.ctx.provide('llm', llm as unknown as LlmFace)
  await base.ctx.plugin(IdeaEvolutionService)
  return {
    ctx: base.ctx,
    root: base.root,
    service: base.ctx.ideaEvolutions,
    ideaService: base.ctx.ideaService,
    sessionQuery,
    agentDefaultModel,
    llm,
  }
}

/** Create one idea, continue it into a discussion, and register the conversation surface. */
export async function seedDiscussion(
  env: EvolutionEnv,
  events: SurfaceEvent[] = discussionEvents(),
): Promise<{ ideaId: IdeaId; discussion: IdeaDiscussion }> {
  const created = await env.ideaService.create(draft(), {
    sessionId: 'session-1',
    anchorMessageId: 'msg-42',
    startSeq: 3,
    endSeq: 9,
    capturedContext: [
      { role: 'user', text: 'What if ideas lived next to their source conversations?' },
      { role: 'assistant', text: 'One aggregate per idea could snapshot this exchange verbatim.' },
    ],
  })
  const discussion = await env.ideaService.continueDiscussion(
    created.idea.ideaId,
    async () => 'conversation-1',
  )
  env.sessionQuery.add(discussion.conversationId, events)
  return { ideaId: created.idea.ideaId, discussion }
}

/** A valid model-proposed draft, distinct from the seeded v1 draft. */
export const evolutionDraft = (): ReturnType<typeof draft> => draft({
  title: 'Idea provenance snapshots',
  core: 'Ideas keep the discussion that produced them',
  currentConclusion: 'Provenance is the core; resurfacing happens in the library',
  openQuestions: ['How should ideas be shared?'],
})
