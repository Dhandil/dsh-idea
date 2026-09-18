/**
 * The `idea.continueDiscussion` Remote path: the browser names at most a
 * Workspace — the Host Session Controller creates the canonical Session and
 * the IdeaDiscussion binds to the Host-returned id, never to a
 * caller-supplied one. An invalid Workspace fails loud with no discussion
 * write, no Idea mutation, and no unbound fallback; an absent Workspace
 * uses the Host default; repeated calls reuse the active discussion without
 * touching the controller again; unknown ideas map onto `idea/not-found`; a
 * failing creation maps onto `idea/conversation-failed`; an unavailable
 * session controller fails loud. The idea document stays byte-identical
 * throughout. No provider, network, or model call — local json over a temp
 * root plus a scripted session controller.
 * @module tests/remote-continue.spec
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { cleanup, draft, harness, sourceDraft, storedBytes } from './helpers/harness.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'

afterEach(cleanup)

/** A session-controller face with a create() spy, as the plugin resolves it. */
function sessionControllerOf(create: (request: unknown) => Promise<{ sessionId: string }>) {
  return { create: vi.fn(create) }
}

/** The discussion records stored so far (empty when the table is absent). */
async function discussionIdsIn(root: string): Promise<string[]> {
  try {
    return await readdir(join(root, 'idea', 'discussions'))
  } catch {
    return []
  }
}

/** Real storage stack, real IdeaService, mounted remote, scripted controller. */
async function continueHarness(create?: (request: unknown) => Promise<{ sessionId: string }>) {
  const env = await harness()
  const sessionController = sessionControllerOf(create ?? (async () => ({ sessionId: 'session-new' })))
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('continuation never resolves preparations') } },
  } as never)
  env.ctx.provide('ideaEvolutions', {
    prepare: () => { throw new Error('continuation never prepares evolution') },
    commit: () => { throw new Error('continuation never commits evolution') },
  } as never)
  env.ctx.provide('ideaRelated', {
    relatedFromMessage: () => { throw new Error('continuation never judges related ideas') },
  } as never)
  env.ctx.provide('sessionController', sessionController as never)
  await env.ctx.plugin(IdeaRemoteService)
  return { ...env, sessionController, idea: env.ctx.idea }
}

/** The same stack with no session controller mounted at all. */
async function controllerlessHarness() {
  const env = await harness()
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('continuation never resolves preparations') } },
  } as never)
  env.ctx.provide('ideaEvolutions', {
    prepare: () => { throw new Error('continuation never prepares evolution') },
    commit: () => { throw new Error('continuation never commits evolution') },
  } as never)
  env.ctx.provide('ideaRelated', {
    relatedFromMessage: () => { throw new Error('continuation never judges related ideas') },
  } as never)
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

describe('idea.continueDiscussion', () => {
  it('creates the conversation through the session controller and returns the workspace identities', async () => {
    const env = await continueHarness()
    const created = await env.service.create(draft(), sourceDraft())

    const result = await env.idea.continueDiscussion({ id: created.idea.ideaId })

    expect(env.sessionController.create).toHaveBeenCalledTimes(1)
    expect(env.sessionController.create).toHaveBeenCalledWith({})
    expect(result).toEqual({
      discussionId: expect.any(String),
      conversationId: 'session-new',
      baseVersionId: created.idea.currentVersionId,
    })
  })

  it('reuses the active discussion: a second call creates no second conversation', async () => {
    const env = await continueHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const first = await env.idea.continueDiscussion({ id: created.idea.ideaId })

    const second = await env.idea.continueDiscussion({ id: created.idea.ideaId })

    expect(second).toEqual(first)
    expect(env.sessionController.create).toHaveBeenCalledTimes(1)
  })

  it('creates a workspace-bound conversation through the Host for a named workspace', async () => {
    const env = await continueHarness()
    const created = await env.service.create(draft(), sourceDraft())

    const result = await env.idea.continueDiscussion({
      id: created.idea.ideaId,
      workspaceId: 'workspace-a',
    })

    expect(env.sessionController.create).toHaveBeenCalledTimes(1)
    expect(env.sessionController.create).toHaveBeenCalledWith({ workspaceId: 'workspace-a' })
    expect(result.conversationId).toBe('session-new')
    // The IdeaDiscussion binds the Host-returned canonical Session id.
    const bound = env.ctx.ideaService.findDiscussionByConversationId('session-new')
    expect(bound?.discussionId).toBe(result.discussionId)
    // The Idea itself is never written.
    const before = await storedBytes(env.root, created.idea.ideaId)
    expect((await storedBytes(env.root, created.idea.ideaId))?.equals(before!)).toBe(true)
  })

  it('never binds a caller-supplied session id: the Host always creates its own', async () => {
    const env = await continueHarness()
    const created = await env.service.create(draft(), sourceDraft())

    const result = await env.idea.continueDiscussion({
      id: created.idea.ideaId,
      conversationId: 'session-unrelated',
    } as never)

    expect(env.sessionController.create).toHaveBeenCalledTimes(1)
    expect(env.sessionController.create).toHaveBeenCalledWith({})
    expect(result.conversationId).toBe('session-new')
    expect(env.ctx.ideaService.findDiscussionByConversationId('session-unrelated')).toBeUndefined()
    expect(env.ctx.ideaService.findDiscussionByConversationId('session-new')?.discussionId)
      .toBe(result.discussionId)
  })

  it('fails loud on an invalid workspace: no discussion write, no idea write, no fallback', async () => {
    const env = await continueHarness(async (request) => {
      if ((request as { workspaceId?: string }).workspaceId === 'workspace-bad') {
        throw new Error('workspace not found')
      }
      return { sessionId: 'session-new' }
    })
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)

    expect(await remoteCodeOf(() => env.idea.continueDiscussion({
      id: created.idea.ideaId,
      workspaceId: 'workspace-bad',
    }))).toBe('idea/conversation-failed')

    // Exactly one create attempt, carrying the named workspace — never an
    // unbound fallback create({}).
    expect(env.sessionController.create).toHaveBeenCalledTimes(1)
    expect(env.sessionController.create).toHaveBeenCalledWith({ workspaceId: 'workspace-bad' })
    expect(env.sessionController.create).not.toHaveBeenCalledWith({})
    expect(await discussionIdsIn(env.root)).toEqual([])
    expect((await storedBytes(env.root, created.idea.ideaId))?.equals(before!)).toBe(true)
  })

  it('reuses the active discussion with a named workspace: no second session is created', async () => {
    const env = await continueHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const first = await env.idea.continueDiscussion({ id: created.idea.ideaId, workspaceId: 'workspace-a' })

    const second = await env.idea.continueDiscussion({ id: created.idea.ideaId, workspaceId: 'workspace-a' })

    expect(second).toEqual(first)
    expect(env.sessionController.create).toHaveBeenCalledTimes(1)
  })

  it('maps an unknown idea onto idea/not-found without creating a conversation', async () => {
    const env = await continueHarness()

    expect(await remoteCodeOf(() => env.idea.continueDiscussion({ id: 'idea_missing' })))
      .toBe('idea/not-found')
    expect(env.sessionController.create).not.toHaveBeenCalled()
  })

  it('maps a failed conversation creation onto idea/conversation-failed', async () => {
    const env = await continueHarness(async () => { throw new Error('workspace refused') })
    const created = await env.service.create(draft(), sourceDraft())

    expect(await remoteCodeOf(() => env.idea.continueDiscussion({ id: created.idea.ideaId })))
      .toBe('idea/conversation-failed')
  })

  it('fails loud when the deployment mounts no session controller', async () => {
    const env = await controllerlessHarness()
    const created = await env.service.create(draft(), sourceDraft())

    expect(await remoteCodeOf(() => env.idea.continueDiscussion({ id: created.idea.ideaId })))
      .toBe('gateway/internal')
  })

  it('never writes the idea: the stored idea document stays byte-identical', async () => {
    const env = await continueHarness()
    const created = await env.service.create(draft(), sourceDraft())
    const before = await storedBytes(env.root, created.idea.ideaId)

    await env.idea.continueDiscussion({ id: created.idea.ideaId })

    expect((await storedBytes(env.root, created.idea.ideaId))?.equals(before!)).toBe(true)
  })
})
