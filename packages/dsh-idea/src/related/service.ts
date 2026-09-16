/**
 * The Related Ideas service (`ctx.ideaRelated`). One explicit call is one
 * bounded judgment: read the Session surface, capture the visible discussion
 * behind the requested assistant anchor (the accepted T2 policy), project the
 * eligible corpus — every non-archived Idea's current version, minus the
 * Idea a continued discussion on this Session already seeds — select the
 * candidate pool deterministically (corpus within the frozen limit passes
 * whole; a larger corpus is lexically ranked), and make exactly one direct
 * `ctx.llm.stream()` usefulness call — no Agent Loop, no tools, no retry.
 * The judgment is parsed strictly and re-projected onto canonical Host-owned
 * Idea data in model order. The whole path is read-only: durable Idea bytes
 * before a call equal the bytes after it, and an empty corpus or an empty
 * judgment is a success with zero items (the latter still costs its one
 * call; the former costs none).
 * @module @dsh-external/dsh-idea/src/related/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { captureDiscussionFromSurface } from '../preparation/context.ts'
import { checkCancelled, extractModelText, readSessionSurface, resolveModelRoute } from '../preparation/pipeline.ts'
import type { IdeaCurrentView, IdeaService } from '../index.ts'
import { parseRelatedMatches } from './parser.ts'
import { buildRelatedIdeasPrompt } from './prompt.ts'
import { extractQueryFeatures, projectCandidates, selectCandidates } from './retrieval.ts'
import type { RelatedIdeaCandidate, RelatedIdeasResult } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaRelated: IdeaRelatedService
  }
}

/**
 * The eligible candidate corpus of one Session: every non-archived Idea's
 * current version, detached, minus the Idea a continued discussion on this
 * Session already seeds. A historical source snapshot that merely references
 * the same conversation never excludes anything — only an IdeaDiscussion
 * binding does.
 */
export function eligibleRelatedCandidates(ideaService: IdeaService, sessionId: string): RelatedIdeaCandidate[] {
  const discussion = ideaService.findDiscussionByConversationId(sessionId)
  const excluded = discussion?.ideaId
  return ideaService.list()
    .filter(view => excluded === undefined || view.idea.ideaId !== excluded)
    .map(candidateOf)
}

/** The detached current-version candidate one stored Idea contributes. */
function candidateOf(view: IdeaCurrentView): RelatedIdeaCandidate {
  return {
    ideaId: view.idea.ideaId,
    currentVersionId: view.idea.currentVersionId,
    title: view.currentVersion.draft.title,
    core: view.currentVersion.draft.core,
    motivation: view.currentVersion.draft.motivation,
    currentConclusion: view.currentVersion.draft.currentConclusion,
    possibleValue: view.currentVersion.draft.possibleValue,
    useWhen: [...view.currentVersion.draft.useWhen],
    openQuestions: [...view.currentVersion.draft.openQuestions],
    updatedAt: view.idea.updatedAt,
  }
}

export class IdeaRelatedService extends Service {
  static inject = ['ideaService', 'sessionQuery', 'agentDefaultModel', 'llm']

  constructor(ctx: Context) {
    super(ctx, 'ideaRelated')
  }

  /**
   * Judge which saved Ideas would genuinely help the discussion behind one
   * finalized assistant message right now.
   * @param sessionId - The Session the discussion lives in.
   * @param anchorMessageId - The finalized assistant message to judge from.
   * @param signal - Optional caller cancellation; checked at every stage.
   * @returns zero to three canonical matches, in model order.
   * @throws `IdeaPreparationError` with a stable {@link IdeaPreparationErrorCode}.
   */
  async relatedFromMessage(
    sessionId: string,
    anchorMessageId: string,
    signal?: AbortSignal,
  ): Promise<RelatedIdeasResult> {
    checkCancelled(signal)

    const surface = await readSessionSurface(this.ctx.sessionQuery, sessionId)
    checkCancelled(signal)

    const captured = captureDiscussionFromSurface(surface.events, anchorMessageId)
    checkCancelled(signal)

    const candidates = eligibleRelatedCandidates(this.ctx.ideaService, sessionId)
    if (candidates.length === 0) {
      return { items: [] }
    }

    const features = extractQueryFeatures(captured.messages.map(message => message.text).join('\n'))
    const pool = selectCandidates(candidates, features)
    const projection = projectCandidates(pool)

    const route = await resolveModelRoute(this.ctx.sessionQuery, this.ctx.agentDefaultModel, sessionId, signal)
    checkCancelled(signal)

    const prompt = buildRelatedIdeasPrompt({ messages: captured.messages, candidates: projection })
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
    const text = await extractModelText(this.ctx.llm, options, sessionId, signal)
    checkCancelled(signal)

    const judgments = parseRelatedMatches(text, new Set(pool.map(candidate => candidate.ideaId)))
    const byId = new Map<string, RelatedIdeaCandidate>(
      pool.map(candidate => [candidate.ideaId as string, candidate]),
    )
    return {
      items: judgments.map((judgment) => {
        const candidate = byId.get(judgment.ideaId)!
        return {
          idea: {
            id: candidate.ideaId,
            currentVersionId: candidate.currentVersionId,
            title: candidate.title,
            core: candidate.core,
            updatedAt: candidate.updatedAt,
          },
          whyUsefulNow: judgment.whyUsefulNow,
        }
      }),
    }
  }
}
