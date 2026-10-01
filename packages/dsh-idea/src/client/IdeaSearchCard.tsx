/**
 * The Session's floating Idea panel on the composer overlay seat (T12.3):
 * one panel, two subviews. **List mode** — the search input (blank = the
 * current library by recency), Host-ranked results with single selection,
 * and a footer whose left secondary action opens the capture subview and
 * whose right primary action attaches the selected Idea's canonical pinned
 * reference to the draft. **Capture subview** — a note saved directly (zero
 * model calls) or AI-organized into an editable proposal, both through the
 * Host's idempotent preparation/commit machine; the back action returns to
 * the list keeping the search query and the unsaved note. Closing — via ×,
 * outside click, or Escape — keeps its phase-aware semantics: an idle draft
 * clears, while a commit or an unresolved recovery is never dropped.
 * @module @dsh-external/dsh-idea/client/IdeaSearchCard
 */

import { useEffect, useRef } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SearchCardProps } from './slots.ts'

/**
 * The Session's Idea panel.
 * @param props - the injected verbs, the shared search/quick-capture state
 * hooks, and the locale seat.
 * @returns the panel (while open).
 */
export function IdeaSearchCard({ setQuery, select, retry, add, back, close, useSearch, useQuick, quick, t }: SearchCardProps) {
  const state = useSearch(view => view)
  const quickState = useQuick(view => view)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!state.open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [state.open, close])

  if (!state.open) return null

  const selected = state.selectedId
  const capture = quickState.open
  const canSave = quickState.text.trim().length > 0 && quickState.preparing === 'none'
  const failureCopy = quickState.failure === 'commit-failed'
    ? t('quick.commitFailed')
    : quickState.failure === 'handoff-failed'
      ? t('quick.handoffFailed')
      : t('quick.failed')

  return (
    <div className="dsh-idea-search-layer">
      <div className="dsh-idea-search-backdrop" aria-hidden onClick={close} />
      <section className="dsh-idea-search" aria-label={t('search.title')}>
        <header className="dsh-idea-search-head">
          {capture ? (
            <button
              type="button"
              className="dsh-idea-search-back"
              onClick={back}
            >
              {t('quick.back')}
            </button>
          ) : (
            <span className="dsh-idea-search-title">{t('search.title')}</span>
          )}
          <button
            type="button"
            className="dsh-idea-search-close"
            aria-label={t('search.close')}
            title={t('search.close')}
            onClick={close}
          >
            ×
          </button>
        </header>
        {capture ? (
          <div className="dsh-idea-quick-form">
            <textarea
              className="dsh-idea-quick-input"
              value={quickState.text}
              placeholder={t('quick.placeholder')}
              aria-label={t('quick.placeholder')}
              rows={6}
              autoFocus
              onChange={event => { quick.setText(event.target.value) }}
            />
            {quickState.failure !== null && <p className="dsh-idea-state">{failureCopy}</p>}
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              className="dsh-idea-search-input"
              type="text"
              value={state.query}
              placeholder={t('search.placeholder')}
              aria-label={t('search.placeholder')}
              autoFocus
              onChange={event => { setQuery(event.target.value) }}
            />
            <div className="dsh-idea-search-body" role="listbox" aria-label={t('search.title')}>
              {state.status === 'loading' && <p className="dsh-idea-state">{t('read.loading')}</p>}
              {state.status === 'error' && (
                <p className="dsh-idea-state">
                  {t('search.error')}
                  <Button onClick={retry}>{t('read.retry')}</Button>
                </p>
              )}
              {state.status === 'ready' && state.items.length === 0 && (
                <p className="dsh-idea-state">{t('search.empty')}</p>
              )}
              {state.status === 'ready' && state.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected === item.id}
                  className={
                    'dsh-idea-search-row'
                    + (selected === item.id ? ' dsh-idea-search-row-selected' : '')
                  }
                  onClick={() => { select(item.id) }}
                >
                  <span className="dsh-idea-row-title">{item.title}</span>
                  {item.core.length > 0 && <span className="dsh-idea-row-core">{item.core}</span>}
                </button>
              ))}
            </div>
          </>
        )}
        <footer className="dsh-idea-search-foot">
          {capture ? (
            <>
              <Button
                disabled={!canSave}
                onClick={quick.organize}
              >
                {quickState.preparing === 'ai' ? t('quick.organizing') : t('quick.organize')}
              </Button>
              <Button
                variant="primary"
                disabled={!canSave}
                onClick={quick.saveDirect}
              >
                {quickState.preparing === 'direct' ? t('quick.saving') : t('quick.saveDirect')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={quick.open}
              >
                {t('quick.title')}
              </Button>
              <Button
                variant="primary"
                disabled={selected === null}
                onClick={() => {
                  const descriptor = state.items.find(item => item.id === selected)?.reference
                  if (descriptor !== undefined) add(descriptor)
                }}
              >
                {t('search.add')}
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  )
}
