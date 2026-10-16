/** dsh-idea's merge-extensible attribution for model-facing user messages. */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

/** The producer-specific source retained with dsh-idea context messages. */
export type IdeaMessageSource = { readonly kind: 'dsh-idea' } & ContextFormed

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-idea': IdeaMessageSource
  }
}
