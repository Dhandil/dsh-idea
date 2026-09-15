/**
 * The Idea domain service (`ctx.ideaService`): durable create/get/list/
 * archive/evolve, the read-only version queries (listVersions/getVersion),
 * and continued-discussion workspaces over the `idea` storage domain. Every
 * read is synchronous from the domain's authoritative in-memory state; every
 * write is one serialized single-record operation on the domain's write
 * chain — durability first, then memory. Evolve and archive are optimistic:
 * they compare `expectedCurrentVersionId` inside the atomic record update,
 * so a stale expectation rejects with `version-conflict` and writes
 * nothing. History is an immutable linear append; nothing ever rewrites a
 * committed version. Continue Discussion creates the workspace and its
 * context seed without touching the Idea aggregate. All operations are
 * user-triggered — no automatic detection or background writes exist here.
 * @module @dsh-external/dsh-idea/src/service
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import { DomainError } from '@deepseek-ai/dsh-storage-domain'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { z } from 'zod'
import { IdeaError } from './errors.ts'
import {
  ideaAggregateSchema,
  ideaDiscussionSchema,
  ideaDraftSchema,
  sourceDiscussionDraftSchema,
} from './schema.ts'
import { ideaDomainSpec } from './spec.ts'
import { EvolutionEventId, IdeaDiscussionId, IdeaId, IdeaVersionId, SourceDiscussionId } from './types.ts'
import type {
  IdeaAggregate,
  IdeaContinuationContext,
  IdeaCurrentView,
  IdeaDiscussion,
  IdeaDraft,
  IdeaEvolutionEvent,
  IdeaEvolutionReason,
  IdeaHistorySummaryEntry,
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
  private discussions?: KvTable<IdeaDiscussionId, IdeaDiscussion>

  constructor(ctx: Context) {
    super(ctx, 'ideaService')
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(ideaDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'idea.domainClose')
    this.table = domain.table('ideas')
    this.discussions = domain.table('discussions')
  }

  /**
   * Commit the first version of a new Idea: ordinal 1 with the
   * `initial-save` reason, status `active`, `currentVersionId` pointing at
   * it, its evolution event (no predecessor), and the source snapshot stored
   * in the same aggregate write. Nothing is persisted when the draft or
   * source fails validation.
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
        draft: validatedDraft,
        reason: 'initial-save',
        sourceDiscussionId,
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
      evolutionEvents: [{
        evolutionEventId: EvolutionEventId(createId('idea_evo')),
        ideaId,
        toVersionId: versionId,
        reason: 'initial-save',
        createdAt: now,
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
   * snapshot, one version (ordinal = previous + 1, carrying the given
   * reason), and one evolution event linking from the superseded version;
   * advance `currentVersionId`; preserve every prior version and event
   * unchanged. No branching, no merge graph, no rewrite of committed history.
   * @param ideaId - The idea to evolve.
   * @param draft - Prepared semantic content of the new version.
   * @param source - Prepared snapshot of the discussion that produced it.
   * @param expectedCurrentVersionId - The version the caller last saw; a
   * mismatch rejects with `version-conflict` and writes nothing.
   * @param reason - Why the Idea evolved (`manual-edit` or
   * `continued-discussion`; the initial save is never an evolution).
   * @returns the stored aggregate after the evolve.
   */
  async evolve(
    ideaId: IdeaId,
    draft: IdeaDraft,
    source: SourceDiscussionDraft,
    expectedCurrentVersionId: IdeaVersionId,
    reason: IdeaEvolutionReason,
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
        draft: validatedDraft,
        reason,
        sourceDiscussionId,
        createdAt: now,
      }
      const event: IdeaEvolutionEvent = {
        evolutionEventId: EvolutionEventId(createId('idea_evo')),
        ideaId: current.idea.ideaId,
        fromVersionId: current.idea.currentVersionId,
        toVersionId: versionId,
        reason,
        createdAt: now,
      }
      return {
        idea: { ...current.idea, currentVersionId: versionId, updatedAt: now },
        versions: [...current.versions, version],
        sourceDiscussions: [...current.sourceDiscussions, discussion],
        evolutionEvents: [...current.evolutionEvents, event],
      }
    })
  }

  /**
   * Read one Idea's complete version history, v1 first, synchronously from
   * memory. Versions are immutable: the returned snapshots are detached.
   * @param ideaId - The idea whose history to read.
   * @returns the versions ordered by ascending ordinal.
   * @throws `IdeaError` with code `idea-not-found` when absent.
   */
  listVersions(ideaId: IdeaId): readonly IdeaVersion[] {
    return this.get(ideaId).versions
  }

  /**
   * Continue an Idea as a new discussion workspace. Idempotent per
   * `ideaId` + current version: an existing `active` discussion for the same
   * base version is reused, and its conversation creator is not invoked
   * again. A new discussion creates exactly one conversation through the
   * caller-supplied seam (the Idea service itself has no session knowledge)
   * and stores the durable workspace with its `idea-continuation` context
   * seed. The Idea aggregate is never touched: no version, no metadata
   * change, no event — the discussion is not an evolution.
   * @param ideaId - The idea to continue.
   * @param createConversation - Creates one new conversation, resolving to
   * its conversation id; invoked only when no reusable discussion exists.
   * @returns the reused or newly created discussion.
   * @throws `IdeaError` with code `idea-not-found` when the idea is absent.
   */
  async continueDiscussion(
    ideaId: IdeaId,
    createConversation: () => Promise<string>,
  ): Promise<IdeaDiscussion> {
    const current = this.get(ideaId)
    const baseVersionId = current.idea.currentVersionId
    for (const [, existing] of this.workspaces.entries()) {
      if (existing.ideaId === ideaId && existing.baseVersionId === baseVersionId && existing.status === 'active') {
        return structuredClone(existing)
      }
    }
    const conversationId = await createConversation()
    const discussion = ideaDiscussionSchema.parse({
      discussionId: IdeaDiscussionId(createId('idea_dis')),
      ideaId,
      conversationId,
      baseVersionId,
      status: 'active',
      createdAt: this.now(),
      context: this.continuationContextOf(current),
    })
    await this.workspaces.put(discussion.discussionId, discussion)
    return structuredClone(discussion)
  }

  /**
   * The bounded `idea-continuation` seed for one discussion: the current
   * version in full, a history digest of identity rows only, and the
   * unresolved questions. Captured source messages and any other
   * conversation data are deliberately absent — an Idea is a seed, not a
   * transcript archive.
   */
  private continuationContextOf(aggregate: IdeaAggregate): IdeaContinuationContext {
    const currentVersion = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
    if (currentVersion === undefined) {
      throw new IdeaError('idea-not-found', `idea '${aggregate.idea.ideaId}' has no current version`)
    }
    const historySummary: IdeaHistorySummaryEntry[] = aggregate.versions.map(version => ({
      ordinal: version.ordinal,
      reason: version.reason,
      title: version.draft.title,
      createdAt: version.createdAt,
    }))
    return {
      type: 'idea-continuation',
      idea: {
        id: aggregate.idea.ideaId,
        title: currentVersion.draft.title,
        currentVersion: currentVersion.versionId,
        draft: structuredClone(currentVersion.draft),
        historySummary,
        openQuestions: [...currentVersion.draft.openQuestions],
      },
    }
  }
  /**
   * Read one committed version of an Idea, synchronously from memory.
   * @param ideaId - The idea the version belongs to.
   * @param versionId - The version to read.
   * @returns a detached snapshot of the version.
   * @throws `IdeaError` with code `idea-not-found` when the idea is absent,
   * or `version-not-found` when the idea carries no such version.
   */
  getVersion(ideaId: IdeaId, versionId: IdeaVersionId): IdeaVersion {
    const aggregate = this.get(ideaId)
    const version = aggregate.versions.find(entry => entry.versionId === versionId)
    if (version === undefined) {
      throw new IdeaError('version-not-found', `idea '${ideaId}' has no version '${versionId}'`)
    }
    return version
  }

  /**
   * Read one continued-discussion workspace, synchronously from memory.
   * Read-only: the returned snapshot is detached, and nothing is ever
   * written.
   * @param discussionId - The discussion workspace to read.
   * @returns a detached snapshot of the stored discussion.
   * @throws `IdeaError` with code `discussion-not-found` when absent.
   */
  getDiscussion(discussionId: IdeaDiscussionId): IdeaDiscussion {
    const discussion = this.workspaces.get(discussionId)
    if (discussion === undefined) {
      throw new IdeaError('discussion-not-found', `discussion '${discussionId}' does not exist`)
    }
    return structuredClone(discussion)
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

  private get workspaces(): KvTable<IdeaDiscussionId, IdeaDiscussion> {
    if (this.discussions === undefined) {
      throw new Error('idea service is not initialized')
    }
    return this.discussions
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
