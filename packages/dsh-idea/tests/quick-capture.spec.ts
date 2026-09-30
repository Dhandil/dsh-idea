/**
 * T12 Quick Capture — Host-side focused tests: the deterministic direct-save
 * preparation with zero model calls, the single-call AI organization, the
 * strict schema/bounds validation of the note, the empty-provenance
 * `createDirect` write path and its round-trip, the commit-machine branching
 * and idempotency, the empty-motivation edit/evolution compatibility, and the
 * chat-extraction flow's stricter motivation check. All offline — the LLM and
 * session seams are scripted fakes and the storage stack is local json.
 * @module tests/quick-capture.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  FakeAgentDefaultModel,
  FakeLlm,
  FakeSessionQuery,
  assistantEvent,
  preparationHarness,
  systemEvent,
  textStream,
  userEvent,
} from './helpers/preparation.ts'
import { cleanup } from './helpers/harness.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import IdeaEvolutionService from '../src/evolution/index.ts'
import IdeaRelatedService from '../src/related/index.ts'
import IdeaResurfacingService from '../src/resurfacing/index.ts'
import type { IdeaPrepareQuickCaptureRequest } from '../src/remote-host/types.ts'

afterEach(cleanup)

const NOTE = '给养花新手做一个今天要不要浇水的决策小助手'

const defaultEvents = () => [
  systemEvent('SYSTEM-MARKER', 1),
  userEvent('u1', 'What if ideas lived beside their conversations?', 2),
  assistantEvent('a1', 'The clicked answer', 3),
]

/** Full offline stack plus the mounted remote controller (mirrors remote-service.spec). */
async function fullHarness() {
  const sessionQuery = new FakeSessionQuery()
  sessionQuery.add('session-1', defaultEvents())
  const llm = new FakeLlm()
  const env = await preparationHarness({ sessionQuery, agentDefaultModel: new FakeAgentDefaultModel(), llm })
  await env.ctx.plugin(IdeaEvolutionService)
  await env.ctx.plugin(IdeaRelatedService)
  await env.ctx.plugin(IdeaResurfacingService)
  env.ctx.provide('ideaSemantic', {
    semanticResurfacingCandidates: async () => ({ candidates: [] }),
  } as never)
  await env.ctx.plugin(IdeaRemoteService)
  return { ...env, llm, idea: env.ctx.idea }
}

const quickRequest = (overrides: Partial<IdeaPrepareQuickCaptureRequest> = {}): IdeaPrepareQuickCaptureRequest => ({
  sessionId: 'session-1',
  text: NOTE,
  mode: 'direct',
  ...overrides,
})

describe('quick-capture preparation (direct)', () => {
  it('prepares deterministically with zero model calls', async () => {
    const env = await fullHarness()
    const result = await env.idea.prepareQuickCapture(quickRequest())
    expect(env.llm.calls).toHaveLength(0)
    expect(result.draft).toEqual({
      title: NOTE,
      core: NOTE,
      motivation: '',
      currentConclusion: '',
      possibleValue: '',
      useWhen: [],
      openQuestions: [],
    })
    // The registered origin is a quick-capture entry with no model route.
    const stored = env.ctx.ideaPreparations.preparations.resolve(result.preparationId)
    expect(stored.origin).toEqual({ kind: 'quick-capture', model: undefined })
  })

  it('derives the title from the first non-empty line and keeps the note verbatim as core', async () => {
    const env = await fullHarness()
    const result = await env.idea.prepareQuickCapture(quickRequest({
      text: '\n  \n浇水决策小助手的想法\n核心是二元答案',
    }))
    expect(result.draft.title).toBe('浇水决策小助手的想法')
    expect(result.draft.core).toBe('浇水决策小助手的想法\n核心是二元答案')
    expect(env.llm.calls).toHaveLength(0)
  })

  it('rejects an empty note and an over-bounds note before any registry entry', async () => {
    const env = await fullHarness()
    await expect(env.idea.prepareQuickCapture(quickRequest({ text: '   \n  ' })))
      .rejects.toMatchObject({ code: 'idea/invalid-quick-capture-input' })
    await expect(env.idea.prepareQuickCapture(quickRequest({ text: 'x'.repeat(20_001) })))
      .rejects.toMatchObject({ code: 'idea/invalid-quick-capture-input' })
  })
})

describe('quick-capture preparation (ai)', () => {
  it('makes exactly one model call, parses strictly, and allows an empty motivation', async () => {
    const env = await fullHarness()
    env.llm.enqueueChunks(textStream(JSON.stringify({
      title: '浇水决策小助手',
      core: NOTE,
      motivation: '',
      currentConclusion: '',
      possibleValue: '',
      useWhen: [],
      openQuestions: [],
    })))
    const result = await env.idea.prepareQuickCapture(quickRequest({ mode: 'ai' }))
    expect(env.llm.calls).toHaveLength(1)
    // The note is framed as data inside one plugin-authored user message.
    expect(env.llm.calls[0]?.messages).toHaveLength(1)
    const stored = env.ctx.ideaPreparations.preparations.resolve(result.preparationId)
    expect(stored.origin.kind).toBe('quick-capture')
    if (stored.origin.kind === 'quick-capture') {
      expect(stored.origin.model).toBeDefined()
    }
    expect(result.draft.motivation).toBe('')
  })

  it('maps an empty note onto the stable wire code', async () => {
    const env = await fullHarness()
    await expect(env.idea.prepareQuickCapture(quickRequest({ mode: 'ai', text: '' })))
      .rejects.toMatchObject({ code: 'idea/invalid-quick-capture-input' })
  })
})

describe('quick-capture commit (the shared commit machine)', () => {
  it('commits through createDirect with empty provenance and round-trips', async () => {
    const env = await fullHarness()
    const result = await env.idea.prepareQuickCapture(quickRequest())
    const saved = await env.idea.create({ preparationId: result.preparationId, draft: result.draft })
    expect(saved.status).toBe('active')

    // The durable aggregate carries empty provenance and round-trips.
    const aggregate = env.ctx.ideaService.get(saved.ideaId)
    expect(aggregate.sourceDiscussions).toEqual([])
    expect(aggregate.versions[0]?.sourceDiscussionIds).toEqual([])
    expect(aggregate.versions[0]?.draft.motivation).toBe('')
    expect(aggregate.versions[0]?.reason).toBe('initial-save')
    // The wire detail projects no source for a citation-less version.
    const detail = await env.idea.get({ id: saved.ideaId })
    expect(detail.source).toBeUndefined()

    // A fresh read of the storage root parses at the durable boundary.
    expect(env.ctx.ideaService.list().map(view => view.idea.ideaId)).toContain(saved.ideaId)
  })

  it('is idempotent: a repeated create with the same preparation id returns the retained result', async () => {
    const env = await fullHarness()
    const result = await env.idea.prepareQuickCapture(quickRequest())
    const first = await env.idea.create({ preparationId: result.preparationId, draft: result.draft })
    const second = await env.idea.create({ preparationId: result.preparationId, draft: result.draft })
    expect(second).toEqual(first)
    expect(env.ctx.ideaService.list()).toHaveLength(1)
  })

  it('maps an expired preparation onto idea/preparation-not-found', async () => {
    const env = await fullHarness()
    await expect(env.idea.create({
      preparationId: 'prep_does-not-exist' as Parameters<typeof env.idea.create>[0]['preparationId'],
      draft: {
        title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [],
      },
    })).rejects.toMatchObject({ code: 'idea/preparation-not-found' })
  })
})

describe('empty-motivation compatibility (D1)', () => {
  it('manual-edit commits a quick-captured idea without requiring a motivation', async () => {
    const env = await fullHarness()
    const prepared = await env.idea.prepareQuickCapture(quickRequest())
    const saved = await env.idea.create({ preparationId: prepared.preparationId, draft: prepared.draft })
    const edited = await env.idea.manualEdit({
      id: saved.ideaId,
      expectedCurrentVersionId: saved.currentVersionId,
      draft: {
        title: '改过的标题',
        core: '改过的核心',
        motivation: '',
        currentConclusion: '',
        possibleValue: '',
        useWhen: [],
        openQuestions: [],
      },
    })
    expect(edited.committed).toBe(true)
    const aggregate = env.ctx.ideaService.get(saved.ideaId)
    expect(aggregate.versions).toHaveLength(2)
    expect(aggregate.versions[1]?.draft.motivation).toBe('')
    expect(aggregate.idea.currentVersionId).toBe(edited.currentVersionId)
  })

  it('the chat-extraction flow keeps its own stricter motivation check', async () => {
    const env = await fullHarness()
    // The model omits motivation: the chat proposal is rejected…
    env.llm.enqueueChunks(textStream(JSON.stringify({
      title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [],
    })))
    await expect(env.ctx.ideaPreparations.prepareFromMessage('session-1', 'a1'))
      .rejects.toMatchObject({ code: 'invalid-model-output' })
    // …while the very same output stays legal for a quick-capture AI prepare.
    env.llm.enqueueChunks(textStream(JSON.stringify({
      title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [],
    })))
    const result = await env.idea.prepareQuickCapture(quickRequest({ mode: 'ai' }))
    expect(result.draft.motivation).toBe('')
  })

  it('commitEvolution validates an empty motivation against the relaxed schema', async () => {
    // Schema-level compatibility for the evolution commit boundary: the wire
    // validation the remote performs must accept an empty motivation.
    const { ideaDraftSchema } = await import('../src/schema.ts')
    const parsed = ideaDraftSchema.safeParse({
      title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [],
    })
    expect(parsed.success).toBe(true)
  })
})

describe('quick capture never touches conversations or budgets', () => {
  it('registers no session binding and consumes no resurfacing budget', async () => {
    const env = await fullHarness()
    const prepared = await env.idea.prepareQuickCapture(quickRequest())
    await env.idea.create({ preparationId: prepared.preparationId, draft: prepared.draft })
    // No discussion binding was fabricated for the capture session.
    expect(env.ctx.ideaService.findDiscussionByConversationId('session-1')).toBeUndefined()
    const budget = await env.idea.getResurfacingBudget({ sessionId: 'session-1' })
    expect(budget.consumed).toBe(false)
  })
})

