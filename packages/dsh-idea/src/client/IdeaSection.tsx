/**
 * The Ideas settings section: the saved-Idea list (title, core, created
 * time, source indicator) and the read-only detail view over one Idea's
 * current version, including its source-conversation linkage and the
 * Continue Discussion entry. The list and the detail renders are strictly
 * read-only — the section loads on mount, opens details on click, and its
 * one write path is the explicit 继续讨论 button.
 * @module @dsh-external/dsh-idea/client/IdeaSection
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IdeaDetail, IdeaVersionSummary } from '../remote-host/types.ts'
import type { IdeaVersionReason } from '../types.ts'
import type { IdeaSectionProps } from './slots.ts'
import type { IdeaLocaleKey } from './locales.ts'

/** The shown time formatting: the browser's own locale conventions. */
const formatTime = (timestamp: number): string => new Date(timestamp).toLocaleString()

/** One read-only detail field with its copy key; empty text is skipped. */
const DETAIL_FIELDS: ReadonlyArray<{ key: 'core' | 'motivation' | 'currentConclusion' | 'possibleValue', label: IdeaLocaleKey }> = [
  { key: 'core', label: 'read.field.core' },
  { key: 'motivation', label: 'read.field.motivation' },
  { key: 'currentConclusion', label: 'read.field.currentConclusion' },
  { key: 'possibleValue', label: 'read.field.possibleValue' },
]

/** The reason label of one history row, per version reason. */
const REASON_LABELS: Readonly<Record<IdeaVersionReason, IdeaLocaleKey>> = {
  'initial-save': 'read.reason.initial-save',
  'manual-edit': 'read.reason.manual-edit',
  'continued-discussion': 'read.reason.continued-discussion',
}

/**
 * The Ideas library section: list and detail, nothing else.
 * @param props - the injected verbs, the read-state hook, and the locale seat.
 * @returns the section element tree.
 */
export function IdeaSection({ open, closeDetail, continueIdea, load, useIdeaRead, t }: IdeaSectionProps): ReactNode {
  const state = useIdeaRead(view => view)
  useEffect(() => { load() }, [load])

  if (state.detailId !== null) {
    return (
      <div className="dsh-idea-library">
        <Button variant="outline" onClick={closeDetail}>{t('read.back')}</Button>
        {state.detailStatus === 'loading' && <p className="dsh-idea-state">{t('read.loading')}</p>}
        {state.detailStatus === 'error' && (
          <p className="dsh-idea-state">
            {state.detailErrorCode === 'idea/not-found' ? t('read.detail.notFound') : t('read.detail.error')}
          </p>
        )}
        {state.detailStatus === 'ready' && state.detail !== null && (
          <IdeaDetailView
            detail={state.detail}
            versions={state.detailVersions}
            versionsStatus={state.detailVersionsStatus}
            continueStatus={state.continueStatus}
            continueIdea={continueIdea}
            t={t}
          />
        )}
      </div>
    )
  }

  return (
    <div className="dsh-idea-library">
      {state.status !== 'ready' && state.status !== 'error' && <p className="dsh-idea-state">{t('read.loading')}</p>}
      {state.status === 'error' && (
        <>
          <p className="dsh-idea-state">{t('read.error')}</p>
          <Button variant="outline" onClick={() => { load() }}>{t('read.retry')}</Button>
        </>
      )}
      {state.status === 'ready' && state.items.length === 0 && <p className="dsh-idea-state">{t('read.empty')}</p>}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="dsh-idea-list" role="list">
          {state.items.map(idea => (
            <li key={idea.id}>
              <button
                type="button"
                className="dsh-idea-row"
                onClick={() => { open(idea.id) }}
              >
                <span className="dsh-idea-row-title">{idea.title}</span>
                <span className="dsh-idea-row-core">{idea.core}</span>
                <span className="dsh-idea-row-meta">
                  {t('read.created', { time: formatTime(idea.createdAt) })}
                  {idea.source !== undefined
                    ? ` · ${t('read.source.short', { sessionId: idea.source.sessionId })}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The read-only detail over one Idea's current version, plus its history and the continuation entry. */
function IdeaDetailView(
  { detail, versions, versionsStatus, continueStatus, continueIdea, t }: {
    detail: IdeaDetail
    versions: readonly IdeaVersionSummary[]
    versionsStatus: 'loading' | 'ready' | 'error'
    continueStatus: 'idle' | 'loading' | 'error'
    continueIdea: (id: string) => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  const source = detail.source
  const current = versions.find(version => version.id === detail.versionId)
  return (
    <div className="dsh-idea-detail">
      <h3 className="dsh-idea-detail-title">{detail.title}</h3>
      <p className="dsh-idea-row-meta">
        {t('read.created', { time: formatTime(detail.createdAt) })}
        {' · '}
        {t('read.updated', { time: formatTime(detail.updatedAt) })}
      </p>
      {source !== undefined && (
        <p className="dsh-idea-source">
          {source.anchorMessageId !== undefined
            ? t('read.source.detail', { sessionId: source.sessionId, anchor: source.anchorMessageId })
            : t('read.source.detail.noAnchor', { sessionId: source.sessionId })}
        </p>
      )}
      <div className="dsh-idea-continue">
        <Button
          variant="outline"
          disabled={continueStatus === 'loading'}
          onClick={() => { continueIdea(detail.id) }}
        >
          {continueStatus === 'loading' ? t('read.continue.loading') : t('read.continue')}
        </Button>
        {continueStatus === 'error' && <p className="dsh-idea-state">{t('read.continue.error')}</p>}
      </div>
      {DETAIL_FIELDS.map(({ key, label }) => (
        detail[key].trim().length > 0
          ? (
              <div key={key} className="dsh-idea-detail-field">
                <span className="dsh-idea-detail-label">{t(label)}</span>
                <p className="dsh-idea-detail-text">{detail[key]}</p>
              </div>
            )
          : null
      ))}
      <IdeaDetailList label={t('read.field.useWhen')} items={detail.useWhen} />
      <IdeaDetailList label={t('read.field.openQuestions')} items={detail.openQuestions} />
      {versionsStatus === 'ready' && current !== undefined && (
        <div className="dsh-idea-history">
          <span className="dsh-idea-detail-label">{t('read.history')}</span>
          <p className="dsh-idea-history-current">{t('read.history.current', { ordinal: current.ordinal })}</p>
          <ul className="dsh-idea-history-list" role="list">
            {versions.map(version => (
              <li key={version.id} className="dsh-idea-history-row">
                <span className="dsh-idea-history-version">{`v${version.ordinal}`}</span>
                <span className="dsh-idea-history-reason">{t(REASON_LABELS[version.reason])}</span>
                <span className="dsh-idea-history-title">{version.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** One bounded string list of the detail, skipped when empty. */
function IdeaDetailList({ label, items }: { label: string, items: readonly string[] }): ReactNode {
  if (items.length === 0) return null
  return (
    <div className="dsh-idea-detail-field">
      <span className="dsh-idea-detail-label">{label}</span>
      <ul className="dsh-idea-detail-list" role="list">
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}
