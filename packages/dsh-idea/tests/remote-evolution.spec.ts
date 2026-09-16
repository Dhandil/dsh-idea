/**
 * The `idea.prepareEvolution` / `idea.commitEvolution` Remote paths: the
 * preview projection is JSON-representable and preparing writes nothing
 * durable; unknown discussions, unknown proposals, stale bases, invalid
 * drafts, and failing model calls map onto the plugin wire vocabulary. All
 * offline — the LLM/session seams are scripted fakes and the storage stack
 * is local json over a temp root.
 * @module tests/remote-evolution.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { textStream } from './helpers/preparation.ts'
import { evolutionDraft, evolutionHarness, seedDiscussion } from './helpers/evolution.ts'
import { cleanup, storedBytes } from './helpers/harness.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import IdeaRelatedService from '../src/related/index.ts'
import { IdeaId, IdeaVersionId } from '../src/types.ts'

afterEach(cleanup)

const draftText = JSON.stringify(evolutionDraft())

/** Evolution stack plus the mounted remote controller. */
async function remoteHarness() {
  const env = await evolutionHarness()
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('evolution never resolves preparations') } },
  } as never)
  await env.ctx.plugin(IdeaRelatedService)
  await env.ctx.plugin(IdeaRemoteService)
  return { ...env, idea: env.ctx.idea }
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

describe('idea.prepareEvolution', () => {
  it('returns a JSON-representable preview and writes nothing durable', async () => {
    const env = await remoteHarness()
    const { ideaId, discussion } = await seedDiscussion(env)
    const before = await storedBytes(env.root, ideaId)
    env.llm.enqueueChunks(textStream(draftText))

    const preview = await env.idea.prepareEvolution({ discussionId: discussion.discussionId })

    expect(JSON.parse(JSON.stringify(preview)) as unknown).toEqual(preview)
    expect(Object.keys(preview).sort()).toEqual(['baseVersionId', 'draft', 'ideaId', 'proposalId', 'reason'])
    expect(preview.proposalId).toMatch(/^evo_/)
    expect(preview.ideaId).toBe(ideaId)
    expect(preview.reason).toBe('continued-discussion')
    expect(await storedBytes(env.root, ideaId)).toEqual(before)
    expect(env.ideaService.get(ideaId).versions).toHaveLength(1)
  })

  it('maps an unknown discussion onto idea/discussion-not-found', async () => {
    const env = await remoteHarness()
    expect(await remoteCodeOf(() => env.idea.prepareEvolution({ discussionId: 'idea_disc_absent' })))
      .toBe('idea/discussion-not-found')
    expect(env.llm.calls).toHaveLength(0)
  })

  it('maps a discussion whose base version is superseded onto idea/version-conflict', async () => {
    const env = await remoteHarness()
    const { ideaId, discussion } = await seedDiscussion(env)
    await env.ideaService.evolve(
      ideaId,
      evolutionDraft(),
      { sessionId: 'conversation-1', capturedContext: [{ role: 'user' as const, text: 'superseding edit' }] },
      discussion.baseVersionId,
      'manual-edit',
    )
    const before = await storedBytes(env.root, ideaId)

    expect(await remoteCodeOf(() => env.idea.prepareEvolution({ discussionId: discussion.discussionId })))
      .toBe('idea/version-conflict')
    expect(env.llm.calls).toHaveLength(0)
    expect(await storedBytes(env.root, ideaId)).toEqual(before)
    expect(env.ideaService.get(ideaId).versions).toHaveLength(2)
  })

  it('maps an unreadable conversation onto idea/source-unavailable', async () => {    const env = await remoteHarness()
    const { discussion } = await seedDiscussion(env, [])
    // A surface whose only event is a system message carries no usable text.
    env.sessionQuery.add(discussion.conversationId, [{
      type: 'system/message',
      seq: 1,
      time: 0,
      data: { message: { role: 'system', content: [{ type: 'text', text: 'system' }] } },
    } as never])

    expect(await remoteCodeOf(() => env.idea.prepareEvolution({ discussionId: discussion.discussionId })))
      .toBe('idea/source-unavailable')
  })

  it('maps a failing model call onto idea/model-failed', async () => {
    const env = await remoteHarness()
    const { discussion } = await seedDiscussion(env)
    env.llm.enqueueFailure(new Error('transport reset'))

    expect(await remoteCodeOf(() => env.idea.prepareEvolution({ discussionId: discussion.discussionId })))
      .toBe('idea/model-failed')
  })

  it('delegates the carrier signal to the evolution service', async () => {
    const env = await remoteHarness()
    const { discussion } = await seedDiscussion(env)
    env.llm.enqueueChunks(textStream(draftText))
    const controller = new AbortController()

    await env.idea.prepareEvolution({ discussionId: discussion.discussionId }, controller.signal)

    expect(env.llm.calls[0]?.signal).toBe(controller.signal)
  })
})

describe('idea.commitEvolution', () => {
  it('validates the approved draft before touching the proposal', async () => {
    const env = await remoteHarness()
    const { discussion } = await seedDiscussion(env)
    env.llm.enqueueChunks(textStream(draftText))
    const preview = await env.idea.prepareEvolution({ discussionId: discussion.discussionId })
    const before = await storedBytes(env.root, preview.ideaId)

    const invalid = evolutionDraft()
    ;(invalid as { title: string }).title = '   '

    expect(await remoteCodeOf(() => env.idea.commitEvolution({
      proposalId: preview.proposalId,
      expectedCurrentVersionId: preview.baseVersionId,
      draft: invalid,
    }))).toBe('idea/invalid-draft')
    expect(await storedBytes(env.root, preview.ideaId)).toEqual(before)
  })

  it('projects the committed version identity onto the wire', async () => {
    const env = await remoteHarness()
    const { discussion } = await seedDiscussion(env)
    env.llm.enqueueChunks(textStream(draftText))
    const preview = await env.idea.prepareEvolution({ discussionId: discussion.discussionId })

    const result = await env.idea.commitEvolution({
      proposalId: preview.proposalId,
      expectedCurrentVersionId: preview.baseVersionId,
      draft: evolutionDraft(),
    })

    expect(JSON.parse(JSON.stringify(result)) as unknown).toEqual(result)
    expect(Object.keys(result).sort()).toEqual(['currentVersionId', 'ideaId', 'ordinal', 'status', 'title'])
    expect(result).toEqual({
      ideaId: preview.ideaId,
      currentVersionId: expect.any(String),
      ordinal: 2,
      title: evolutionDraft().title,
      status: 'active',
    })
    expect(env.ideaService.get(IdeaId(preview.ideaId)).versions).toHaveLength(2)
  })

  it('maps an unknown proposal onto idea/proposal-not-found', async () => {
    const env = await remoteHarness()
    const { ideaId } = await seedDiscussion(env)

    expect(await remoteCodeOf(() => env.idea.commitEvolution({
      proposalId: 'evo_absent',
      expectedCurrentVersionId: env.ideaService.get(ideaId).idea.currentVersionId,
      draft: evolutionDraft(),
    }))).toBe('idea/proposal-not-found')
    expect(env.ideaService.get(ideaId).versions).toHaveLength(1)
  })

  it('maps a stale proposal onto idea/version-conflict with zero partial writes', async () => {
    const env = await remoteHarness()
    const { ideaId, discussion } = await seedDiscussion(env)
    env.llm.enqueueChunks(textStream(draftText))
    const preview = await env.idea.prepareEvolution({ discussionId: discussion.discussionId })

    await env.ideaService.evolve(
      ideaId,
      evolutionDraft(),
      {
        sessionId: 'conversation-1',
        capturedContext: [{ role: 'user' as const, text: 'one more exchange to supersede the proposal' }],
      },
      preview.baseVersionId as IdeaVersionId,
      'manual-edit',
    )
    const before = await storedBytes(env.root, ideaId)

    expect(await remoteCodeOf(() => env.idea.commitEvolution({
      proposalId: preview.proposalId,
      expectedCurrentVersionId: preview.baseVersionId,
      draft: evolutionDraft(),
    }))).toBe('idea/version-conflict')
    expect(await storedBytes(env.root, ideaId)).toEqual(before)
  })

  it('rejects a second commit of the same proposal without a second version', async () => {
    const env = await remoteHarness()
    const { ideaId, discussion } = await seedDiscussion(env)
    env.llm.enqueueChunks(textStream(draftText))
    const preview = await env.idea.prepareEvolution({ discussionId: discussion.discussionId })
    const request = {
      proposalId: preview.proposalId,
      expectedCurrentVersionId: preview.baseVersionId,
      draft: evolutionDraft(),
    }

    await env.idea.commitEvolution(request)

    expect(await remoteCodeOf(() => env.idea.commitEvolution(request))).toBe('idea/proposal-not-found')
    expect(env.ideaService.get(ideaId).versions).toHaveLength(2)
  })
})
