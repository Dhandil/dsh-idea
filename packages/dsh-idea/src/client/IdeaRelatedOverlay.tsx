/**
 * The Session's Related Ideas overlay: loading, error, empty, and ready
 * states over one explicit query. Every ready card shows the Host-owned
 * canonical title and core plus the model's why-useful-now reason; internal
 * scores and model routes never render. Closing resets the surface with
 * zero durable writes and zero conversation changes — results are
 * suggestions only, never injected context.
 * @module @dsh-external/dsh-idea/client/IdeaRelatedOverlay
 */

import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RelatedOverlayProps } from './slots.ts'

/**
 * The Session's Related Ideas overlay.
 * @param props - the injected verbs, the shared Related Ideas state hook,
 * and the locale seat.
 * @returns the overlay (when a query is loading or has results).
 */
export function IdeaRelatedOverlay({ close, useRelated, t }: RelatedOverlayProps) {
  const state = useRelated(view => view)
  if (state.status === 'idle') return null

  return (
    <Modal
      open
      title={t('related.title')}
      closeLabel={t('related.close')}
      onClose={close}
      className="dsh-idea-modal"
      footer={<Button onClick={close}>{t('related.close')}</Button>}
    >
      <div className="dsh-idea-related" aria-label={t('related.title')}>
        {state.status === 'loading' && <p className="dsh-idea-state">{t('related.loading')}</p>}
        {state.status === 'error' && <p className="dsh-idea-state">{t('related.error')}</p>}
        {state.status === 'ready' && state.items.length === 0 && (
          <p className="dsh-idea-state">{t('related.empty')}</p>
        )}
        {state.status === 'ready' && state.items.length > 0 && (
          <ul className="dsh-idea-list">
            {state.items.map(match => (
              <li key={match.idea.id} className="dsh-idea-card">
                <span className="dsh-idea-row-title">{match.idea.title}</span>
                {match.idea.core.length > 0 && <span className="dsh-idea-row-core">{match.idea.core}</span>}
                <span className="dsh-idea-detail-label">{t('related.why')}</span>
                <p className="dsh-idea-detail-text">{match.whyUsefulNow}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
