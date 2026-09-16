/**
 * The Host-side continuation-context injector (`ctx.ideaContinuations`). On
 * the first accepted Agent pre-step of a continued-discussion conversation it
 * prepends exactly one plugin-sourced user-role context message carrying the
 * discussion's frozen `IdeaContinuationContext`; the message becomes durable
 * through the loop's normal admission, and the durable session log — not an
 * in-memory flag — decides whether the context was already delivered, so a
 * restart or resume never injects twice. The listener always delegates
 * through `next()` first, so later policy listeners keep authority; a
 * downstream reject admits nothing. Creating or opening a discussion never
 * touches the model.
 * @module @dsh-external/dsh-idea/src/continuation/service
 */

import { Service } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { isIdeaContinuationContextMessage, renderIdeaContinuationContext } from './context.ts'
import type { SurfaceEvent } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaContinuations: IdeaContinuationService
  }
}

/**
 * The continuation-context injector. Registers one prepended
 * `agent/pre-step` listener for its lifetime; disposal with the service
 * removes it.
 */
export class IdeaContinuationService extends Service {
  static inject = ['ideaService', 'sessionQuery']

  constructor(ctx: ConstructorParameters<typeof Service>[0]) {
    super(ctx, 'ideaContinuations')
  }

  protected [Service.init](): void {
    this.ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      if (signal.aborted) return decision

      const discussion = this.ctx.ideaService.findDiscussionByConversationId(agent.session.id)
      if (discussion === undefined) return decision

      if (await this.delivered(discussion.conversationId)) return decision

      return {
        ...decision,
        messages: [
          createUserMessage({
            content: [{ type: 'text', text: renderIdeaContinuationContext(discussion.context) }],
            source: { kind: 'plugin', plugin: 'dsh-idea', form: 'recall' },
          }),
          ...decision.messages,
        ],
      }
    }, { prepend: true })
  }

  /**
   * Whether the durable derived history of the conversation already contains
   * a delivered continuation context. The session log is the authority; an
   * unreadable log is treated as already delivered, because a duplicate seed
   * is worse than a deferred one.
   */
  private async delivered(conversationId: string): Promise<boolean> {
    let events: readonly SurfaceEvent[]
    try {
      const surface = await this.ctx.sessionQuery.readSurface(SessionId(conversationId))
      events = surface.events
    } catch (error) {
      this.ctx.logger.warn(
        `idea continuation context could not read session '${conversationId}'; skipping injection (${String(error)})`,
      )
      return true
    }
    return events.some(event =>
      event.type === 'user/message' && isIdeaContinuationContextMessage(event.data))
  }
}
