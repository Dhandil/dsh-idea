/**
 * Domain/schema validation: draft inputs are normalized, bounded, and
 * rejected before persistence; stored aggregates are rejected whenever any
 * model invariant is violated — including at the durable boundary, where a
 * malformed stored document fails the domain open.
 * @module tests/schema.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ideaAggregateSchema,
  ideaDraftSchema,
  IDEA_LIMITS,
  sourceDiscussionDraftSchema,
} from '../src/schema.ts'
import { ideaDomainSpec } from '../src/spec.ts'
import { IdeaId, IdeaVersionId, SourceDiscussionId } from '../src/types.ts'
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
    title: 'First version',
    core: 'core',
    motivation: 'motivation',
    currentConclusion: '',
    possibleValue: '',
    useWhen: ['when'],
    openQuestions: [],
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
        sourceDiscussionIds: [],
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
      sourceDiscussionIds: [],
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
