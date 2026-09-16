/**
 * Domain/schema validation: draft inputs are normalized, bounded, and
 * rejected before persistence; stored aggregates are rejected whenever any
 * model invariant is violated — including at the durable boundary, where a
 * malformed stored document fails the domain open.
 * @module tests/schema.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ideaAggregateSchema,
  ideaDraftSchema,
  IDEA_LIMITS,
  sourceDiscussionDraftSchema,
} from '../src/schema.ts'
import { ideaDomainSpec } from '../src/spec.ts'
import { EvolutionEventId, IdeaId, IdeaVersionId, SourceDiscussionId } from '../src/types.ts'
import type { IdeaAggregate } from '../src/types.ts'
import { cleanup, draft, harness, sourceDraft } from './helpers/harness.ts'

/** A structurally valid aggregate to mutate into invalid shapes. */
const validAggregate = (): IdeaAggregate => ({
  idea: {
    ideaId: IdeaId('idea-a'),
    currentVersionId: IdeaVersionId('idea-ver-1'),
    status: 'active',
    createdAt: 100,
    updatedAt: 100,
  },
  versions: [{
    versionId: IdeaVersionId('idea-ver-1'),
    ideaId: IdeaId('idea-a'),
    ordinal: 1,
    draft: {
      title: 'First version',
      core: 'core',
      motivation: 'motivation',
      currentConclusion: '',
      possibleValue: '',
      useWhen: ['when'],
      openQuestions: [],
    },
    reason: 'initial-save',
    sourceDiscussionIds: [SourceDiscussionId('idea-src-1')],
    createdAt: 100,
  }],
  sourceDiscussions: [{
    sourceDiscussionId: SourceDiscussionId('idea-src-1'),
    ideaId: IdeaId('idea-a'),
    sessionId: 'session-1',
    capturedContext: [{ role: 'user', text: 'hello' }],
    capturedAt: 100,
  }],
  evolutionEvents: [{
    evolutionEventId: EvolutionEventId('idea-evo-1'),
    ideaId: IdeaId('idea-a'),
    toVersionId: IdeaVersionId('idea-ver-1'),
    reason: 'initial-save',
    createdAt: 100,
  }],
})

afterEach(cleanup)

describe('idea draft validation', () => {
  it('rejects empty and whitespace-only title, core, and motivation', () => {
    expect(ideaDraftSchema.safeParse(draft({ title: '   ' })).success).toBe(false)
    expect(ideaDraftSchema.safeParse(draft({ core: '' })).success).toBe(false)
    expect(ideaDraftSchema.safeParse(draft({ motivation: ' \t ' })).success).toBe(false)
  })

  it('normalizes string fields by trimming', () => {
    const parsed = ideaDraftSchema.parse(draft({
      title: '  Padded title  ',
      currentConclusion: '  trimmed conclusion ',
    }))
    expect(parsed.title).toBe('Padded title')
    expect(parsed.currentConclusion).toBe('trimmed conclusion')
  })

  it('rejects empty or oversized items in bounded arrays', () => {
    expect(ideaDraftSchema.safeParse(draft({ useWhen: ['  '] })).success).toBe(false)
    expect(ideaDraftSchema.safeParse(draft({
      openQuestions: ['x'.repeat(IDEA_LIMITS.listItemMax + 1)],
    })).success).toBe(false)
    expect(ideaDraftSchema.safeParse(draft({
      useWhen: Array.from({ length: IDEA_LIMITS.listMax + 1 }, (_, i) => `item ${i}`),
    })).success).toBe(false)
  })

  it('rejects oversized titles', () => {
    expect(ideaDraftSchema.safeParse(draft({ title: 'x'.repeat(IDEA_LIMITS.titleMax + 1) })).success).toBe(false)
  })

  it('rejects snapshots without captured messages and with unknown roles', () => {
    expect(sourceDiscussionDraftSchema.safeParse(sourceDraft({ capturedContext: [] })).success).toBe(false)
    expect(sourceDiscussionDraftSchema.safeParse({
      ...sourceDraft(),
      capturedContext: [{ role: 'system', text: 'hidden prompt' }],
    }).success).toBe(false)
  })

  it('rejects oversized captured context', () => {
    const messages = Array.from({ length: IDEA_LIMITS.capturedMessagesMax + 1 }, (_, i) => ({
      role: 'user' as const,
      text: `message ${i}`,
    }))
    expect(sourceDiscussionDraftSchema.safeParse(sourceDraft({ capturedContext: messages })).success).toBe(false)
  })
})

describe('idea aggregate validation', () => {
  it('accepts a well-formed aggregate', () => {
    const parsed = ideaAggregateSchema.parse(validAggregate())
    expect(parsed.idea.ideaId).toBe('idea-a')
    expect(parsed.versions).toHaveLength(1)
  })

  it('rejects an aggregate without versions', () => {
    const aggregate = { ...validAggregate(), versions: [] }
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects ordinals that are not 1..N in order', () => {
    const aggregate = validAggregate()
    aggregate.versions = [
      { ...aggregate.versions[0]!, ordinal: 2 },
      {
        ...aggregate.versions[0]!,
        versionId: IdeaVersionId('idea-ver-2'),
        ordinal: 3,
      },
    ]
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects a version belonging to another idea', () => {
    const aggregate = validAggregate()
    aggregate.versions[0]!.ideaId = IdeaId('idea-b')
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects currentVersionId that does not point at the latest version', () => {
    const aggregate = validAggregate()
    aggregate.versions = [...aggregate.versions, {
      ...aggregate.versions[0]!,
      versionId: IdeaVersionId('idea-ver-2'),
      ordinal: 2,
    }]
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects a source discussion belonging to another idea', () => {
    const aggregate = validAggregate()
    aggregate.sourceDiscussions[0]!.ideaId = IdeaId('idea-b')
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects dangling source discussion references', () => {
    const aggregate = validAggregate()
    aggregate.versions[0]!.sourceDiscussionIds = [SourceDiscussionId('idea-src-absent')]
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects a version without an evolution event', () => {
    const aggregate = validAggregate()
    aggregate.evolutionEvents = []
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects two evolution events pointing at one version', () => {
    const aggregate = validAggregate()
    aggregate.evolutionEvents = [
      ...aggregate.evolutionEvents,
      {
        evolutionEventId: EvolutionEventId('idea-evo-2'),
        ideaId: IdeaId('idea-a'),
        toVersionId: IdeaVersionId('idea-ver-1'),
        reason: 'manual-edit',
        createdAt: 101,
      },
    ]
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects an evolution event pointing at an absent version', () => {
    const aggregate = validAggregate()
    aggregate.evolutionEvents[0]!.toVersionId = IdeaVersionId('idea-ver-absent')
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('rejects an evolution event citing an absent predecessor', () => {
    const aggregate = validAggregate()
    aggregate.evolutionEvents[0]!.fromVersionId = IdeaVersionId('idea-ver-absent')
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)
  })

  it('accepts a two-version history with a linked event chain', () => {
    const aggregate = validAggregate()
    aggregate.versions = [...aggregate.versions, {
      ...aggregate.versions[0]!,
      versionId: IdeaVersionId('idea-ver-2'),
      ordinal: 2,
      reason: 'manual-edit',
    }]
    aggregate.idea = {
      ...aggregate.idea,
      currentVersionId: IdeaVersionId('idea-ver-2'),
      updatedAt: 101,
    }
    aggregate.evolutionEvents = [...aggregate.evolutionEvents, {
      evolutionEventId: EvolutionEventId('idea-evo-2'),
      ideaId: IdeaId('idea-a'),
      fromVersionId: IdeaVersionId('idea-ver-1'),
      toVersionId: IdeaVersionId('idea-ver-2'),
      reason: 'manual-edit',
      createdAt: 101,
    }]
    const parsed = ideaAggregateSchema.parse(aggregate)
    expect(parsed.versions).toHaveLength(2)
    expect(parsed.evolutionEvents).toHaveLength(2)
  })
})

describe('durable bounds', () => {
  it('rejects durable versions whose fields exceed the draft-consistent bounds', () => {
    const aggregate = validAggregate()
    aggregate.versions[0]!.draft.title = 'x'.repeat(IDEA_LIMITS.titleMax + 1)
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)

    const oversizedCore = validAggregate()
    oversizedCore.versions[0]!.draft.core = 'x'.repeat(IDEA_LIMITS.fieldMax + 1)
    expect(ideaAggregateSchema.safeParse(oversizedCore).success).toBe(false)

    const oversizedItem = validAggregate()
    oversizedItem.versions[0]!.draft.useWhen = ['x'.repeat(IDEA_LIMITS.listItemMax + 1)]
    expect(ideaAggregateSchema.safeParse(oversizedItem).success).toBe(false)

    const oversizedList = validAggregate()
    oversizedList.versions[0]!.draft.openQuestions = Array.from(
      { length: IDEA_LIMITS.listMax + 1 },
      (_, i) => `question ${i}`,
    )
    expect(ideaAggregateSchema.safeParse(oversizedList).success).toBe(false)
  })

  it('rejects durable source discussions that exceed the source bounds', () => {
    const aggregate = validAggregate()
    aggregate.sourceDiscussions[0]!.sessionId = 'x'.repeat(IDEA_LIMITS.idMax + 1)
    expect(ideaAggregateSchema.safeParse(aggregate).success).toBe(false)

    const tooManyMessages = validAggregate()
    tooManyMessages.sourceDiscussions[0]!.capturedContext = Array.from(
      { length: IDEA_LIMITS.capturedMessagesMax + 1 },
      (_, i) => ({ role: 'user' as const, text: `message ${i}` }),
    )
    expect(ideaAggregateSchema.safeParse(tooManyMessages).success).toBe(false)
  })

  it('fails the durable open when a stored version exceeds its bounds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-overlimit-'))
    const path = join(root, ideaDomainSpec.name, 'ideas', 'idea-overlimit.json')
    await mkdir(dirname(path), { recursive: true })
    const aggregate = validAggregate()
    aggregate.versions[0]!.draft.title = 'x'.repeat(IDEA_LIMITS.titleMax + 1)
    await writeFile(path, JSON.stringify({
      version: ideaDomainSpec.version,
      record: aggregate,
    }))
    await expect(harness(root)).rejects.toMatchObject({ code: 'invalid-record' })
  })
})

describe('domain version 1 migration', () => {
  /** The flat version shape domain version 1 stored, as plain JSON values. */
  const legacyAggregate = (): Record<string, unknown> => ({
    idea: {
      ideaId: 'idea-legacy',
      currentVersionId: 'idea-ver-1',
      status: 'active',
      createdAt: 100,
      updatedAt: 100,
    },
    versions: [{
      versionId: 'idea-ver-1',
      ideaId: 'idea-legacy',
      ordinal: 1,
      title: 'Legacy title',
      core: 'Legacy core',
      motivation: 'Legacy motivation',
      currentConclusion: 'Legacy conclusion',
      possibleValue: '',
      useWhen: ['when'],
      openQuestions: [],
      sourceDiscussionIds: ['idea-src-1', 'idea-src-2'],
      createdAt: 100,
    }],
    sourceDiscussions: [
      {
        sourceDiscussionId: 'idea-src-1',
        ideaId: 'idea-legacy',
        sessionId: 'session-legacy',
        capturedContext: [{ role: 'user', text: 'hello' }],
        capturedAt: 100,
      },
      {
        sourceDiscussionId: 'idea-src-2',
        ideaId: 'idea-legacy',
        sessionId: 'session-legacy-2',
        capturedContext: [{ role: 'assistant', text: 'second snapshot' }],
        capturedAt: 100,
      },
    ],
  })

  it('migrates a legacy flat aggregate onto the current shape', () => {
    const parsed = ideaAggregateSchema.parse(legacyAggregate())
    const v1 = parsed.versions[0]!
    expect(v1.draft.title).toBe('Legacy title')
    expect(v1.draft.core).toBe('Legacy core')
    expect(v1.draft.useWhen).toEqual(['when'])
    expect(v1.reason).toBe('initial-save')
    expect(parsed.evolutionEvents).toHaveLength(1)
    const event = parsed.evolutionEvents[0]!
    expect(event.toVersionId).toBe('idea-ver-1')
    expect(event.fromVersionId).toBeUndefined()
    expect(event.reason).toBe('initial-save')
  })

  it('preserves the full multi-source provenance array and every snapshot', () => {
    const parsed = ideaAggregateSchema.parse(legacyAggregate())
    expect(parsed.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1', 'idea-src-2'])
    expect(parsed.sourceDiscussions.map(entry => entry.sourceDiscussionId)).toEqual(['idea-src-1', 'idea-src-2'])
    expect(parsed.sourceDiscussions[1]!.sessionId).toBe('session-legacy-2')
  })

  it('migrates a legacy multi-version history with reasons and a linked event chain', () => {
    const legacy = legacyAggregate()
    ;(legacy.versions as Array<Record<string, unknown>>).push({
      versionId: 'idea-ver-2',
      ideaId: 'idea-legacy',
      ordinal: 2,
      title: 'Legacy v2',
      core: 'Legacy core 2',
      motivation: 'Legacy motivation 2',
      currentConclusion: '',
      possibleValue: '',
      useWhen: [],
      openQuestions: [],
      sourceDiscussionIds: [],
      createdAt: 200,
    })
    ;(legacy.idea as Record<string, unknown>).currentVersionId = 'idea-ver-2'
    const parsed = ideaAggregateSchema.parse(legacy)
    expect(parsed.versions[0]!.reason).toBe('initial-save')
    expect(parsed.versions[1]!.reason).toBe('continued-discussion')
    expect(parsed.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1', 'idea-src-2'])
    expect(parsed.versions[1]!.sourceDiscussionIds).toEqual([])
    expect(parsed.evolutionEvents).toHaveLength(2)
    expect(parsed.evolutionEvents[1]!.fromVersionId).toBe('idea-ver-1')
    expect(parsed.evolutionEvents[1]!.toVersionId).toBe('idea-ver-2')
  })

  it('reads version-1-stamped records at the durable boundary without writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-migrate-'))
    const path = join(root, ideaDomainSpec.name, 'ideas', 'idea-legacy.json')
    await mkdir(dirname(path), { recursive: true })
    const document = JSON.stringify({ version: 1, record: legacyAggregate() })
    await writeFile(path, document)

    const { service } = await harness(root)
    const aggregate = service.get(IdeaId('idea-legacy'))
    expect(aggregate.versions[0]!.draft.title).toBe('Legacy title')
    expect(aggregate.versions[0]!.reason).toBe('initial-save')
    expect(aggregate.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1', 'idea-src-2'])
    expect(aggregate.evolutionEvents).toHaveLength(1)
    // Pure reads leave the stored bytes untouched.
    expect(await readFile(path, 'utf8')).toBe(document)
  })

  it('persists the canonical v3 form on the next write and keeps historical provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-migrate-v3-'))
    const path = join(root, ideaDomainSpec.name, 'ideas', 'idea-legacy.json')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ version: 1, record: legacyAggregate() }))

    const { ctx, root: sameRoot, service } = await harness(root)
    const evolved = await service.evolve(
      IdeaId('idea-legacy'),
      draft({ title: 'Evolved title' }),
      sourceDraft({ sessionId: 'session-new' }),
      IdeaVersionId('idea-ver-1'),
      'manual-edit',
    )
    expect(evolved.versions).toHaveLength(2)
    await ctx.fiber.dispose()

    const raw = JSON.parse(await readFile(path, 'utf8')) as { version: number, record: { versions: Array<{ sourceDiscussionIds: string[] }> } }
    expect(raw.version).toBe(3)
    expect(raw.record.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1', 'idea-src-2'])
    expect(raw.record.versions[1]!.sourceDiscussionIds).toHaveLength(1)

    const reopened = await harness(sameRoot)
    const aggregate = reopened.service.get(IdeaId('idea-legacy'))
    expect(aggregate.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1', 'idea-src-2'])
    expect(aggregate.versions[1]!.sourceDiscussionIds).toEqual(
      [aggregate.sourceDiscussions.at(-1)!.sourceDiscussionId])
  })

  it('still rejects a legacy document that violates the model invariants', () => {
    const legacy = legacyAggregate()
    ;(legacy.versions as Array<Record<string, unknown>>)[0]!.sourceDiscussionIds = ['idea-src-absent']
    expect(ideaAggregateSchema.safeParse(legacy).success).toBe(false)
  })
})

describe('domain version 2 migration', () => {
  /** A v2-era aggregate: nested draft, singular optional provenance. */
  const v2Aggregate = (withSource: boolean): Record<string, unknown> => ({
    idea: {
      ideaId: 'idea-v2',
      currentVersionId: 'idea-ver-1',
      status: 'active',
      createdAt: 100,
      updatedAt: 100,
    },
    versions: [{
      versionId: 'idea-ver-1',
      ideaId: 'idea-v2',
      ordinal: 1,
      draft: {
        title: 'V2 title',
        core: 'V2 core',
        motivation: 'V2 motivation',
        currentConclusion: '',
        possibleValue: '',
        useWhen: [],
        openQuestions: [],
      },
      reason: 'initial-save',
      ...(withSource ? { sourceDiscussionId: 'idea-src-1' } : {}),
      createdAt: 100,
    }],
    sourceDiscussions: [{
      sourceDiscussionId: 'idea-src-1',
      ideaId: 'idea-v2',
      sessionId: 'session-v2',
      capturedContext: [{ role: 'user', text: 'hello' }],
      capturedAt: 100,
    }],
    evolutionEvents: [{
      evolutionEventId: 'idea-evo-1',
      ideaId: 'idea-v2',
      toVersionId: 'idea-ver-1',
      reason: 'initial-save',
      createdAt: 100,
    }],
  })

  it('wraps a singular v2 citation into a one-element array', () => {
    const parsed = ideaAggregateSchema.parse(v2Aggregate(true))
    expect(parsed.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1'])
  })

  it('maps an absent v2 citation to an empty array', () => {
    const parsed = ideaAggregateSchema.parse(v2Aggregate(false))
    expect(parsed.versions[0]!.sourceDiscussionIds).toEqual([])
  })

  it('keeps v2 draft, reason, and events intact through the migration', () => {
    const parsed = ideaAggregateSchema.parse(v2Aggregate(true))
    expect(parsed.versions[0]!.draft.title).toBe('V2 title')
    expect(parsed.versions[0]!.reason).toBe('initial-save')
    expect(parsed.evolutionEvents).toHaveLength(1)
  })

  it('reads version-2-stamped records durably and persists v3 on the next write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-v2-migrate-'))
    const path = join(root, ideaDomainSpec.name, 'ideas', 'idea-v2.json')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ version: 2, record: v2Aggregate(true) }))

    const { ctx, root: sameRoot, service } = await harness(root)
    const aggregate = service.get(IdeaId('idea-v2'))
    expect(aggregate.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1'])
    const evolved = await service.evolve(
      IdeaId('idea-v2'),
      draft({ title: 'V2 evolved' }),
      sourceDraft({ sessionId: 'session-v2-new' }),
      IdeaVersionId('idea-ver-1'),
      'manual-edit',
    )
    expect(evolved.versions).toHaveLength(2)
    await ctx.fiber.dispose()

    const raw = JSON.parse(await readFile(path, 'utf8')) as { version: number, record: { versions: Array<{ sourceDiscussionIds: string[] }> } }
    expect(raw.version).toBe(3)
    expect(raw.record.versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1'])

    const reopened = await harness(sameRoot)
    expect(reopened.service.get(IdeaId('idea-v2')).versions[0]!.sourceDiscussionIds).toEqual(['idea-src-1'])
  })

  it('fails the domain open loudly when a v2 citation dangles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-v2-dangling-'))
    const path = join(root, ideaDomainSpec.name, 'ideas', 'idea-v2.json')
    await mkdir(dirname(path), { recursive: true })
    const record = v2Aggregate(true) as { versions: Array<Record<string, unknown>> }
    record.versions[0]!.sourceDiscussionId = 'idea-src-absent'
    await writeFile(path, JSON.stringify({ version: 2, record }))
    await expect(harness(root)).rejects.toMatchObject({ code: 'invalid-record' })
  })
})

describe('durable boundary', () => {
  it('fails the domain open when a stored aggregate is malformed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-idea-corrupt-'))
    const path = join(root, ideaDomainSpec.name, 'ideas', 'idea-corrupt.json')
    await mkdir(dirname(path), { recursive: true })
    const aggregate = validAggregate()
    aggregate.versions[0]!.sourceDiscussionIds = [SourceDiscussionId('idea-src-dangling')]
    await writeFile(path, JSON.stringify({
      version: ideaDomainSpec.version,
      record: aggregate,
    }))
    // The service boots over the corrupted medium and must refuse it loudly.
    await expect(harness(root)).rejects.toMatchObject({ code: 'invalid-record' })
  })
})
