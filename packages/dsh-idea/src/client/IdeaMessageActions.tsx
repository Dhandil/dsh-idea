/**
 * The per-message `💡` control in the assistant action row. Clicking starts
 * the one prepare call for that message; while it is in flight the control
 * shows a disabled state and swallows further clicks.
 * @module @dsh-external/dsh-idea/client/IdeaMessageActions
 */

import { useCallback } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IdeaActionProps } from './slots.ts'

/**
 * One assistant message's Save Idea control.
 * @param props - the owner's message identity, the injected verbs, the shared
 * Idea state hook, and the locale seat.
 * @returns the bulb action button.
 */
export function IdeaMessageActions({ messageId, prepare, useIdea, t }: IdeaActionProps) {
  const preparing = useIdea(state => state.preparingMessageId === messageId)
  const onPrepare = useCallback(() => {
    prepare(messageId)
  }, [messageId, prepare])

  return (
    <Tooltip label={t('action.tooltip')} side="bottom">
      <button
        type="button"
        className="dsh-idea-action"
        aria-label={t('action.tooltip')}
        title={t('action.tooltip')}
        disabled={preparing}
        onClick={onPrepare}
      >
        💡
      </button>
    </Tooltip>
  )
}
