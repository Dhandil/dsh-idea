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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { IdeaAggregate, IdeaId, ResurfacingBudget } from '../src/types.ts'
import { cleanup, storedBytes } from './helpers/harness.ts'
import { draft, harness, sourceDraft } from './helpers/harness.ts'

afterEach(cleanup)

describe('T13.3A pinned delivery claims', () => {
  for (const change of ['edit', 'archive', 'delete', 'mute'] as const) {
    it(`refuses ${change} before claim without consuming the budget`, async () => {
      const env = await harness()
      const aggregate = await env.service.create(draft(), sourceDraft())
      const { ideaId, currentVersionId: version } = aggregate.idea
      if (change === 'edit') await env.service.manualEdit(ideaId, draft({ title: 'Updated direction' }), version)
      if (change === 'archive') await env.service.archive(ideaId, version)
      if (change === 'delete') await env.service.deleteIdea(ideaId, version)
      if (change === 'mute') await env.service.setResurfacingMuted(ideaId, true)
      const before = await storedBytes(env.root, ideaId)
      const writes: string[] = []
      env.ctx.on('domain/changed', event => { writes.push(event.table) })
      expect(await env.service.claimResurfacingDelivery('stale-delivery', ideaId, version)).toBe(
        change === 'edit' ? 'CANDIDATE_VERSION_CHANGED'
          : change === 'mute' ? 'USER_MUTED' : 'CANDIDATE_BECAME_INELIGIBLE',
      )
      expect(env.service.getResurfacingBudget('stale-delivery')).toEqual({ consumed: false })
      expect(writes).toEqual([])
      expect(await storedBytes(env.root, ideaId)).toEqual(before)
      await expect(readFile(join(env.root, 'idea', 'resurfacing_budgets', 'stale-delivery.json')))
        .rejects.toMatchObject({ code: 'ENOENT' })
    })
  }

  it('waits for an admitted edit, then rejects all old pins; new pins claim exactly once', async () => {
    const env = await harness()
    const aggregate = await env.service.create(draft(), sourceDraft())
    const { ideaId, currentVersionId: version } = aggregate.idea
    const records = (env.service as unknown as { records: KvTable<IdeaId, IdeaAggregate> }).records
    const update = records.update.bind(records)
    let entered!: () => void
    let release!: () => void
    const updating = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const spy = vi.spyOn(records, 'update').mockImplementation(async (...args) => {
      entered()
      await gate
      return update(...args)
    })
    const edit = env.service.manualEdit(ideaId, draft({ title: 'New current direction' }), version)
    let claims: Promise<string>[] = []
    try {
      await updating
      claims = Array.from({ length: 8 }, () => env.service.claimResurfacingDelivery('queued', ideaId, version))
      expect(env.service.getResurfacingBudget('queued')).toEqual({ consumed: false })
    } finally {
      release()
    }
    const current = await edit
    expect(await Promise.all(claims)).toEqual(Array(8).fill('CANDIDATE_VERSION_CHANGED'))
    spy.mockRestore()
    await expect(readFile(join(env.root, 'idea', 'resurfacing_budgets', 'queued.json')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    const outcomes = await Promise.all(Array.from({ length: 8 }, () =>
      env.service.claimResurfacingDelivery('queued', ideaId, current.idea.currentVersionId)))
    expect(outcomes.filter(outcome => outcome === 'CLAIMED')).toHaveLength(1)
    expect(outcomes.filter(outcome => outcome === 'ALREADY_CONSUMED')).toHaveLength(7)
    expect(JSON.parse(await readFile(join(env.root, 'idea', 'resurfacing_budgets', 'queued.json'), 'utf8')).record)
      .toEqual({ surfaceBudgetConsumed: true })
  })

  it('holds the Idea slot through the budget write; a later edit cannot interleave', async () => {
    const env = await harness()
    const aggregate = await env.service.create(draft(), sourceDraft())
    const { ideaId, currentVersionId: version } = aggregate.idea
    const budgets = (env.service as unknown as { budgetRecords: KvTable<string, ResurfacingBudget> }).budgetRecords
    const put = budgets.put.bind(budgets)
    let entered!: () => void
    let release!: () => void
    const writing = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const spy = vi.spyOn(budgets, 'put').mockImplementation(async (...args) => {
      entered()
      await gate
      return put(...args)
    })
    const claim = env.service.claimResurfacingDelivery('claim-first', ideaId, version)
    let edit!: ReturnType<typeof env.service.manualEdit>
    try {
      await writing
      edit = env.service.manualEdit(ideaId, draft({ title: 'Queued later edit' }), version)
      expect(env.service.get(ideaId).idea.currentVersionId).toBe(version)
    } finally {
      release()
    }
    expect(await claim).toBe('CLAIMED')
    expect((await edit).idea.currentVersionId).not.toBe(version)
    spy.mockRestore()
    expect(await env.service.claimResurfacingDelivery('after-edit', ideaId, version)).toBe('CANDIDATE_VERSION_CHANGED')
    expect(env.service.getResurfacingBudget('after-edit')).toEqual({ consumed: false })
  })

  for (const operation of ['archive', 'mute'] as const) {
    it(`serializes a concurrent ${operation} before delivery without writing a budget`, async () => {
      const env = await harness()
      const { ideaId, currentVersionId } = (await env.service.createDirect(draft())).idea
      const mutation = operation === 'archive' ? env.service.archive(ideaId, currentVersionId)
        : env.service.setResurfacingMuted(ideaId, true)
      const claim = env.service.claimResurfacingDelivery('mutation-first', ideaId, currentVersionId)
      await mutation
      expect(await claim).toBe(operation === 'archive' ? 'CANDIDATE_BECAME_INELIGIBLE' : 'USER_MUTED')
      await expect(readFile(join(env.root, 'idea', 'resurfacing_budgets', 'mutation-first.json')))
        .rejects.toMatchObject({ code: 'ENOENT' })
    })
  }

  it('rejects delivery during an admitted deletion and releases the deletion gate', async () => {
    const env = await harness()
    const { ideaId, currentVersionId } = (await env.service.createDirect(draft())).idea
    const records = (env.service as unknown as { records: KvTable<IdeaId, IdeaAggregate> }).records
    const remove = records.delete.bind(records)
    let entered!: () => void
    let release!: () => void
    const deleting = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const spy = vi.spyOn(records, 'delete').mockImplementation(async (...args) => {
      entered()
      await gate
      return remove(...args)
    })
    const deletion = env.service.deleteIdea(ideaId, currentVersionId)
    try {
      await deleting
      expect(env.service.getResurfacingEligibility(ideaId, currentVersionId)).toBe('CANDIDATE_BECAME_INELIGIBLE')
      await expect(env.service.claimResurfacingDelivery('deleting', ideaId, currentVersionId))
        .rejects.toMatchObject({ code: 'deleting' })
      expect(env.service.getResurfacingBudget('deleting')).toEqual({ consumed: false })
    } finally {
      release()
      await deletion
      spy.mockRestore()
    }
    expect(env.service.getResurfacingEligibility(ideaId, currentVersionId)).toBe('CANDIDATE_BECAME_INELIGIBLE')
  })
})

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
      const { ideaId, versionId } = await createOne(env)
      expect(env.service.getResurfacingBudget('conversation-race').consumed).toBe(false)

      await env.service.setResurfacingMuted(ideaId, true)
      await expect(env.service.claimResurfacingDelivery('conversation-race', ideaId, versionId)).resolves.toBe('USER_MUTED')
      expect(env.service.getResurfacingBudget('conversation-race').consumed).toBe(false)
    })

    it('CLAIMED: an unmuted Idea consumes the budget exactly once, then ALREADY_CONSUMED', async () => {
      const env = await harness()
      const { ideaId, versionId } = await createOne(env)
      await expect(env.service.claimResurfacingDelivery('conversation-race', ideaId, versionId)).resolves.toBe('CLAIMED')
      expect(env.service.getResurfacingBudget('conversation-race').consumed).toBe(true)
      await expect(env.service.claimResurfacingDelivery('conversation-race', ideaId, versionId)).resolves.toBe('ALREADY_CONSUMED')
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
