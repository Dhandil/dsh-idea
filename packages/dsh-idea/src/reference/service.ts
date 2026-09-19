/**
 * The Host-side Idea reference resolver (`ctx.ideaReferences`). On every
 * accepted Agent pre-step it inspects only direct user messages
 * (`source.kind === 'user'`) for `@[label](dsh-idea:...)` mentions, resolves
 * each pinned exact Idea/version, rewrites the mention text to a readable
 * `Idea「label」` form, and appends exactly one plugin-sourced user-role
 * recall context carrying the bounded projections. Malformed or
 * unresolvable references reject the request loudly instead of silently
 * dropping or substituting. The listener always delegates through `next()`
 * first, so later policy listeners keep authority; a downstream reject
 * admits nothing. No model call happens here.
 * @module @dsh-external/dsh-idea/src/reference/service
 */

import { Service } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import { IdeaId, IdeaVersionId } from '../types.ts'
import { renderReferencedIdeasContext } from './context.ts'
import { MAX_IDEA_REFERENCES, projectReferencedIdeas } from './projection.ts'
import { parseIdeaReferenceText } from './uri.ts'
import type { IdeaReferencePin } from './uri.ts'
import type { ReferencedIdeaInput } from './projection.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaReferences: IdeaReferenceService
  }
}

interface ResolvedReference {
  pin: IdeaReferencePin
  title: string
  record: ReferencedIdeaInput
}

function isDirectUserMessage(message: Message): boolean {
  return message.role === 'user' && message.source.kind === 'user'
}

function mentionTextOf(message: Message): string {
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/** Replace every mention occurrence with its readable form, per text block. */
function rewriteMentions(text: string, readable: ReadonlyMap<string, string>): string {
  let rewritten = text
  for (const [mention, label] of readable) {
    rewritten = rewritten.split(mention).join(`Idea「${label}」`)
  }
  return rewritten
}

/**
 * The Idea reference resolver. Registers one prepended `agent/pre-step`
 * listener for its lifetime; disposal with the service removes it.
 */
export class IdeaReferenceService extends Service {
  static inject = ['ideaService']

  constructor(ctx: ConstructorParameters<typeof Service>[0]) {
    super(ctx, 'ideaReferences')
  }

  protected [Service.init](): void {
    this.ctx.on('agent/pre-step', async ({ signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      if (signal.aborted) return decision

      const direct = decision.messages.filter(message => isDirectUserMessage(message))
      if (direct.length === 0) return decision

      let parsed: ReturnType<typeof parseIdeaReferenceText>
      try {
        parsed = direct.flatMap(message => {
          const text = mentionTextOf(message)
          return text.length > 0 ? parseIdeaReferenceText(text) : []
        })
      } catch {
        // A mention-shaped string whose payload is malformed or non-canonical
        // fails loud: the request is not admitted rather than the reference
        // silently degrading to plain text.
        return { kind: 'reject' }
      }
      if (parsed.length === 0) return decision

      const pins = new Map<string, IdeaReferencePin>()
      for (const entry of parsed) {
        const key = `${entry.pin.ideaId}::${entry.pin.versionId}`
        if (!pins.has(key)) pins.set(key, entry.pin)
      }
      const selected = [...pins.values()].slice(0, MAX_IDEA_REFERENCES)

      const resolved: ResolvedReference[] = []
      for (const pin of selected) {
        let version
        try {
          // A deleted Idea/version fails loud: the request is rejected before
          // the model call rather than silently dropping or substituting.
          version = this.ctx.ideaService.getVersion(IdeaId(pin.ideaId), IdeaVersionId(pin.versionId))
        } catch {
          return { kind: 'reject' }
        }
        resolved.push({
          pin,
          title: version.draft.title,
          record: {
            ideaId: version.ideaId,
            versionId: version.versionId,
            title: version.draft.title,
            core: version.draft.core,
            motivation: version.draft.motivation,
            currentConclusion: version.draft.currentConclusion,
            possibleValue: version.draft.possibleValue,
            useWhen: version.draft.useWhen,
            openQuestions: version.draft.openQuestions,
          },
        })
      }

      const readable = new Map<string, string>()
      for (const entry of resolved) {
        const mention = parsed.find(item => item.pin.ideaId === entry.pin.ideaId && item.pin.versionId === entry.pin.versionId)!.mention
        readable.set(mention, entry.title)
      }

      const messages = decision.messages.map(message => {
        if (!isDirectUserMessage(message)) return message
        let changed = false
        const content = message.content.map(block => {
          if (block.type !== 'text') return block
          const text = rewriteMentions(block.text, readable)
          if (text !== block.text) changed = true
          return { ...block, text }
        })
        return changed ? { ...message, content } : message
      })

      const lastDirectIndex = findLastIndex(messages, isDirectUserMessage)
      const context = createUserMessage({
        content: [{ type: 'text', text: renderReferencedIdeasContext(projectReferencedIdeas(resolved.map(entry => entry.record))) }],
        source: { kind: 'plugin', plugin: 'dsh-idea', form: 'recall' },
      })
      messages.splice(lastDirectIndex + 1, 0, context)

      return { ...decision, messages }
    }, { prepend: true })
  }
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index
  }
  return -1
}
