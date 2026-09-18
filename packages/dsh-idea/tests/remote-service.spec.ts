/**
 * The `idea` Remote controller over offline seams: delegation to the T2
 * preparation service, wire-code mapping, draft validation without registry
 * access, canonical source resolution, the idempotent commit machine, and the
 * generated contributions' shapes. No real provider, network, or model call —
 * the LLM/session seams are scripted fakes and the storage stack is local
 * json over a temp root.
 * @module tests/remote-service.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
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
import { cleanup, draft, storedBytes } from './helpers/harness.ts'
import { IdeaPreparationError, type IdeaPreparationErrorCode } from '../src/preparation/errors.ts'
import type { IdeaPreparationId, IdeaPreparationPreview, PreparedIdeaSource } from '../src/preparation/types.ts'
import IdeaEvolutionService from '../src/evolution/index.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import IdeaRelatedService from '../src/related/index.ts'
import type { IdeaPrepareRequest } from '../src/remote-host/types.ts'
import { EvolutionEventId, IdeaId, IdeaVersionId } from '../src/types.ts'
import type { IdeaAggregate, SourceDiscussionDraft } from '../src/types.ts'

/** The stored aggregate a successful IdeaService.create returns. */
const aggregateOf = (ideaId: string, versionId: string, createdAt = 1): IdeaAggregate => ({
  idea: {
    ideaId: IdeaId(ideaId),
    currentVersionId: IdeaVersionId(versionId),
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  },
  versions: [{
    versionId: IdeaVersionId(versionId),
    ideaId: IdeaId(ideaId),
    ordinal: 1,
    draft: {
      title: 't',
      core: 'c',
      motivation: 'm',
      currentConclusion: '',
      possibleValue: '',
      useWhen: [],
      openQuestions: [],
    },
    reason: 'initial-save',
    sourceDiscussionIds: [],
    createdAt,
  }],
  sourceDiscussions: [],
  evolutionEvents: [{
    evolutionEventId: EvolutionEventId('idea-evo-1'),
    ideaId: IdeaId(ideaId),
    toVersionId: IdeaVersionId(versionId),
    reason: 'initial-save',
    createdAt,
  }],
})

afterEach(cleanup)

const modelDraft = {
  title: '  Idea provenance snapshots  ',
  core: 'Ideas keep the discussion that produced them',
  motivation: 'Directions lose their context when detached',
  currentConclusion: 'One aggregate per idea',
  possibleValue: 'Resurfacing with full context',
  useWhen: ['after research sessions'],
  openQuestions: ['when to resurface?'],
}
const draftText = JSON.stringify(modelDraft)

const defaultEvents = () => [
  systemEvent('SYSTEM-MARKER', 1),
  userEvent('u1', 'What if ideas lived beside their conversations?', 2),
  assistantEvent('a1', 'The clicked answer', 3),
]

/** Full offline stack plus the mounted remote controller. */
async function fullHarness() {
  const sessionQuery = new FakeSessionQuery()
  sessionQuery.add('session-1', defaultEvents())
  const llm = new FakeLlm()
  const env = await preparationHarness({ sessionQuery, agentDefaultModel: new FakeAgentDefaultModel(), llm })
  await env.ctx.plugin(IdeaEvolutionService)
  await env.ctx.plugin(IdeaRelatedService)
  await env.ctx.plugin(IdeaRemoteService)
  return { ...env, llm }
}

/** The preparation of one scripted successful model proposal. */
async function preparedPreview(env: Awaited<ReturnType<typeof fullHarness>>): Promise<IdeaPreparationPreview> {
  env.llm.enqueueChunks(textStream(draftText))
  return env.ctx.ideaPreparations.prepareFromMessage('session-1', 'a1')
}

/** Stub ideaService + preparation service: the remote controller's two seams. */
function stubHarness(overrides: {
  create?: (draft: unknown, source: unknown) => Promise<IdeaAggregate>
  resolve?: (id: IdeaPreparationId) => PreparedIdeaSource
  prepareFromMessage?: (sessionId: string, messageId: string, signal?: AbortSignal) => Promise<IdeaPreparationPreview>
} = {}): Promise<{ ctx: Context, idea: IdeaRemoteService, create: ReturnType<typeof vi.fn>, resolve: ReturnType<typeof vi.fn>, prepareFromMessage: ReturnType<typeof vi.fn> }> {
  const markerSource: SourceDiscussionDraft = {
    sessionId: 'session-canonical',
    anchorMessageId: 'msg-canonical',
    startSeq: 1,
    endSeq: 4,
    capturedContext: [{ role: 'assistant', text: 'canonical captured answer' }],
  }
  const resolved: PreparedIdeaSource = {
    source: markerSource,
    model: { provider: 'p', model: 'm' },
    createdAt: 1,
  }
  const create = vi.fn(overrides.create ?? (async () => aggregateOf('idea_1', 'idea_ver_1')))
  const resolve = vi.fn(overrides.resolve ?? (() => resolved))
  const prepareFromMessage = vi.fn(overrides.prepareFromMessage ?? (async () => ({
    preparationId: 'prep_1' as IdeaPreparationId,
    draft: draft(),
    source: {
      sessionId: 'session-1', anchorMessageId: 'a1', startSeq: 1, endSeq: 2, messageCount: 2, characterCount: 30,
    },
    model: { provider: 'p', model: 'm' },
  })))
  const harness = (async () => {
    const ctx = new Context()
    ctx.provide('ideaService', { create } as never)
    ctx.provide('ideaPreparations', { prepareFromMessage, preparations: { resolve } } as never)
    ctx.provide('ideaEvolutions', {
      prepare: vi.fn(async () => { throw new Error('this suite never prepares evolution') }),
      commit: vi.fn(async () => { throw new Error('this suite never commits evolution') }),
    } as never)
    ctx.provide('ideaRelated', {
      relatedFromMessage: vi.fn(async () => { throw new Error('this suite never judges related ideas') }),
    } as never)
    await ctx.plugin(IdeaRemoteService)
    return { ctx, idea: ctx.idea, create, resolve, prepareFromMessage }
  })()
  return Object.assign(harness, { create, resolve, prepareFromMessage })
}

/** The stable code of the RemoteError a call rejects with. */
const remoteCodeOf = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run()
  } catch (error) {
    return remoteErrorOf(error)?.code
  }
  throw new Error('expected the call to reject with a RemoteError')
}

describe('prepareFromMessage', () => {
  it('delegates to the T2 preparation service with the request coordinates', async () => {
    const env = await stubHarness()
    const request: IdeaPrepareRequest = { sessionId: 'session-9', messageId: 'msg-3' }
    await env.idea.prepareFromMessage(request)
    expect(env.prepareFromMessage).toHaveBeenCalledTimes(1)
    expect(env.prepareFromMessage).toHaveBeenCalledWith('session-9', 'msg-3', undefined)
  })

  it('maps T2 failure codes onto the idea/* wire vocabulary', async () => {
    const cases: Array<[IdeaPreparationErrorCode, string]> = [
      ['source-not-found', 'idea/source-not-found'],
      ['source-unavailable', 'idea/source-unavailable'],
      ['model-unavailable', 'idea/model-unavailable'],
      ['model-failed', 'idea/model-failed'],
      ['invalid-model-output', 'idea/invalid-model-output'],
    ]
    for (const [code, expected] of cases) {
      const env = await stubHarness({
        prepareFromMessage: async () => {
          throw new IdeaPreparationError(code, 'offline scripted failure')
        },
      })
      expect(await remoteCodeOf(() => env.idea.prepareFromMessage({ sessionId: 's', messageId: 'm' }))).toBe(expected)
    }
  })

  it('keeps carrier cancellation a cancellation', async () => {
    const env = await stubHarness({
      prepareFromMessage: async () => {
        throw new IdeaPreparationError('request-cancelled', 'aborted')
      },
    })
    expect(await remoteCodeOf(() => env.idea.prepareFromMessage({ sessionId: 's', messageId: 'm' }))).toBe('gateway/cancelled')

    const aborted = new AbortController()
    aborted.abort()
    const other = await stubHarness()
    expect(await remoteCodeOf(() => other.idea.create({ preparationId: 'prep_1' as IdeaPreparationId, draft: draft() }, aborted.signal))).toBe('gateway/cancelled')
    expect(other.create).not.toHaveBeenCalled()
  })

  it('delegates the carrier signal to the T2 call', async () => {
    const env = await stubHarness()
    const controller = new AbortController()
    await env.idea.prepareFromMessage({ sessionId: 's', messageId: 'm' }, controller.signal)
    expect(env.prepareFromMessage).toHaveBeenCalledWith('s', 'm', controller.signal)
  })
})

describe('create', () => {
  it('validates the edited draft before touching the registry or storage', async () => {
    const env = await stubHarness()
    const invalid = draft({ title: '   ' })
    expect(await remoteCodeOf(() => env.idea.create({ preparationId: 'prep_1' as IdeaPreparationId, draft: invalid }))).toBe('idea/invalid-draft')
    expect(env.resolve).not.toHaveBeenCalled()
    expect(env.create).not.toHaveBeenCalled()
  })

  it('never accepts browser source provenance: storage receives the registry source', async () => {
    const env = await stubHarness()
    const edited = draft({ title: 'User edited title' })
    await env.idea.create({ preparationId: 'prep_any' as IdeaPreparationId, draft: edited })
    expect(env.create).toHaveBeenCalledTimes(1)
    const [createDraft, source] = env.create.mock.calls[0] as [unknown, SourceDiscussionDraft]
    expect(createDraft).toEqual(edited)
    expect(source.sessionId).toBe('session-canonical')
    expect(source.anchorMessageId).toBe('msg-canonical')
  })

  it('resolves canonical T2 source through the Host-only registry', async () => {
    const env = await fullHarness()
    const preview = await preparedPreview(env)
    const result = await env.ctx.idea.create({ preparationId: preview.preparationId, draft: preview.draft })
    expect(result.ideaId).toMatch(/^idea_/)
    const aggregate = await env.ctx.ideaService.get(result.ideaId)
    expect(aggregate?.sourceDiscussions[0]?.sessionId).toBe('session-1')
    expect(aggregate?.sourceDiscussions[0]?.anchorMessageId).toBe('a1')
  })

  it('persists exactly one durable Idea on success', async () => {
    const env = await fullHarness()
    const preview = await preparedPreview(env)
    const result = await env.ctx.idea.create({ preparationId: preview.preparationId, draft: draft() })
    expect(await storedBytes(env.root, result.ideaId)).toBeDefined()
    const listed = env.ctx.ideaService.list()
    expect(listed).toHaveLength(1)
  })

  it('returns the retained result for a repeated preparation with zero extra writes', async () => {
    const env = await stubHarness()
    const first = await env.idea.create({ preparationId: 'prep_1' as IdeaPreparationId, draft: draft() })
    const second = await env.idea.create({ preparationId: 'prep_1' as IdeaPreparationId, draft: draft({ title: 'changed' }) })
    expect(second).toEqual(first)
    expect(env.create).toHaveBeenCalledTimes(1)
  })

  it('joins a concurrent commit onto one IdeaService.create', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate
    })
    const env = await stubHarness({
      create: async () => {
        await gate
        return aggregateOf('idea_1', 'idea_ver_1')
      },
    })
    const request = { preparationId: 'prep_1' as IdeaPreparationId, draft: draft() }
    const left = env.idea.create(request)
    const right = env.idea.create(request)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(env.create).toHaveBeenCalledTimes(1)
    release?.()
    expect(await right).toEqual(await left)
  })

  it('keeps a failed durable write retryable', async () => {
    let calls = 0
    const env = await stubHarness({
      create: async () => {
        calls += 1
        if (calls === 1) throw new Error('transient storage outage')
        return aggregateOf('idea_2', 'idea_ver_2', 2)
      },
    })
    const request = { preparationId: 'prep_1' as IdeaPreparationId, draft: draft() }
    expect(await remoteCodeOf(() => env.idea.create(request))).toBe('idea/storage-failed')
    const retry = await env.idea.create(request)
    expect(retry.ideaId).toBe('idea_2')
    expect(env.create).toHaveBeenCalledTimes(2)
  })

  it('maps an unknown or expired preparation to idea/preparation-not-found', async () => {
    const env = await fullHarness()
    const code = await remoteCodeOf(() => env.ctx.idea.create({
      preparationId: 'prep_missing' as IdeaPreparationId,
      draft: draft(),
    }))
    expect(code).toBe('idea/preparation-not-found')
  })

  it('maps a domain storage failure to idea/storage-failed', async () => {
    const env = await stubHarness({
      create: async () => {
        throw Object.assign(new Error('conflict'), { name: 'IdeaError', code: 'version-conflict' })
      },
    })
    expect(await remoteCodeOf(() => env.idea.create({ preparationId: 'prep_1' as IdeaPreparationId, draft: draft() }))).toBe('idea/storage-failed')
  })
})

describe('generated contributions', () => {
  it('loads the generated host registration with every idea method', async () => {
    const { TYPERT } = await import('../lib/typert.host.js')
    expect(TYPERT).toMatchObject({ package: '@dsh-external/dsh-idea' })
    const record = JSON.stringify(TYPERT)
    expect(record).toContain('idea/prepareFromMessage')
    expect(record).toContain('idea/create')
    expect(record).toContain('idea/list')
    expect(record).toContain('idea/get')
    expect(record).toContain('idea/getVersions')
    expect(record).toContain('idea/getVersion')
    expect(record).toContain('idea/continueDiscussion')
    expect(record).toContain('idea/prepareEvolution')
    expect(record).toContain('idea/commitEvolution')
    expect(record).toContain('IdeaRemoteService')
  })

  it('loads the generated remote client contribution with strict codecs', async () => {
    const { default: TYPERT_REMOTE } = await import('../lib/typert.remote-client.js')
    expect(TYPERT_REMOTE).toMatchObject({ package: '@dsh-external/dsh-idea' })
    const descriptors = (TYPERT_REMOTE.descriptors as readonly unknown[]) as Array<{ id: string, cancellation?: unknown, result?: { mode?: string } }>
    expect(descriptors.map(d => d.id).sort()).toEqual([
      '@dsh-external/dsh-idea#idea/archive',
      '@dsh-external/dsh-idea#idea/commitEvolution',
      '@dsh-external/dsh-idea#idea/continueDiscussion',
      '@dsh-external/dsh-idea#idea/create',
      '@dsh-external/dsh-idea#idea/deleteIdea',
      '@dsh-external/dsh-idea#idea/get',
      '@dsh-external/dsh-idea#idea/getVersion',
      '@dsh-external/dsh-idea#idea/getVersions',
      '@dsh-external/dsh-idea#idea/list',
      '@dsh-external/dsh-idea#idea/manualEdit',
      '@dsh-external/dsh-idea#idea/prepareEvolution',
      '@dsh-external/dsh-idea#idea/prepareFromMessage',
      '@dsh-external/dsh-idea#idea/relatedFromMessage',
      '@dsh-external/dsh-idea#idea/restore',
    ])
    for (const descriptor of descriptors) {
      expect(descriptor.result?.mode).toBe('strict')
      // The save/evolution proposal flights are cancellable; the synchronous
      // reads and the durable commit are not.
      const cancellable = descriptor.id.endsWith('#idea/create')
        || descriptor.id.endsWith('#idea/prepareFromMessage')
        || descriptor.id.endsWith('#idea/prepareEvolution')
        || descriptor.id.endsWith('#idea/relatedFromMessage')
      expect(descriptor.cancellation, descriptor.id).toEqual(cancellable ? { parameter: 'signal' } : undefined)
    }
  })
})
