/**
 * Host-side tests for the T10 persistence repair: the durable one-surface
 * resurfacing budget over the additive `resurfacing_budgets` table of the
 * unchanged `idea/v3` domain. Proves the atomic same-Host claim through the
 * per-conversation mutation tail (exactly one CLAIMED under concurrent
 * same-session claims, one durable record, per-session independence), the
 * persistence round-trip across a full dispose/reopen over the real json
 * backend (frozen minimal document, existing ideas/discussions records
 * still readable), and additive compatibility with pre-repair idea/v3
 * persisted data (existing records unchanged, budget table begins empty,
 * domain version stays 3, no migration). No provider, model, or network.
 * @module tests/resurfacing-budget.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ideaDomainSpec } from '../src/spec.ts'
import { EvolutionEventId, IdeaDiscussionId, IdeaId, IdeaVersionId, SourceDiscussionId } from '../src/types.ts'
import type { IdeaAggregate, IdeaDiscussion } from '../src/types.ts'
import { cleanup, draft, harness, sourceDraft } from './helpers/harness.ts'

afterEach(cleanup)

/** The on-disk per-record directory of the budget table under a root. */
const budgetTableDir = (root: string): string => join(root, ideaDomainSpec.name, 'resurfacing_budgets')

/** A structurally valid version-3 aggregate fixture. */
const fixtureAggregate = (): IdeaAggregate => ({
  idea: {
    ideaId: IdeaId('idea-fixture'),
    currentVersionId: IdeaVersionId('idea-ver-1'),
    status: 'active',
    createdAt: 100,
    updatedAt: 100,
  },
  versions: [{
    versionId: IdeaVersionId('idea-ver-1'),
    ideaId: IdeaId('idea-fixture'),
    ordinal: 1,
    draft: draft(),
    reason: 'initial-save',
    sourceDiscussionIds: [SourceDiscussionId('idea-src-1')],
    createdAt: 100,
  }],
  sourceDiscussions: [{
    sourceDiscussionId: SourceDiscussionId('idea-src-1'),
    ideaId: IdeaId('idea-fixture'),
    sessionId: 'session-fixture',
    anchorMessageId: 'msg-1',
    startSeq: 1,
    endSeq: 2,
    capturedContext: [
      { role: 'user', text: 'question' },
      { role: 'assistant', text: 'answer' },
    ],
    capturedAt: 100,
  }],
  evolutionEvents: [{
    evolutionEventId: EvolutionEventId('idea-evo-1'),
    ideaId: IdeaId('idea-fixture'),
    toVersionId: IdeaVersionId('idea-ver-1'),
    reason: 'initial-save',
    createdAt: 100,
  }],
})

/** A structurally valid continued-discussion fixture over the aggregate. */
const fixtureDiscussion = (): IdeaDiscussion => ({
  discussionId: IdeaDiscussionId('discussion-fixture'),
  ideaId: IdeaId('idea-fixture'),
  conversationId: 'conversation-fixture',
  baseVersionId: IdeaVersionId('idea-ver-1'),
  status: 'active',
  createdAt: 200,
  context: {
    type: 'idea-continuation',
    idea: {
      id: IdeaId('idea-fixture'),
      title: draft().title,
      currentVersion: IdeaVersionId('idea-ver-1'),
      draft: draft(),
      historySummary: [{ ordinal: 1, reason: 'initial-save', title: draft().title, createdAt: 100 }],
      openQuestions: [...draft().openQuestions],
    },
  },
})

describe('atomic same-Host claim', () => {
  it('serializes concurrent same-session claims: one CLAIMED, one durable record', async () => {
    const { root, service } = await harness()
    for (let round = 0; round < 10; round += 1) {
      const sessionId = `conversation-round-${round}`
      const outcomes = await Promise.all(
        Array.from({ length: 8 }, () => service.claimResurfacingBudget(sessionId)),
      )
      expect(outcomes.filter(outcome => outcome === 'CLAIMED'), `round ${round}`).toHaveLength(1)
      expect(outcomes.filter(outcome => outcome === 'ALREADY_CONSUMED'), `round ${round}`).toHaveLength(7)
      expect(service.getResurfacingBudget(sessionId)).toEqual({ consumed: true })
    }
    // Exactly one durable record per claimed conversation, nothing else.
    const files = await readdir(budgetTableDir(root))
    expect(files).toHaveLength(10)
    expect(files.every(file => file.endsWith('.json'))).toBe(true)
  })

  it('keeps different sessions independent under concurrency', async () => {
    const { service } = await harness()
    const sessions = Array.from({ length: 12 }, (_, index) => `conversation-${index}`)
    const outcomes = await Promise.all(sessions.map(sessionId => service.claimResurfacingBudget(sessionId)))
    expect(outcomes.every(outcome => outcome === 'CLAIMED')).toBe(true)
    for (const sessionId of sessions) {
      expect(await service.claimResurfacingBudget(sessionId)).toBe('ALREADY_CONSUMED')
      expect(service.getResurfacingBudget(sessionId)).toEqual({ consumed: true })
    }
    expect(service.getResurfacingBudget('conversation-unclaimed')).toEqual({ consumed: false })
  })

  it('removes idle tail entries once settled', async () => {
    const { service } = await harness()
    await service.claimResurfacingBudget('conversation-1')
    await service.claimResurfacingBudget('conversation-2')
    await new Promise(resolve => setTimeout(resolve, 0))
    const tails = (service as unknown as { budgetTails: Map<string, unknown> }).budgetTails
    expect(tails.size).toBe(0)
  })
})

describe('persistence round-trip', () => {
  it('keeps a claimed budget consumed across a full dispose/reopen', async () => {
    const { ctx, root, service } = await harness()
    const created = await service.create(draft(), sourceDraft())
    expect(await service.claimResurfacingBudget('conversation-1')).toBe('CLAIMED')

    await ctx.fiber.dispose()
    const reopened = await harness(root)
    expect(reopened.service.getResurfacingBudget('conversation-1')).toEqual({ consumed: true })
    expect(await reopened.service.claimResurfacingBudget('conversation-1')).toBe('ALREADY_CONSUMED')

    // Existing idea records remain readable after the additive write.
    const views = reopened.service.list()
    expect(views).toHaveLength(1)
    expect(views[0]!.idea.ideaId).toBe(created.idea.ideaId)
    expect(views[0]!.currentVersion.draft.title).toBe(draft().title)
  })

  it('persists exactly the frozen minimal durable fact', async () => {
    const { root, service } = await harness()
    await service.claimResurfacingBudget('conversation-1')
    const document = JSON.parse(
      await readFile(join(budgetTableDir(root), 'conversation-1.json'), 'utf8'),
    ) as { version: number; record: unknown }
    expect(document.version).toBe(3)
    expect(document.record).toEqual({ surfaceBudgetConsumed: true })
    expect(Object.keys(document.record as object)).toEqual(['surfaceBudgetConsumed'])
  })
})

describe('additive table compatibility', () => {
  it('opens pre-repair idea/v3 data unchanged with an empty budget table', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-'))
    // Pre-repair persisted state: only the ideas/discussions tables exist.
    const ideasDir = join(root, ideaDomainSpec.name, 'ideas')
    const discussionsDir = join(root, ideaDomainSpec.name, 'discussions')
    await mkdir(ideasDir, { recursive: true })
    await mkdir(discussionsDir, { recursive: true })
    await writeFile(
      join(ideasDir, 'idea-fixture.json'),
      JSON.stringify({ version: ideaDomainSpec.version, record: fixtureAggregate() }),
    )
    await writeFile(
      join(discussionsDir, 'discussion-fixture.json'),
      JSON.stringify({ version: ideaDomainSpec.version, record: fixtureDiscussion() }),
    )

    // The frozen domain declaration is untouched by the repair.
    expect(ideaDomainSpec.name).toBe('idea')
    expect(ideaDomainSpec.version).toBe(3)
    expect(ideaDomainSpec.compatibleVersions).toEqual([1, 2])

    const { service } = await harness(root)
    // Ideas open unchanged.
    const views = service.list()
    expect(views).toHaveLength(1)
    expect(views[0]!.idea.ideaId).toBe('idea-fixture')
    expect(views[0]!.idea.currentVersionId).toBe('idea-ver-1')
    expect(views[0]!.idea.updatedAt).toBe(100)
    expect(views[0]!.currentVersion.draft.title).toBe(draft().title)
    // Discussions open unchanged.
    const discussion = service.getDiscussion(IdeaDiscussionId('discussion-fixture'))
    expect(discussion.conversationId).toBe('conversation-fixture')
    expect(discussion.baseVersionId).toBe('idea-ver-1')
    // The new table begins empty — no migration, no backfill.
    expect(service.getResurfacingBudget('conversation-fixture')).toEqual({ consumed: false })
    await expect(readdir(budgetTableDir(root))).rejects.toThrow()

    // A claim adds only the additive record; existing records are untouched.
    expect(await service.claimResurfacingBudget('conversation-fixture')).toBe('CLAIMED')
    const reread = service.list()[0]!
    expect(reread.idea.updatedAt).toBe(100)
    expect(reread.idea.currentVersionId).toBe('idea-ver-1')
    expect(service.getDiscussion(IdeaDiscussionId('discussion-fixture')).baseVersionId).toBe('idea-ver-1')
    expect(await readdir(budgetTableDir(root))).toEqual(['conversation-fixture.json'])
  })
})
