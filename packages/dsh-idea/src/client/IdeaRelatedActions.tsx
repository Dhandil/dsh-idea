/**
 * The per-message Related Ideas control in the assistant action row, beside
 * the Save Idea action. Clicking starts the one explicit query for that
 * message; while it is in flight the control shows a disabled state and
 * swallows further clicks. Normal conversation carries zero Related Ideas
 * cost until the user clicks.
 * @module @dsh-external/dsh-idea/client/IdeaRelatedActions
 */

import { useCallback } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RelatedActionProps } from './slots.ts'

/**
 * One assistant message's Related Ideas control.
 * @param props - the owner's message identity, the injected verbs, the
 * shared Related Ideas state hook, and the locale seat.
 * @returns the Related Ideas action button.
 */
export function IdeaRelatedActions({ messageId, findRelated, useRelated, t }: RelatedActionProps) {
  const loading = useRelated(state => state.loadingMessageId === messageId)
  const onFindRelated = useCallback(() => {
    findRelated(messageId)
  }, [messageId, findRelated])

  return (
    <Tooltip label={t('related.action')} side="bottom">
      <button
        type="button"
        className="dsh-idea-action dsh-idea-action-text"
        aria-label={t('related.action')}
        title={t('related.action')}
        disabled={loading}
        onClick={onFindRelated}
      >
        {t('related.action')}
      </button>
    </Tooltip>
  )
}
