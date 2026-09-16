/**
 * The Ideas settings section: the saved-Idea list (title, core, created
 * time, source indicator), the read-only detail view over one Idea's
 * current version, its source-conversation linkage, the Continue Discussion
 * entry, and the evolution proposal flow the discussion unlocks: prepare a
 * proposed next version, review its editable draft, then cancel with zero
 * writes or approve it as the next immutable version. The list and detail
 * renders are strictly read-only; the section's only writes are the
 * explicit 继续讨论 and 保存为新版本 buttons.
 * @module @dsh-external/dsh-idea/client/IdeaSection
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IdeaDetail, IdeaVersionSummary } from '../remote-host/types.ts'
import type { IdeaVersionReason } from '../types.ts'
import { requiredPresent } from './state.ts'
import type { EditableIdeaDraft } from './state.ts'
import type { IdeaReadState, IdeaProposalState } from './read-state.ts'
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

/** The editable proposal fields, mirroring the save dialog's order. */
const EVOLUTION_FIELDS: ReadonlyArray<{
  key: keyof EditableIdeaDraft
  label: IdeaLocaleKey
  multiline: boolean
}> = [
  { key: 'title', label: 'field.title', multiline: false },
  { key: 'core', label: 'field.core', multiline: true },
  { key: 'motivation', label: 'field.motivation', multiline: true },
  { key: 'currentConclusion', label: 'read.field.currentConclusion', multiline: true },
  { key: 'possibleValue', label: 'read.field.possibleValue', multiline: true },
  { key: 'useWhenText', label: 'field.useWhen', multiline: true },
  { key: 'openQuestionsText', label: 'field.openQuestions', multiline: true },
]

/**
 * The Ideas library section: list and detail, nothing else.
 * @param props - the injected verbs, the read-state hook, and the locale seat.
 * @returns the section element tree.
 */
export function IdeaSection({
  open, closeDetail, continueIdea, prepareEvolution, editProposalDraft, cancelProposal, commitProposal, load, useIdeaRead, t,
}: IdeaSectionProps): ReactNode {
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
          state.proposal !== null
            ? (
                <IdeaEvolutionPreviewView
                  detail={state.detail}
                  versions={state.detailVersions}
                  proposal={state.proposal}
                  evolutionStatus={state.evolutionStatus}
                  evolutionFailure={state.evolutionFailure}
                  editProposalDraft={editProposalDraft}
                  cancelProposal={cancelProposal}
                  commitProposal={commitProposal}
                  t={t}
                />
              )
            : (
                <IdeaDetailView
                  detail={state.detail}
                  versions={state.detailVersions}
                  versionsStatus={state.detailVersionsStatus}
                  continueStatus={state.continueStatus}
                  discussionId={state.discussionId}
                  evolutionStatus={state.evolutionStatus}
                  evolutionFailure={state.evolutionFailure}
                  continueIdea={continueIdea}
                  prepareEvolution={prepareEvolution}
                  t={t}
                />
              )
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
  {
    detail, versions, versionsStatus, continueStatus, discussionId, evolutionStatus, evolutionFailure, continueIdea, prepareEvolution, t,
  }: {
    detail: IdeaDetail
    versions: readonly IdeaVersionSummary[]
    versionsStatus: 'loading' | 'ready' | 'error'
    continueStatus: 'idle' | 'loading' | 'error'
    discussionId: IdeaReadState['discussionId']
    evolutionStatus: IdeaReadState['evolutionStatus']
    evolutionFailure: IdeaReadState['evolutionFailure']
    continueIdea: (id: string) => void
    prepareEvolution: () => void
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
      {discussionId !== null && (
        <div className="dsh-idea-evolution">
          <Button
            variant="outline"
            disabled={evolutionStatus === 'preparing'}
            onClick={prepareEvolution}
          >
            {evolutionStatus === 'preparing' ? t('read.evolve.loading') : t('read.evolve')}
          </Button>
          {evolutionStatus === 'error' && evolutionFailure === 'stale' && (
            <p className="dsh-idea-state">{t('read.evolve.staleError')}</p>
          )}
          {evolutionStatus === 'error' && evolutionFailure === 'prepare' && (
            <p className="dsh-idea-state">{t('read.evolve.prepareError')}</p>
          )}
        </div>
      )}
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

/**
 * The evolution proposal preview: the proposed next version's editable
 * draft over the base-version line, with cancel (zero writes) and the one
 * approving save. Fields are editable only while not committing; a failed
 * commit keeps the reviewed draft on screen.
 */
function IdeaEvolutionPreviewView(
  {
    detail, versions, proposal, evolutionStatus, evolutionFailure, editProposalDraft, cancelProposal, commitProposal, t,
  }: {
    detail: IdeaDetail
    versions: readonly IdeaVersionSummary[]
    proposal: IdeaProposalState
    evolutionStatus: IdeaReadState['evolutionStatus']
    evolutionFailure: IdeaReadState['evolutionFailure']
    editProposalDraft: (patch: Partial<EditableIdeaDraft>) => void
    cancelProposal: () => void
    commitProposal: () => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  const committing = evolutionStatus === 'committing'
  const base = versions.find(version => version.id === proposal.baseVersionId)
  const commitDisabled = committing || !requiredPresent(proposal.draft)
  return (
    <div className="dsh-idea-detail">
      <h3 className="dsh-idea-detail-title">{t('read.evolve.title')}</h3>
      <p className="dsh-idea-row-meta">
        {base !== undefined
          ? t('read.evolve.base', { ordinal: base.ordinal })
          : t('read.evolve.baseUnknown')}
      </p>
      <div className="dsh-idea-form" role="form" aria-label={t('read.evolve.title')}>
        {EVOLUTION_FIELDS.map(field => (
          field.multiline
            ? (
                <label key={field.key} className="dsh-idea-field">
                  {t(field.label)}
                  <textarea
                    value={proposal.draft[field.key]}
                    readOnly={committing}
                    onChange={event => { editProposalDraft({ [field.key]: event.target.value }) }}
                  />
                </label>
              )
            : (
                <label key={field.key} className="dsh-idea-field">
                  {t(field.label)}
                  <input
                    type="text"
                    value={proposal.draft[field.key]}
                    readOnly={committing}
                    onChange={event => { editProposalDraft({ [field.key]: event.target.value }) }}
                  />
                </label>
              )
        ))}
      </div>
      {evolutionFailure === 'commit' && <p className="dsh-idea-state">{t('read.evolve.commitError')}</p>}
      <div className="dsh-idea-evolution-actions">
        <Button disabled={committing} onClick={cancelProposal}>{t('read.evolve.cancel')}</Button>
        <Button variant="primary" disabled={commitDisabled} onClick={commitProposal}>
          {committing ? t('read.evolve.committing') : t('read.evolve.commit')}
        </Button>
      </div>
      <p className="dsh-idea-row-meta">{t('read.evolve.readonlyHint', { title: detail.title })}</p>
    </div>
  )
}
