/**
 * The unified per-message Idea action: one outline-light-bulb entry in the
 * assistant action row opening one menu with exactly the two operations —
 * Summarize (the existing prepare path) and Related (the existing
 * findRelated path). Same 28 px geometry and tertiary color as the row's
 * built-in buttons; no emoji, no yellow. Pending state is local per
 * operation: one running query disables only its own menu item and never
 * fires a duplicate call.
 * @module @dsh-external/dsh-idea/client/IdeaAssistantActions
 */

import { useCallback, useState } from 'react'
import { IconLightOutline16, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { UnifiedActionProps } from './slots.ts'

/**
 * One assistant message's unified Idea action.
 * @param props - the owner's message identity, the injected verbs, the two
 * shared state hooks, and the locale seat.
 * @returns the action button with its operation menu.
 */
export function IdeaAssistantActions({ messageId, prepare, findRelated, useIdea, useRelated, t }: UnifiedActionProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const preparing = useIdea(state => state.preparingMessageId === messageId)
  const relating = useRelated(state => state.loadingMessageId === messageId)

  const onPrepare = useCallback(() => {
    setMenuOpen(false)
    if (!preparing) prepare(messageId)
  }, [messageId, prepare, preparing])

  const onFindRelated = useCallback(() => {
    setMenuOpen(false)
    if (!relating) findRelated(messageId)
  }, [messageId, findRelated, relating])

  return (
    <Menu
      open={menuOpen}
      align="end"
      portal
      items={[
        { id: 'summarize', label: t('action.menu.summarize'), disabled: preparing },
        { id: 'related', label: t('action.menu.related'), disabled: relating },
      ]}
      onSelect={(id) => {
        if (id === 'summarize') onPrepare()
        else onFindRelated()
      }}
      onClose={() => { setMenuOpen(false) }}
      anchor={(
        <button
          type="button"
          className="dsh-idea-action"
          aria-label={t('action.tooltip')}
          title={t('action.tooltip')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => { setMenuOpen(open => !open) }}
        >
          <IconLightOutline16 size={15} />
        </button>
      )}
    />
  )
}
