/**
 * The Session's Related Ideas overlay: loading, error, empty, and ready
 * states over one explicit query. Every ready card shows the Host-owned
 * canonical title and core plus the model's why-useful-now reason, with
 * exactly two verbs — Add (attach the Host-owned pinned reference to the
 * draft) and View (the read-only full detail inside the overlay). Internal
 * scores and model routes never render; the detail renders the Idea's
 * current version only and offers no lifecycle mutation. Closing resets the
 * surface with zero durable writes and zero conversation changes — results
 * are suggestions only, never injected context on their own.
 * @module @dsh-external/dsh-idea/client/IdeaRelatedOverlay
 */

import { useCallback, useRef, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IdeaDetail } from '../remote-host/types.ts'
import type { RelatedOverlayProps } from './slots.ts'

type DetailView =
  | { phase: 'closed' }
  | { phase: 'loading' }
  | { phase: 'ready'; detail: IdeaDetail }
  | { phase: 'error' }

/**
 * The Session's Related Ideas overlay.
 * @param props - the injected verbs, the shared Related Ideas state hook,
 * and the locale seat.
 * @returns the overlay (when a query is loading or has results).
 */
export function IdeaRelatedOverlay({ close, getDetail, add, useRelated, t }: RelatedOverlayProps) {
  const state = useRelated(view => view)
  const [detail, setDetail] = useState<DetailView>({ phase: 'closed' })
  /** Bumped per open so a stale completion cannot land in a newer view. */
  const viewEpoch = useRef(0)

  const openDetail = useCallback((id: string) => {
    const epoch = viewEpoch.current + 1
    viewEpoch.current = epoch
    setDetail({ phase: 'loading' })
    void getDetail(id).then((result) => {
      if (viewEpoch.current !== epoch) return
      if (result.ok) setDetail({ phase: 'ready', detail: result.value })
      else setDetail({ phase: 'error' })
    }).catch(() => {
      if (viewEpoch.current === epoch) setDetail({ phase: 'error' })
    })
  }, [getDetail])

  const backFromDetail = useCallback(() => {
    viewEpoch.current += 1
    setDetail({ phase: 'closed' })
  }, [])

  if (state.status === 'idle') return null

  const detailIdea = detail.phase === 'ready' ? detail.detail : undefined
  const detailReference = detailIdea === undefined
    ? undefined
    : state.items.find(item => item.idea.id === detailIdea.id)?.reference

  return (
    <Modal
      open
      title={t('related.title')}
      closeLabel={t('related.close')}
      onClose={() => {
        viewEpoch.current += 1
        setDetail({ phase: 'closed' })
        close()
      }}
      className="dsh-idea-modal"
      footer={<Button onClick={close}>{t('related.close')}</Button>}
    >
      {detail.phase === 'closed' && (
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
                  <div className="dsh-idea-card-actions">
                    <Button onClick={() => { openDetail(match.idea.id) }}>{t('related.view')}</Button>
                    <Button variant="primary" onClick={() => { add(match.reference) }}>{t('search.add')}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {detail.phase === 'loading' && <p className="dsh-idea-state">{t('read.loading')}</p>}
      {detail.phase === 'error' && <p className="dsh-idea-state">{t('read.detail.error')}</p>}
      {detailIdea !== undefined && (
        <div className="dsh-idea-related" aria-label={t('read.detail.view')}>
          <span className="dsh-idea-row-title">{detailIdea.title}</span>
          <span className="dsh-idea-detail-label">
            {detailIdea.status === 'archived' ? t('read.status.archived') : ''}
            {' · '}
            {t('read.updated', { time: new Date(detailIdea.updatedAt).toLocaleString() })}
          </span>
          <span className="dsh-idea-detail-label">{t('read.field.core')}</span>
          <p className="dsh-idea-detail-text">{detailIdea.core}</p>
          <span className="dsh-idea-detail-label">{t('read.field.motivation')}</span>
          <p className="dsh-idea-detail-text">{detailIdea.motivation}</p>
          <span className="dsh-idea-detail-label">{t('read.field.currentConclusion')}</span>
          <p className="dsh-idea-detail-text">{detailIdea.currentConclusion}</p>
          <span className="dsh-idea-detail-label">{t('read.field.possibleValue')}</span>
          <p className="dsh-idea-detail-text">{detailIdea.possibleValue}</p>
          <span className="dsh-idea-detail-label">{t('read.field.useWhen')}</span>
          <ul className="dsh-idea-detail-list">
            {detailIdea.useWhen.map((entry, index) => <li key={index}>{entry}</li>)}
          </ul>
          <span className="dsh-idea-detail-label">{t('read.field.openQuestions')}</span>
          <ul className="dsh-idea-detail-list">
            {detailIdea.openQuestions.map((entry, index) => <li key={index}>{entry}</li>)}
          </ul>
          <div className="dsh-idea-card-actions">
            <Button variant="outline" onClick={backFromDetail}>{t('read.back')}</Button>
            {detailReference !== undefined && (
              <Button variant="primary" onClick={() => { add(detailReference) }}>
                {t('search.add')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
