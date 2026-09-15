/**
 * T5.2 Continue Discussion over the real storage stack: continuing an Idea
 * creates one discussion workspace (with its `idea-continuation` seed)
 * through the caller-supplied conversation seam, reuses the active
 * discussion for the same base version instead of creating another one,
 * opens a fresh workspace after the Idea evolved, rejects unknown ideas
 * without invoking the seam, and never mutates the Idea aggregate. No
 * provider, network, or model call — local json over a temp root.
 * @module tests/discussion.spec
 */

import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdeaId } from '../src/types.ts'
import { cleanup, draft, harness, sourceDraft, storedAggregate, storedBytes } from './helpers/harness.ts'

afterEach(cleanup)

/** One idea plus a conversation seam spy returning distinct session ids. */
async function continuedHarness() {
  const env = await harness()
  const created = await env.service.create(draft(), sourceDraft())
  let conversations = 0
  const createConversation = vi.fn(async (): Promise<string> => {
    conversations += 1
    return `session-continued-${conversations}`
  })
  return { ...env, created, createConversation }
}

describe('creating a discussion', () => {
  it('creates one active workspace for the current version with its context seed', async () => {
    const { service, created, createConversation } = await continuedHarness()

    const discussion = await service.continueDiscussion(created.idea.ideaId, createConversation)

    expect(createConversation).toHaveBeenCalledTimes(1)
    expect(discussion.ideaId).toBe(created.idea.ideaId)
    expect(discussion.conversationId).toBe('session-continued-1')
    expect(discussion.baseVersionId).toBe(created.idea.currentVersionId)
    expect(discussion.status).toBe('active')
    const stored = service.get(created.idea.ideaId)
    expect(discussion.baseVersionId).toBe(stored.idea.currentVersionId)
    expect(discussion.context).toEqual({
      type: 'idea-continuation',
      idea: {
        id: created.idea.ideaId,
        title: draft().title,
        currentVersion: created.idea.currentVersionId,
        draft: draft(),
        historySummary: [{
          ordinal: 1,
          reason: 'initial-save',
          title: draft().title,
          createdAt: created.versions[0]!.createdAt,
        }],
        openQuestions: [...draft().openQuestions],
      },
    })
  })

  it('persists the workspace as its own record, keyed by the discussion id', async () => {
    const { root, service, created, createConversation } = await continuedHarness()

    const discussion = await service.continueDiscussion(created.idea.ideaId, createConversation)

    const document = JSON.parse(
      await readFile(`${root}/idea/discussions/${discussion.discussionId}.json`, 'utf8'),
    ) as { version: number; record: { conversationId: string; context: { type: string } } }
    expect(document.version).toBe(2)
    expect(document.record.conversationId).toBe('session-continued-1')
    expect(document.record.context.type).toBe('idea-continuation')
    expect(await storedAggregate(root, created.idea.ideaId)).toBeDefined()
  })

  it('carries no captured transcript in the context seed', async () => {
    const { service, created, createConversation } = await continuedHarness()

    const discussion = await service.continueDiscussion(created.idea.ideaId, createConversation)
    const flat = JSON.stringify(discussion.context)

    expect(flat).not.toContain('capturedContext')
    expect(flat).not.toContain('sessionId')
    expect(flat).not.toContain(sourceDraft().capturedContext[0]!.text)
    expect(Object.keys(discussion.context.idea).sort()).toEqual([
      'currentVersion', 'draft', 'historySummary', 'id', 'openQuestions', 'title',
    ])
  })
})

describe('idempotency', () => {
  it('reuses the active discussion for the same idea and version', async () => {
    const { service, created, createConversation } = await continuedHarness()
    const first = await service.continueDiscussion(created.idea.ideaId, createConversation)

    const second = await service.continueDiscussion(created.idea.ideaId, createConversation)

    expect(second).toEqual(first)
    expect(createConversation).toHaveBeenCalledTimes(1)
  })

  it('opens a new workspace after the idea evolved, from the new base version', async () => {
    const { service, created, createConversation } = await continuedHarness()
    const first = await service.continueDiscussion(created.idea.ideaId, createConversation)
    const evolved = await service.evolve(
      created.idea.ideaId,
      draft({ title: 'v2' }),
      sourceDraft(),
      created.idea.currentVersionId,
      'continued-discussion',
    )

    const second = await service.continueDiscussion(created.idea.ideaId, createConversation)

    expect(createConversation).toHaveBeenCalledTimes(2)
    expect(second.discussionId).not.toBe(first.discussionId)
    expect(second.baseVersionId).toBe(evolved.idea.currentVersionId)
    expect(second.context.idea.currentVersion).toBe(evolved.idea.currentVersionId)
    expect(second.context.idea.draft.title).toBe('v2')
    expect(second.context.idea.historySummary.map(entry => entry.ordinal)).toEqual([1, 2])
  })
})

describe('boundaries', () => {
  it('rejects an unknown idea with idea-not-found and never creates a conversation', async () => {
    const { service, createConversation } = await continuedHarness()

    await expect(async () =>
      service.continueDiscussion(IdeaId('idea_absent'), createConversation))
      .rejects.toMatchObject({ name: 'IdeaError', code: 'idea-not-found' })
    expect(createConversation).not.toHaveBeenCalled()
  })

  it('never mutates the idea: the stored aggregate stays byte-identical', async () => {
    const { root, service, created, createConversation } = await continuedHarness()
    const before = await storedBytes(root, created.idea.ideaId)
    const aggregateBefore = structuredClone(service.get(created.idea.ideaId))

    await service.continueDiscussion(created.idea.ideaId, createConversation)

    expect((await storedBytes(root, created.idea.ideaId))?.equals(before!)).toBe(true)
    expect(service.get(created.idea.ideaId)).toEqual(aggregateBefore)
  })
})
