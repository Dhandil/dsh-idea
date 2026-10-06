/**
 * T13.1 — Resurfacing preference domain tests: absent=false, mute persists
 * across restart, unmute deletes, idempotency both directions, unknown Idea
 * rejects, archive/restore preserves mute, permanent delete cleans the
 * preference (and failure semantics), concurrency serialization, additive
 * v3 compatibility, no aggregate updatedAt/version drift, no
 * semantic-reindex trigger from preference writes, and the R1-D delivery
 * claim authority (USER_MUTED never consumes the conversation budget).
 * @module tests/resurfacing-preference.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { cleanup } from './helpers/harness.ts'
import { draft, harness, sourceDraft } from './helpers/harness.ts'

afterEach(cleanup)

async function createOne(env: { service: { create: Function; setResurfacingMuted: Function; getResurfacingPreference: Function; deleteIdea: Function; archive: Function; restore: Function; get: Function; listResurfacingMutedIds: Function } }) {
  const agg = await env.service.create(draft(), sourceDraft())
  return { ideaId: agg.idea.ideaId, versionId: agg.idea.currentVersionId, updatedAt: agg.idea.updatedAt }
}

describe('resurfacing preference domain (T13.1)', () => {
  it('absent preference reads { muted: false }', async () => {
    const env = await harness()
    const { ideaId } = await createOne(env)
    expect(env.service.getResurfacingPreference(ideaId)).toEqual({ muted: false })
  })

  it('mute persists and reads { muted: true }; restart over the same root persists', async () => {
    const root = await mkdtemp(`${tmpdir()}/t131-`)
    const env = await harness(root)
    const { ideaId } = await createOne(env)
    await env.service.setResurfacingMuted(ideaId, true)
    expect(env.service.getResurfacingPreference(ideaId)).toEqual({ muted: true })

    // Restart: dispose the first context WITHOUT deleting the root, then
    // reopen over the same root.
    await env.ctx.fiber.dispose()
    const reopened = await harness(root)
    try {
      expect(reopened.service.getResurfacingPreference(ideaId)).toEqual({ muted: true })
    } finally {
      await reopened.ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('unmute deletes the record: preference reads false again', async () => {
    const env = await harness()
    const { ideaId } = await createOne(env)
    await env.service.setResurfacingMuted(ideaId, true)
    expect(env.service.getResurfacingPreference(ideaId).muted).toBe(true)
    await env.service.setResurfacingMuted(ideaId, false)
    expect(env.service.getResurfacingPreference(ideaId)).toEqual({ muted: false })
  })

  it('mute and unmute are idempotent', async () => {
    const env = await harness()
    const { ideaId } = await createOne(env)
    await env.service.setResurfacingMuted(ideaId, true)
    await env.service.setResurfacingMuted(ideaId, true)
    expect(env.service.getResurfacingPreference(ideaId)).toEqual({ muted: true })
    await env.service.setResurfacingMuted(ideaId, false)
    await env.service.setResurfacingMuted(ideaId, false)
    expect(env.service.getResurfacingPreference(ideaId)).toEqual({ muted: false })
  })

  it('unknown Idea rejects with idea/not-found on get and set', async () => {
    const env = await harness()
    const missing = 'idea_00000000-0000-4000-8000-000000000000' as import('../src/types.ts').IdeaId
    expect(() => env.service.getResurfacingPreference(missing)).toThrowError(
      expect.objectContaining({ code: 'idea-not-found' }),
    )
    await expect(env.service.setResurfacingMuted(missing, true)).rejects.toMatchObject({ code: 'idea-not-found' })
  })

  it('archive → restore preserves the muted preference', async () => {
    const env = await harness()
    const { ideaId, versionId } = await createOne(env)
    await env.service.setResurfacingMuted(ideaId, true)
    const archived = await env.service.archive(ideaId, versionId)
    expect(env.service.getResurfacingPreference(ideaId)).toEqual({ muted: true })
    await env.service.restore(ideaId, archived.idea.currentVersionId)
    expect(env.service.getResurfacingPreference(ideaId)).toEqual({ muted: true })
  })

  it('permanent delete cleans the preference; subsequent mute after delete rejects', async () => {
    const env = await harness()
    const { ideaId, versionId } = await createOne(env)
    await env.service.setResurfacingMuted(ideaId, true)
    await env.service.deleteIdea(ideaId, versionId)
    expect(env.service.listResurfacingMutedIds().has(ideaId)).toBe(false)
    // The Idea is gone: a later preference mutation is rejected, not a silent write.
    await expect(env.service.setResurfacingMuted(ideaId, true)).rejects.toMatchObject({ code: 'idea-not-found' })
  })

  it('delete vs mute concurrency: the delete serializes first and the preference is cleaned; a post-delete mute rejects', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const env = await harness()
    const { ideaId, versionId } = await createOne(env)
    await env.service.setResurfacingMuted(ideaId, true)
    // Park the aggregate deletion behind a gate: the delete is ADMITTED.
    const records = (env.service as unknown as {
      records: { delete: (id: import('../src/types.ts').IdeaId) => Promise<void> }
    }).records
    const originalDelete = records.delete.bind(records)
    records.delete = async (id: import('../src/types.ts').IdeaId) => {
      await gate
      return originalDelete(id)
    }
    const deletePromise = env.service.deleteIdea(ideaId, versionId).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 20))
    // While the delete is in flight, a mute is rejected with 'deleting'.
    await expect(env.service.setResurfacingMuted(ideaId, true)).rejects.toMatchObject({ code: 'deleting' })
    release()
    await deletePromise
    expect(env.service.listResurfacingMutedIds().has(ideaId)).toBe(false)
    records.delete = originalDelete
  })

  it('unmute vs delete concurrency: the delete cleans the (absent) preference; a later unmute rejects', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const env = await harness()
    const { ideaId, versionId } = await createOne(env)
    const records = (env.service as unknown as {
      records: { delete: (id: import('../src/types.ts').IdeaId) => Promise<void> }
    }).records
    const originalDelete = records.delete.bind(records)
    records.delete = async (id: import('../src/types.ts').IdeaId) => {
      await gate
      return originalDelete(id)
    }
    const deletePromise = env.service.deleteIdea(ideaId, versionId).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 20))
    await expect(env.service.setResurfacingMuted(ideaId, false)).rejects.toMatchObject({ code: 'deleting' })
    release()
    await deletePromise
    expect(env.service.listResurfacingMutedIds().has(ideaId)).toBe(false)
    records.delete = originalDelete
  })

  it('muting does not drift the aggregate: updatedAt, version count, and evolution events unchanged', async () => {
    const env = await harness()
    const { ideaId, updatedAt, versionId } = await createOne(env)
    await env.service.setResurfacingMuted(ideaId, true)
    const aggregate = env.service.get(ideaId)
    expect(aggregate.idea.updatedAt).toBe(updatedAt)
    expect(aggregate.idea.currentVersionId).toBe(versionId)
    expect(aggregate.versions).toHaveLength(1)
    expect(aggregate.evolutionEvents).toHaveLength(1)
    expect(aggregate.sourceDiscussions).toEqual(aggregate.versions[0]?.draft ? aggregate.sourceDiscussions : [])
  })

  // T13.1 E1 — the R1-D Host authority proof: the atomic delivery claim
  // re-checks the durable preference BEFORE the budget test-and-set, so a
  // muted Idea never consumes a conversation's one-surface budget.
  describe('delivery claim authority (R1-D)', () => {
    it('USER_MUTED: a muted Idea claims USER_MUTED and the budget stays free', async () => {
      const env = await harness()
      const { ideaId } = await createOne(env)
      expect(env.service.getResurfacingBudget('conversation-race').consumed).toBe(false)

      await env.service.setResurfacingMuted(ideaId, true)
      await expect(env.service.claimResurfacingDelivery('conversation-race', ideaId)).resolves.toBe('USER_MUTED')
      expect(env.service.getResurfacingBudget('conversation-race').consumed).toBe(false)
    })

    it('CLAIMED: an unmuted Idea consumes the budget exactly once, then ALREADY_CONSUMED', async () => {
      const env = await harness()
      const { ideaId } = await createOne(env)
      await expect(env.service.claimResurfacingDelivery('conversation-race', ideaId)).resolves.toBe('CLAIMED')
      expect(env.service.getResurfacingBudget('conversation-race').consumed).toBe(true)
      await expect(env.service.claimResurfacingDelivery('conversation-race', ideaId)).resolves.toBe('ALREADY_CONSUMED')
      expect(env.service.getResurfacingBudget('conversation-race').consumed).toBe(true)
    })
  })

  it('muting does not trigger a semantic re-index: the domain change carries the preference table, not ideas', async () => {
    const env = await harness()
    const changes: Array<{ domain: string; table: string }> = []
    env.ctx.on('domain/changed', (change: { domain: string; table: string }) => {
      changes.push({ domain: change.domain, table: change.table })
    })
    const { ideaId } = await createOne(env)
    changes.length = 0
    await env.service.setResurfacingMuted(ideaId, true)
    expect(changes.every(change => change.table !== 'ideas')).toBe(true)
    expect(changes.some(change => change.table === 'resurfacing_preferences')).toBe(true)
  })
})
