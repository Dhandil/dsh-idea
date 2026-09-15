/**
 * The Idea domain service (`ctx.ideaService`): durable create/get/list/
 * archive/evolve over the `idea` storage domain. Every read is synchronous
 * from the domain's authoritative in-memory state; every write is one
 * serialized single-record operation on the domain's write chain — durability
 * first, then memory. Evolve and archive are optimistic: they compare
 * `expectedCurrentVersionId` inside the atomic record update, so a stale
 * expectation rejects with `version-conflict` and writes nothing. History is
 * an immutable linear append; nothing ever rewrites a committed version.
 * All operations are user-triggered — no automatic detection or background
 * writes exist here.
 * @module @dsh-external/dsh-idea/src/service
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import { DomainError } from '@deepseek-ai/dsh-storage-domain'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { z } from 'zod'
import { IdeaError } from './errors.ts'
import { ideaAggregateSchema, ideaDraftSchema, sourceDiscussionDraftSchema } from './schema.ts'
import { ideaDomainSpec } from './spec.ts'
import { IdeaId, IdeaVersionId, SourceDiscussionId } from './types.ts'
import type {
  IdeaAggregate,
  IdeaCurrentView,
  IdeaDraft,
  IdeaVersion,
  ListIdeasOptions,
  SourceDiscussion,
  SourceDiscussionDraft,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaService: IdeaService
  }
}

const createId = (prefix: string): string => `${prefix}_${randomUUID()}`

/** Run one draft schema, translating failure to `invalid-input`. */
function parseDraft<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new IdeaError('invalid-input', 'idea input does not match its schema', { cause: result.error })
  }
  return result.data
}

/**
 * The Idea domain service. Opens the `idea` domain at init and keeps the
 * aggregate table as its single durable surface; the caller of `open` owns
 * the domain handle, released through the service's own effect disposer.
 */
export class IdeaService extends Service {
  static inject = ['storageDomain']

  private table?: KvTable<IdeaId, IdeaAggregate>

  constructor(ctx: Context) {
    super(ctx, 'ideaService')
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(ideaDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'idea.domainClose')
    this.table = domain.table('ideas')
  }

  /**
   * Commit the first version of a new Idea: ordinal 1, status `active`,
   * `currentVersionId` pointing at it, and the source snapshot stored in the
   * same aggregate write. Nothing is persisted when the draft or source
   * fails validation.
   * @param draft - Prepared semantic content of version 1.
   * @param source - Prepared snapshot of the discussion the idea was saved from.
   * @returns the durably stored aggregate.
   */
  async create(draft: IdeaDraft, source: SourceDiscussionDraft): Promise<IdeaAggregate> {
    const validatedDraft = parseDraft(ideaDraftSchema, draft)
    const validatedSource = parseDraft(sourceDiscussionDraftSchema, source)
    const now = this.now()
    const ideaId = IdeaId(createId('idea'))
    const versionId = IdeaVersionId(createId('idea_ver'))
    const sourceDiscussionId = SourceDiscussionId(createId('idea_src'))
    const aggregate = ideaAggregateSchema.parse({
      idea: {
        ideaId,
        currentVersionId: versionId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      versions: [{
        versionId,
        ideaId,
        ordinal: 1,
        title: validatedDraft.title,
        core: validatedDraft.core,
        motivation: validatedDraft.motivation,
        currentConclusion: validatedDraft.currentConclusion,
        possibleValue: validatedDraft.possibleValue,
        useWhen: [...validatedDraft.useWhen],
        openQuestions: [...validatedDraft.openQuestions],
        sourceDiscussionIds: [sourceDiscussionId],
        createdAt: now,
      }],
      sourceDiscussions: [{
        sourceDiscussionId,
        ideaId,
        sessionId: validatedSource.sessionId,
        ...(validatedSource.anchorMessageId !== undefined ? { anchorMessageId: validatedSource.anchorMessageId } : {}),
        ...(validatedSource.startSeq !== undefined ? { startSeq: validatedSource.startSeq } : {}),
        ...(validatedSource.endSeq !== undefined ? { endSeq: validatedSource.endSeq } : {}),
        capturedContext: validatedSource.capturedContext.map(message => ({ ...message })),
        capturedAt: now,
      }],
    })
    const table = this.records
    if (table.get(ideaId) !== undefined) {
      // randomUUID collision: never observed in practice, but a silent
      // overwrite of an existing idea is never acceptable.
      throw new IdeaError('invalid-input', `idea '${ideaId}' already exists`)
    }
    await table.put(aggregate.idea.ideaId, aggregate)
    return this.detach(aggregate)
  }

  /**
   * Read one Idea aggregate, synchronously from memory.
   * @param ideaId - The idea to read.
   * @returns a detached snapshot of the stored aggregate.
   * @throws `IdeaError` with code `idea-not-found` when absent.
   */
  get(ideaId: IdeaId): IdeaAggregate {
    const aggregate = this.records.get(ideaId)
    if (aggregate === undefined) {
      throw new IdeaError('idea-not-found', `idea '${ideaId}' does not exist`)
    }
    return this.detach(aggregate)
  }

  /**
   * List the current-Idea/current-version view of every Idea. Historical
   * versions are not separate Ideas: one aggregate yields one view. Archived
   * ideas are excluded unless {@link ListIdeasOptions.includeArchived} is set.
   * @param options - Listing options.
   * @returns views ordered by most recently updated first, idea id as tiebreak.
   */
  list(options: ListIdeasOptions = {}): IdeaCurrentView[] {
    const includeArchived = options.includeArchived === true
    const views: IdeaCurrentView[] = []
    for (const [, aggregate] of this.records.entries()) {
      if (aggregate.idea.status === 'archived' && !includeArchived) continue
      const currentVersion = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
      if (currentVersion === undefined) continue
      const snapshot = this.detach(aggregate)
      views.push({
        idea: snapshot.idea,
        currentVersion: snapshot.versions.find(version => version.versionId === snapshot.idea.currentVersionId)!,
      })
    }
    return views.sort((a, b) =>
      (b.idea.updatedAt - a.idea.updatedAt) || (a.idea.ideaId < b.idea.ideaId ? -1 : 1))
  }

  /**
   * Archive an Idea atomically: flip the status, keep every version and
   * source snapshot untouched. Archived means retrieval filtering, never
   * deletion.
   * @param ideaId - The idea to archive.
   * @param expectedCurrentVersionId - The version the caller last saw; a
   * mismatch rejects with `version-conflict` and writes nothing.
   * @returns the stored aggregate after the archive.
   */
  async archive(ideaId: IdeaId, expectedCurrentVersionId: IdeaVersionId): Promise<IdeaAggregate> {
    return await this.mutate(ideaId, expectedCurrentVersionId, (current, now) => ({
      ...current,
      idea: { ...current.idea, status: 'archived', updatedAt: now },
    }))
  }

  /**
   * Commit the next linear version of an Idea atomically: append one source
   * snapshot and one version (ordinal = previous + 1), advance
   * `currentVersionId`, preserve every prior version unchanged. No
   * branching, no merge graph, no rewrite of committed history.
   * @param ideaId - The idea to evolve.
   * @param draft - Prepared semantic content of the new version.
   * @param source - Prepared snapshot of the discussion that produced it.
   * @param expectedCurrentVersionId - The version the caller last saw; a
   * mismatch rejects with `version-conflict` and writes nothing.
   * @returns the stored aggregate after the evolve.
   */
  async evolve(
    ideaId: IdeaId,
    draft: IdeaDraft,
    source: SourceDiscussionDraft,
    expectedCurrentVersionId: IdeaVersionId,
  ): Promise<IdeaAggregate> {
    const validatedDraft = parseDraft(ideaDraftSchema, draft)
    const validatedSource = parseDraft(sourceDiscussionDraftSchema, source)
    return await this.mutate(ideaId, expectedCurrentVersionId, (current, now) => {
      const versionId = IdeaVersionId(createId('idea_ver'))
      const sourceDiscussionId = SourceDiscussionId(createId('idea_src'))
      const discussion: SourceDiscussion = {
        sourceDiscussionId,
        ideaId: current.idea.ideaId,
        sessionId: validatedSource.sessionId,
        ...(validatedSource.anchorMessageId !== undefined ? { anchorMessageId: validatedSource.anchorMessageId } : {}),
        ...(validatedSource.startSeq !== undefined ? { startSeq: validatedSource.startSeq } : {}),
        ...(validatedSource.endSeq !== undefined ? { endSeq: validatedSource.endSeq } : {}),
        capturedContext: validatedSource.capturedContext.map(message => ({ ...message })),
        capturedAt: now,
      }
      const version: IdeaVersion = {
        versionId,
        ideaId: current.idea.ideaId,
        ordinal: (current.versions.at(-1)?.ordinal ?? 0) + 1,
        title: validatedDraft.title,
        core: validatedDraft.core,
        motivation: validatedDraft.motivation,
        currentConclusion: validatedDraft.currentConclusion,
        possibleValue: validatedDraft.possibleValue,
        useWhen: [...validatedDraft.useWhen],
        openQuestions: [...validatedDraft.openQuestions],
        sourceDiscussionIds: [sourceDiscussionId],
        createdAt: now,
      }
      return {
        idea: { ...current.idea, currentVersionId: versionId, updatedAt: now },
        versions: [...current.versions, version],
        sourceDiscussions: [...current.sourceDiscussions, discussion],
      }
    })
  }

  /**
   * One optimistic single-record update on the domain's write chain. The
   * expectation is compared inside the update transform, which runs before
   * any backend write: a mismatch throws out of the transform, so neither
   * the medium nor memory ever changes.
   */
  private async mutate(
    ideaId: IdeaId,
    expectedCurrentVersionId: IdeaVersionId,
    transform: (current: IdeaAggregate, now: number) => IdeaAggregate,
  ): Promise<IdeaAggregate> {
    try {
      const stored = await this.records.update(ideaId, (current) => {
        if (current.idea.currentVersionId !== expectedCurrentVersionId) {
          throw new IdeaError(
            'version-conflict',
            `idea '${ideaId}' is at version '${current.idea.currentVersionId}', `
            + `not the expected '${expectedCurrentVersionId}'; nothing was written`,
          )
        }
        return ideaAggregateSchema.parse(transform(current, this.now()))
      })
      return this.detach(stored)
    } catch (error) {
      if (error instanceof DomainError && error.code === 'missing-key') {
        throw new IdeaError('idea-not-found', `idea '${ideaId}' does not exist`, { cause: error })
      }
      throw error
    }
  }

  private get records(): KvTable<IdeaId, IdeaAggregate> {
    if (this.table === undefined) {
      throw new Error('idea service is not initialized')
    }
    return this.table
  }

  /**
   * Public results are detached snapshots: mutating a returned object must
   * never reach the domain's canonical in-memory state (or the medium).
   */
  private detach(aggregate: IdeaAggregate): IdeaAggregate {
    return structuredClone(aggregate)
  }

  private now(): number {
    return Date.now()
  }
}
