/**
 * The Session's floating Idea search card on the composer overlay seat:
 * a search input (blank = the current library by recency), Host-ranked
 * results with single selection, and one primary Add action that attaches
 * the selected Idea's canonical pinned reference to the draft. Closing —
 * via ×, outside click, or Escape — has zero side effects: the draft, the
 * conversation, and the model are untouched, and Add never submits.
 * @module @dsh-external/dsh-idea/client/IdeaSearchCard
 */

import { useEffect, useRef } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SearchCardProps } from './slots.ts'

/**
 * The Session's Idea search card.
 * @param props - the injected verbs, the shared search state hook, and the
 * locale seat.
 * @returns the card (while open).
 */
export function IdeaSearchCard({ setQuery, select, retry, add, close, useSearch, t }: SearchCardProps) {
  const state = useSearch(view => view)
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

  return (
    <div className="dsh-idea-search-layer">
      <div className="dsh-idea-search-backdrop" aria-hidden onClick={close} />
      <section className="dsh-idea-search" aria-label={t('search.title')}>
        <header className="dsh-idea-search-head">
          <span className="dsh-idea-search-title">{t('search.title')}</span>
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
        <footer className="dsh-idea-search-foot">
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
        </footer>
      </section>
    </div>
  )
}
