/**
 * The `idea` Remote service (`ctx.idea`): the Save Idea path, the read-only
 * library path, and the evolution path exposed to the web client.
 * `prepareFromMessage` delegates to the T2 preparation service and maps its
 * failures onto the wire vocabulary; `create` resolves canonical source
 * provenance from the Host-only registry, validates the user-edited draft,
 * and runs the idempotent commit state machine
 * (`prepared → committing → committed`) so one preparationId produces at
 * most one durable Idea even under duplicate or concurrent requests.
 * `list`/`get` project stored aggregates onto read-only wire summaries/
 * details and never write, `getVersions`/`getVersion` expose the immutable
 * version history the same way, `continueDiscussion` opens the Idea's
 * continuation conversation through the Host Session Controller while the
 * domain service owns idempotency, and `prepareEvolution`/`commitEvolution`
 * carry the evolution proposal pipeline — prepare is a read-only proposal,
 * commit is the only durable write and stays subject to the domain's
 * optimistic version check — and `relatedFromMessage` carries the read-only
 * Related Ideas usefulness judgment. The browser may only ever submit a
 * draft plus a Host-owned reference.
 * @module @dsh-external/dsh-idea/src/remote-host/service
 */

import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { ideaDraftSchema } from '../schema.ts'
import { IdeaPreparationError } from '../preparation/errors.ts'
import type { IdeaPreparationId, PreparedIdeaSource } from '../preparation/types.ts'
import { IdeaId, IdeaVersionId } from '../types.ts'
import type { IdeaAggregate, IdeaDraft, IdeaVersion, SourceDiscussionDraft } from '../types.ts'
import { remoteDomainError, remoteEvolutionError, remotePreparationError } from './errors.ts'
import type {
  IdeaCommitEvolutionRequest,
  IdeaCommitEvolutionResult,
  IdeaContinueDiscussionRequest,
  IdeaContinueDiscussionResult,
  IdeaCreateRequest,
  IdeaCreateResult,
  IdeaDetail,
  IdeaGetRequest,
  IdeaEvolutionProposalPreview,
  IdeaPrepareEvolutionRequest,
  IdeaPrepareRequest,
  IdeaRelatedRequest,
  IdeaRelatedResult,
  IdeaSummary,
  IdeaVersionDetail,
  IdeaVersionGetRequest,
  IdeaVersionSummary,
} from './types.ts'
import type { IdeaPreparationPreview } from '../preparation/types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    idea: IdeaRemoteService
  }
}

/** Commit machine state for one preparationId. */
type CommitEntry =
  | { kind: 'committing'; result: Promise<IdeaCreateResult> }
  | { kind: 'committed'; result: IdeaCreateResult }

export class IdeaRemoteService extends TypertRemoteService {
  static inject = ['ideaService', 'ideaPreparations', 'ideaEvolutions', 'ideaRelated']

  /** Commit state per preparationId; entries live for the process lifetime. */
  private readonly commits = new Map<IdeaPreparationId, CommitEntry>()

  constructor(ctx: Context) {
    super(ctx, 'idea')
  }

  /**
   * Propose an editable Idea draft from one finalized assistant message.
   * Delegates entirely to the preparation service; zero durable writes.
   */
  @Remote
  async prepareFromMessage(request: IdeaPrepareRequest, signal?: AbortSignal): Promise<IdeaPreparationPreview> {
    try {
      return await this.ctx.ideaPreparations.prepareFromMessage(request.sessionId, request.messageId, signal)
    } catch (error) {
      const remote = remotePreparationError(error)
      throw remote ?? error
    }
  }

  /**
   * Commit the user-edited draft of one preparation as a new durable Idea.
   * Repeated calls for the same preparationId return the same result with
   * zero extra writes; a failed write returns the preparation to a retryable
   * state and never caches a failure as success.
   */
  @Remote
  async create(request: IdeaCreateRequest, signal?: AbortSignal): Promise<IdeaCreateResult> {
    if (signal?.aborted) {
      throw new RemoteError('gateway/cancelled', 'idea save was cancelled', {})
    }

    // Rule 1/7: validate the edited draft first; an invalid draft never
    // begins a commit and never touches commit state.
    const parsed = ideaDraftSchema.safeParse(request.draft)
    if (!parsed.success) {
      throw new RemoteError('idea/invalid-draft', 'the edited idea draft is invalid', {
        issues: parsed.error.issues,
      })
    }

    // Rules 4/5/6: a concurrent caller joins the in-flight flight; a repeated
    // caller after success receives the retained result with zero writes.
    const existing = this.commits.get(request.preparationId)
    if (existing !== undefined) return existing.result

    // Rule 2: canonical source provenance comes only from the registry.
    const prepared = this.resolvePreparation(request.preparationId)
    return this.beginCommit(request.preparationId, prepared, parsed.data)
  }

  /** Resolve the preparation behind an id, translating expiry explicitly. */
  private resolvePreparation(preparationId: IdeaPreparationId): PreparedIdeaSource {
    try {
      return this.ctx.ideaPreparations.preparations.resolve(preparationId)
    } catch (error) {
      if (error instanceof IdeaPreparationError && error.code === 'preparation-not-found') {
        throw new RemoteError('idea/preparation-not-found', 'this idea preview has expired', {}, { cause: error })
      }
      throw error
    }
  }

  /**
   * Enter `committing` synchronously, then await the durable create. The
   * state transition happens in the same synchronous block as the flight
   * start, so no caller can observe a window without it.
   */
  private beginCommit(
    preparationId: IdeaPreparationId,
    prepared: PreparedIdeaSource,
    draft: IdeaDraft,
  ): Promise<IdeaCreateResult> {
    const flight = this.commitDurable(preparationId, prepared.source, draft)
    this.commits.set(preparationId, { kind: 'committing', result: flight })
    return flight
  }

  /** One durable create attempt; failure resets the preparation to retryable. */
  private async commitDurable(
    preparationId: IdeaPreparationId,
    source: SourceDiscussionDraft,
    draft: IdeaDraft,
  ): Promise<IdeaCreateResult> {
    try {
      const aggregate = await this.ctx.ideaService.create(draft, source)
      const currentVersion = aggregate.versions.at(-1)
      const { status } = aggregate.idea
      if (currentVersion === undefined || status !== 'active') {
        throw new Error('idea create returned an unexpected aggregate')
      }
      const result: IdeaCreateResult = {
        ideaId: aggregate.idea.ideaId,
        currentVersionId: aggregate.idea.currentVersionId,
        status,
        title: currentVersion.draft.title,
        createdAt: aggregate.idea.createdAt,
      }
      this.commits.set(preparationId, { kind: 'committed', result })
      return result
    } catch (error) {
      // Rules 8/9: a failed write is retryable; a failure is never cached.
      this.commits.delete(preparationId)
      throw this.durableError(error)
    }
  }

  /** Map a commit-path failure onto the wire vocabulary. */
  private durableError(error: unknown): RemoteError | undefined {
    const domain = remoteDomainError(error)
    if (domain !== undefined) return domain
    return new RemoteError('idea/storage-failed', 'the idea could not be saved', {}, { cause: error })
  }

  /**
   * List the saved Ideas as read-only summaries, most recently updated first.
   * Archived ideas are retrieval-filtered out; nothing is ever written.
   */
  @Remote
  async list(): Promise<IdeaSummary[]> {
    return this.ctx.ideaService.list().map(view => ideaSummaryOf(
      this.ctx.ideaService.get(view.idea.ideaId),
      view.currentVersion,
    ))
  }

  /**
   * Read one Idea's current version in full detail. Archived ideas stay
   * readable — archived is retrieval filtering, never deletion. Unknown ids
   * map onto `idea/not-found`.
   */
  @Remote
  async get(request: IdeaGetRequest): Promise<IdeaDetail> {
    try {
      const aggregate = this.ctx.ideaService.get(IdeaId(request.id))
      return ideaDetailOf(aggregate)
    } catch (error) {
      throw remoteDomainError(error) ?? error
    }
  }

  /**
   * Read one Idea's complete version history, v1 first. Read-only: nothing
   * is ever written, and storage records never cross the wire.
   */
  @Remote
  async getVersions(request: IdeaGetRequest): Promise<IdeaVersionSummary[]> {
    try {
      return this.ctx.ideaService.listVersions(IdeaId(request.id)).map(ideaVersionSummaryOf)
    } catch (error) {
      throw remoteDomainError(error) ?? error
    }
  }

  /**
   * Read one committed version in full detail. Read-only, like every other
   * read of this namespace.
   */
  @Remote
  async getVersion(request: IdeaVersionGetRequest): Promise<IdeaVersionDetail> {
    try {
      const version = this.ctx.ideaService.getVersion(IdeaId(request.id), IdeaVersionId(request.versionId))
      return ideaVersionDetailOf(version)
    } catch (error) {
      throw remoteDomainError(error) ?? error
    }
  }

  /**
   * Continue one Idea as a new focused conversation. Idempotency lives on
   * the domain service (an active discussion for the same idea + current
   * version is reused, so one click never duplicates workspaces); this
   * layer owns only the conversation-creation seam. The Idea is never
   * written, and the context seed stays Host-side.
   */
  @Remote
  async continueDiscussion(request: IdeaContinueDiscussionRequest): Promise<IdeaContinueDiscussionResult> {
    try {
      const discussion = await this.ctx.ideaService.continueDiscussion(IdeaId(request.id), () => this.createConversation())
      return {
        discussionId: discussion.discussionId,
        conversationId: discussion.conversationId,
        baseVersionId: discussion.baseVersionId,
      }
    } catch (error) {
      throw remoteDomainError(error) ?? error
    }
  }

  /**
   * Propose the next version of one Idea from its continued discussion.
   * Delegates entirely to the evolution service; zero durable writes. A
   * stale or expired conversation surfaces as a preparation failure, never
   * as a write.
   */
  @Remote
  async prepareEvolution(
    request: IdeaPrepareEvolutionRequest,
    signal?: AbortSignal,
  ): Promise<IdeaEvolutionProposalPreview> {
    try {
      return await this.ctx.ideaEvolutions.prepare(request.discussionId, signal)
    } catch (error) {
      throw remoteEvolutionError(error) ?? remotePreparationError(error) ?? remoteDomainError(error) ?? error
    }
  }

  /**
   * Commit the user-approved proposal as the next immutable version. The
   * optimistic version check runs twice — against the proposal's base and
   * again inside the domain write — so a stale proposal is rejected with
   * zero partial writes, and a consumed proposal can never commit twice.
   */
  @Remote
  async commitEvolution(request: IdeaCommitEvolutionRequest): Promise<IdeaCommitEvolutionResult> {
    const parsed = ideaDraftSchema.safeParse(request.draft)
    if (!parsed.success) {
      throw new RemoteError('idea/invalid-draft', 'the approved idea draft is invalid', {
        issues: parsed.error.issues,
      })
    }
    try {
      const aggregate = await this.ctx.ideaEvolutions.commit(
        request.proposalId,
        IdeaVersionId(request.expectedCurrentVersionId),
        parsed.data,
      )
      const version = aggregate.versions.find(entry => entry.versionId === aggregate.idea.currentVersionId)
      if (version === undefined || aggregate.idea.status !== 'active') {
        throw new Error('idea evolution commit returned an unexpected aggregate')
      }
      return {
        ideaId: aggregate.idea.ideaId,
        currentVersionId: version.versionId,
        ordinal: version.ordinal,
        title: version.draft.title,
        status: aggregate.idea.status,
      }
    } catch (error) {
      throw remoteEvolutionError(error) ?? remoteDomainError(error) ?? error
    }
  }

  /**
   * Judge which saved Ideas would genuinely help the discussion behind one
   * finalized assistant message right now. Delegates entirely to the Related
   * service; zero durable writes. An empty candidate corpus and a zero-match
   * judgment are both successes with no items.
   */
  @Remote
  async relatedFromMessage(request: IdeaRelatedRequest, signal?: AbortSignal): Promise<IdeaRelatedResult> {
    try {
      const result = await this.ctx.ideaRelated.relatedFromMessage(request.sessionId, request.messageId, signal)
      return {
        items: result.items.map(match => ({
          idea: {
            id: match.idea.id,
            currentVersionId: match.idea.currentVersionId,
            title: match.idea.title,
            core: match.idea.core,
            updatedAt: match.idea.updatedAt,
          },
          whyUsefulNow: match.whyUsefulNow,
        })),
      }
    } catch (error) {
      throw remotePreparationError(error) ?? error
    }
  }

  /**
   * The one conversation the continuation opens, through the Host Session
   * Controller with its default workspace — the same deployment default the
   * client's New Session affordance uses. Lazy resolution keeps the Idea
   * remote mountable where session APIs are not (and matches the Harness
   * convention for optional host services).
   */
  private async createConversation(): Promise<string> {
    const sessions = this.ctx.get('sessionController')
    if (sessions === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'continue discussion is unavailable: this deployment mounts no session controller',
        {},
      )
    }
    try {
      const created = await sessions.create({})
      return created.sessionId
    } catch (error) {
      throw new RemoteError(
        'idea/conversation-failed',
        'the continuation conversation could not be created',
        {},
        { cause: error },
      )
    }
  }
}

/**
 * The primary source snapshot the version cites, absent when it cites none.
 * The durable provenance array may hold further citations; V1 renders only
 * the primary one while the full array stays on the record.
 */
function citedSourceOf(aggregate: IdeaAggregate, version: IdeaVersion): IdeaSummary['source'] {
  const discussionId = version.sourceDiscussionIds[0]
  if (discussionId === undefined) return undefined
  const discussion = aggregate.sourceDiscussions.find(entry => entry.sourceDiscussionId === discussionId)
  if (discussion === undefined) return undefined
  return {
    sessionId: discussion.sessionId,
    ...(discussion.anchorMessageId !== undefined ? { anchorMessageId: discussion.anchorMessageId } : {}),
  }
}

/** The wire summary of one Idea over its current version. */
function ideaSummaryOf(aggregate: IdeaAggregate, version: IdeaVersion): IdeaSummary {
  const source = citedSourceOf(aggregate, version)
  return {
    id: aggregate.idea.ideaId,
    title: version.draft.title,
    core: version.draft.core,
    motivation: version.draft.motivation,
    createdAt: aggregate.idea.createdAt,
    updatedAt: aggregate.idea.updatedAt,
    ...(source !== undefined ? { source } : {}),
  }
}

/** The full wire detail of one Idea: the summary plus its current version. */
function ideaDetailOf(aggregate: IdeaAggregate): IdeaDetail {
  const version = aggregate.versions.find(entry => entry.versionId === aggregate.idea.currentVersionId)
  if (version === undefined) {
    throw new Error(`idea '${aggregate.idea.ideaId}' has no current version`)
  }
  return {
    ...ideaSummaryOf(aggregate, version),
    currentConclusion: version.draft.currentConclusion,
    possibleValue: version.draft.possibleValue,
    useWhen: [...version.draft.useWhen],
    openQuestions: [...version.draft.openQuestions],
    versionId: version.versionId,
  }
}

/** The wire summary of one committed version: identity, reason, title. */
function ideaVersionSummaryOf(version: IdeaVersion): IdeaVersionSummary {
  return {
    id: version.versionId,
    ordinal: version.ordinal,
    reason: version.reason,
    title: version.draft.title,
    createdAt: version.createdAt,
  }
}

/** The full wire detail of one committed version, over its summary. */
function ideaVersionDetailOf(version: IdeaVersion): IdeaVersionDetail {
  return {
    ...ideaVersionSummaryOf(version),
    core: version.draft.core,
    motivation: version.draft.motivation,
    currentConclusion: version.draft.currentConclusion,
    possibleValue: version.draft.possibleValue,
    useWhen: [...version.draft.useWhen],
    openQuestions: [...version.draft.openQuestions],
  }
}
