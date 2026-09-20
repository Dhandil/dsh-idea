/**
 * The Session's contextual Idea resurfacing strip on the composer dock
 * seat: at most one lightweight suggestion — a banner naming one saved
 * Idea with three verbs (View, Reference, Dismiss). View opens a read-only
 * detail expansion; Reference goes through the accepted attach seam;
 * Dismiss silences this opportunity in this conversation. The strip never
 * injects context and never mutates the conversation or the Idea: until
 * the user picks Reference, nothing is written anywhere.
 * @module @dsh-external/dsh-idea/client/IdeaResurfaceStrip
 */

import type { ResurfaceStripProps } from './slots.ts'

/**
 * The Session's contextual Idea resurfacing strip (rendered only while a
 * suggestion is visible).
 * @param props - the injected verbs, the shared resurfacing state hook, and
 * the locale seat.
 * @returns the strip (while a suggestion is visible).
 */
export function IdeaResurfaceStrip({ useResurface, toggleDetail, reference, dismiss, t }: ResurfaceStripProps) {
  const state = useResurface(view => view)
  const suggestion = state.suggestion
  if (suggestion === null) return null

  return (
    <section className="dsh-idea-resurface" aria-label={t('resurface.title')}>
      <div className="dsh-idea-resurface-main">
        <span className="dsh-idea-resurface-text">
          {t('resurface.banner', { title: suggestion.title })}
        </span>
        <span className="dsh-idea-resurface-actions">
          <button
            type="button"
            className="dsh-idea-resurface-action"
            aria-expanded={state.detailOpen}
            onClick={toggleDetail}
          >
            {state.detailOpen ? t('resurface.collapse') : t('resurface.view')}
          </button>
          <button type="button" className="dsh-idea-resurface-action" onClick={reference}>
            {t('resurface.reference')}
          </button>
          <button type="button" className="dsh-idea-resurface-action" onClick={dismiss}>
            {t('resurface.dismiss')}
          </button>
        </span>
      </div>
      {state.detailOpen && (
        <div className="dsh-idea-resurface-detail">
          <p className="dsh-idea-resurface-field">
            <span className="dsh-idea-resurface-field-label">{t('read.field.core')}</span>
            {suggestion.core}
          </p>
          <p className="dsh-idea-resurface-field">
            <span className="dsh-idea-resurface-field-label">{t('read.field.possibleValue')}</span>
            {suggestion.possibleValue}
          </p>
          <p className="dsh-idea-resurface-field">
            <span className="dsh-idea-resurface-field-label">{t('read.field.useWhen')}</span>
            {suggestion.useWhen.join('；')}
          </p>
          <p className="dsh-idea-resurface-field">
            <span className="dsh-idea-resurface-field-label">{t('read.field.currentConclusion')}</span>
            {suggestion.currentConclusion}
          </p>
        </div>
      )}
    </section>
  )
}
