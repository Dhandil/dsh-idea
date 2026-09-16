/**
 * The Evolution preparation service (`ctx.ideaEvolutions`). `prepare` turns
 * one continued discussion into a pending proposal: read the Idea and its
 * current version, capture the discussion conversation's whole visible
 * surface, resolve the model route through the shared Harness seams, make
 * exactly one direct `ctx.llm.stream()` call — no Agent Loop, no tools, no
 * hidden retry — parse the response strictly against the T1 `IdeaDraft`, and
 * register the proposal ephemerally. Preparation itself never writes durable
 * Idea state. `commit` is the only path to a new version: the user-approved
 * draft flows through `IdeaService.evolve`, whose optimistic check rejects a
 * stale base version, and the proposal is consumed after success so it can
 * never commit twice.
 * @module @dsh-external/dsh-idea/src/evolution/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { collectDiscussionFromSurface } from './context.ts'
import { parseIdeaDraftOutput } from '../preparation/parser.ts'
import { buildIdeaEvolutionPrompt } from './prompt.ts'
import {
  checkCancelled,
  extractModelText,
  readSessionSurface,
  resolveModelRoute,
} from '../preparation/pipeline.ts'
import { IdeaEvolutionRegistry } from './registry.ts'
import { EvolutionProposalId, IdeaDiscussionId } from '../types.ts'
import { IdeaError } from '../errors.ts'
import type { IdeaEvolutionPreview, PreparedEvolution } from './types.ts'
import type { IdeaPreparationModelRoute } from '../preparation/types.ts'
import type {
  IdeaAggregate,
  IdeaDraft,
  IdeaEvolutionReason,
  IdeaHistorySummaryEntry,
  IdeaVersionId,
} from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaEvolutions: IdeaEvolutionService
  }
}

export class IdeaEvolutionService extends Service {
  static inject = ['ideaService', 'sessionQuery', 'agentDefaultModel', 'llm']

  /** Host-only ephemeral registry; proposals live until consumed or expired. */
  readonly proposals: IdeaEvolutionRegistry

  constructor(ctx: Context) {
    super(ctx, 'ideaEvolutions')
    this.proposals = new IdeaEvolutionRegistry()
  }

  /**
   * Prepare one evolution proposal from a continued discussion. Reads only:
   * no durable Idea write happens on this path. The preparation is bound to
   * the discussion's frozen base: when the Idea has moved past
   * `discussion.baseVersionId` the call rejects with `version-conflict`
   * before any model call, never silently rebasing onto the latest version,
   * and the proposal seed is exactly the discussion's durable continuation
   * context.
   * @param discussionId - The continued-discussion workspace to evolve from.
   * @param signal - Optional caller cancellation; checked at every stage.
   * @returns the preview carrying the opaque proposal id and proposed draft.
   * @throws `IdeaError` with `idea-not-found` / `discussion-not-found`,
   * `version-conflict` when the discussion's base version is superseded,
   * `invalid-input` on corrupt durable state, and `IdeaPreparationError` with
   * a stable {@link IdeaPreparationErrorCode}.
   */
  async prepare(discussionId: string, signal?: AbortSignal): Promise<IdeaEvolutionPreview> {
    checkCancelled(signal)

    const discussion = this.ctx.ideaService.getDiscussion(IdeaDiscussionId(discussionId))
    const aggregate = this.ctx.ideaService.get(discussion.ideaId)
    if (aggregate.idea.currentVersionId !== discussion.baseVersionId) {
      throw new IdeaError(
        'version-conflict',
        `discussion '${discussionId}' is based on '${discussion.baseVersionId}' but the idea is at `
        + `'${aggregate.idea.currentVersionId}'; start a new discussion from the latest version`,
      )
    }
    const baseVersion = this.ctx.ideaService.getVersion(discussion.ideaId, discussion.baseVersionId)
    const context = discussion.context
    if (context.type !== 'idea-continuation'
      || context.idea.id !== discussion.ideaId
      || context.idea.currentVersion !== discussion.baseVersionId) {
      throw new IdeaError(
        'invalid-input',
        `discussion '${discussionId}' carries a continuation context inconsistent with its base version `
        + `'${baseVersion.versionId}'`,
      )
    }

    checkCancelled(signal)
    const surface = await readSessionSurface(this.ctx.sessionQuery, discussion.conversationId)
    checkCancelled(signal)

    const captured = collectDiscussionFromSurface(surface.events)

    const route = await resolveModelRoute(
      this.ctx.sessionQuery,
      this.ctx.agentDefaultModel,
      discussion.conversationId,
      signal,
    )
    checkCancelled(signal)

    const draft = await this.extractProposal(
      context.idea.draft,
      context.idea.historySummary,
      captured.messages,
      discussion.conversationId,
      route,
      signal,
    )

    checkCancelled(signal)
    const prepared: PreparedEvolution = {
      proposal: {
        ideaId: discussion.ideaId,
        baseVersionId: discussion.baseVersionId,
        draft,
        reason: 'continued-discussion' satisfies IdeaEvolutionReason,
        createdAt: Date.now(),
      },
      source: {
        sessionId: discussion.conversationId,
        startSeq: captured.startSeq,
        endSeq: captured.endSeq,
        capturedContext: captured.messages,
      },
    }
    const proposalId = this.proposals.register(prepared)
    return {
      proposalId,
      ideaId: discussion.ideaId,
      baseVersionId: discussion.baseVersionId,
      reason: prepared.proposal.reason,
      draft,
    }
  }

  /**
   * Commit an approved proposal as the next immutable version. The expected
   * current version is re-confirmed twice: here against the proposal's base,
   * and again inside `IdeaService.evolve`'s optimistic write. The proposal is
   * consumed only after a successful commit, so a duplicate commit can never
   * create a second version from the same proposal.
   * @param proposalId - The opaque id returned by {@link prepare}.
   * @param expectedCurrentVersionId - The version the client last saw.
   * @param draft - The user-approved draft to commit.
   * @returns the updated aggregate.
   * @throws `IdeaEvolutionError` with `proposal-not-found` when the proposal
   * is unknown, expired, or already committed; `IdeaError` with
   * `version-conflict` when the Idea moved past the proposal's base version,
   * and `invalid-draft` when the approved draft fails validation.
   */
  async commit(
    proposalId: string,
    expectedCurrentVersionId: IdeaVersionId,
    draft: IdeaDraft,
  ): Promise<IdeaAggregate> {
    const entry = this.proposals.resolve(EvolutionProposalId(proposalId))
    if (entry.proposal.baseVersionId !== expectedCurrentVersionId) {
      throw new IdeaError(
        'version-conflict',
        `proposal '${proposalId}' was prepared against a superseded version`,
      )
    }
    const aggregate = await this.ctx.ideaService.evolve(
      entry.proposal.ideaId,
      draft,
      entry.source,
      entry.proposal.baseVersionId,
      entry.proposal.reason,
    )
    this.proposals.consume(entry.proposal.proposalId)
    return aggregate
  }

  /**
   * The single proposal attempt: one `ctx.llm.stream()` call drained by the
   * shared pipeline, then parsed strictly against the T1 `IdeaDraft`.
   */
  private async extractProposal(
    currentDraft: IdeaDraft,
    historySummary: readonly IdeaHistorySummaryEntry[],
    messages: readonly { role: 'user' | 'assistant'; text: string }[],
    sessionId: string,
    route: IdeaPreparationModelRoute,
    signal?: AbortSignal,
  ): Promise<IdeaDraft> {
    const prompt = buildIdeaEvolutionPrompt({
      currentDraft,
      historySummary,
      openQuestions: currentDraft.openQuestions,
      messages,
    })
    const options: GenerateOptions = {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort !== undefined ? { reasoningEffort: ReasoningEffortId(route.reasoningEffort) } : {}),
      messages: [createUserMessage({
        content: [{ type: 'text', text: prompt.user }],
        source: { kind: 'plugin', plugin: 'dsh-idea' },
      })],
      system: prompt.system,
      sessionId: SessionId(sessionId),
      ...(signal !== undefined ? { signal } : {}),
    }
    return parseIdeaDraftOutput(await extractModelText(this.ctx.llm, options, sessionId, signal))
  }
}
