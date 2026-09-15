/**
 * The `idea` Remote service (`ctx.idea`): the explicit Save Idea path exposed
 * to the web client. `prepareFromMessage` delegates to the T2 preparation
 * service and maps its failures onto the wire vocabulary; `create` resolves
 * canonical source provenance from the Host-only registry, validates the
 * user-edited draft, and runs the idempotent commit state machine
 * (`prepared → committing → committed`) so one preparationId produces at
 * most one durable Idea even under duplicate or concurrent requests. The
 * browser may only ever submit a draft plus a preparation reference.
 * @module @dsh-external/dsh-idea/src/remote-host/service
 */

import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ideaDraftSchema } from '../schema.ts'
import { IdeaPreparationError } from '../preparation/errors.ts'
import type { IdeaPreparationId, PreparedIdeaSource } from '../preparation/types.ts'
import type { IdeaDraft, SourceDiscussionDraft } from '../types.ts'
import { remoteDomainError, remotePreparationError } from './errors.ts'
import type { IdeaCreateRequest, IdeaCreateResult, IdeaPrepareRequest } from './types.ts'
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
  static inject = ['ideaService', 'ideaPreparations']

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
        title: currentVersion.title,
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
}
