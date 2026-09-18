/**
 * The Ideas settings section: the two-view library (当前 / 已归档 tabs, no
 * deleted view), one lightweight index row per Idea (title, one-line core,
 * updated time) with an optional hover preview card whose Edit quick action
 * is independently clickable, the read-only detail view over one Idea's
 * current version, and the lifecycle flows: manual edit (the shared
 * seven-field draft form, Save as New Version, cancel with zero writes,
 * no-change Save disabled), Continue Discussion, the evolution proposal
 * flow, Archive, Restore, and the detail-only permanent delete behind an
 * acknowledged RiskConfirmation. Hover is a convenience — every action is
 * reachable without it. Nothing renders optimistically: the lists refetch
 * after confirmed Host mutations, and archived details expose only
 * Restore/Delete.
 * @module @dsh-external/dsh-idea/client/IdeaSection
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Pill, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import { IdeaHoverCard } from './hover-card.tsx'
import type { IdeaDetail, IdeaListRow, IdeaVersionSummary } from '../remote-host/types.ts'
import type { IdeaVersionReason } from '../types.ts'
import { durableFrom, requiredPresent, sameIdeaDraft } from './state.ts'
import type { EditableIdeaDraft } from './state.ts'
import { detailDraftOf } from './read-state.ts'
import type { IdeaDeletionState, IdeaEditState, IdeaReadState, IdeaProposalState } from './read-state.ts'
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

/** The seven editable draft fields, mirroring the save dialog's order; shared
 * by the evolution proposal preview and the manual-edit editor. */
const DRAFT_FIELDS: ReadonlyArray<{
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
  open, closeDetail, selectView, openEditor, continueIdea, prepareEvolution,
  editProposalDraft, cancelProposal, commitProposal,
  editDraft, cancelEdit, saveEdit,
  archiveIdea, restoreIdea, requestDelete, cancelDelete, confirmDelete,
  load, useIdeaRead, t,
}: IdeaSectionProps): ReactNode {
  const state = useIdeaRead(view => view)
  useEffect(() => { load() }, [load])

  if (state.detailId !== null) {
    const editing = state.edit.status !== 'idle' && state.edit.ideaId === state.detailId
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
          editing && state.edit.draft !== null
            ? (
                <IdeaManualEditView
                  detail={state.detail}
                  edit={state.edit}
                  onEditDraft={editDraft}
                  onCancel={cancelEdit}
                  onSave={saveEdit}
                  t={t}
                />
              )
            : state.proposal !== null
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
                    archiveStatus={state.archiveStatus}
                    restoreStatus={state.restoreStatus}
                    continueIdea={continueIdea}
                    prepareEvolution={prepareEvolution}
                    openEditor={openEditor}
                    archiveIdea={archiveIdea}
                    restoreIdea={restoreIdea}
                    requestDelete={requestDelete}
                    t={t}
                  />
                )
        )}
        {state.deletion.status !== 'closed' && (
          <IdeaDeleteDialog deletion={state.deletion} onCancel={cancelDelete} onConfirm={confirmDelete} t={t} />
        )}
      </div>
    )
  }

  const view = state.lists[state.view]
  return (
    <div className="dsh-idea-library">
      <div className="dsh-idea-tabs" role="tablist">
        <Pill active={state.view === 'current'} onClick={() => { selectView('current') }}>{t('read.tab.current')}</Pill>
        <Pill active={state.view === 'archived'} onClick={() => { selectView('archived') }}>{t('read.tab.archived')}</Pill>
      </div>
      {view.status !== 'ready' && view.status !== 'error' && <p className="dsh-idea-state">{t('read.loading')}</p>}
      {view.status === 'error' && (
        <>
          <p className="dsh-idea-state">{t('read.error')}</p>
          <Button variant="outline" onClick={() => { load() }}>{t('read.retry')}</Button>
        </>
      )}
      {view.status === 'ready' && view.items.length === 0 && (
        <p className="dsh-idea-state">
          {state.view === 'archived' ? t('read.emptyArchived') : t('read.empty')}
        </p>
      )}
      {view.status === 'ready' && view.items.length > 0 && (
        <ul className="dsh-idea-list" role="list">
          {view.items.map(idea => (
            <IdeaRow key={idea.id} idea={idea} open={open} openEditor={openEditor} t={t} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** One lightweight library row: title, one-line core, updated time — plus the
 * optional hover preview card. The row stays the keyboard/touch entry: it
 * opens the full detail where every action lives. */
function IdeaRow(
  {
    idea, open, openEditor, t,
  }: {
    idea: IdeaListRow
    open: (id: string) => void
    openEditor: (id: string) => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  return (
    <li>
      <IdeaHoverCard
        anchor={(
          <button
            type="button"
            className="dsh-idea-row"
            onClick={() => { open(idea.id) }}
          >
            <span className="dsh-idea-row-title">{idea.title}</span>
            <span className="dsh-idea-row-core">{idea.core}</span>
            <span className="dsh-idea-row-meta">
              {t('read.updated', { time: formatTime(idea.updatedAt) })}
            </span>
          </button>
        )}
        content={<IdeaPreviewCard idea={idea} openEditor={openEditor} t={t} />}
      />
    </li>
  )
}

/**
 * The hover preview card: the bounded projection (title, core, current
 * conclusion when non-empty, up to three use-when entries, the open-question
 * count, updated time). The card is portaled, so its Edit quick action is
 * genuinely clickable without triggering the row's navigation. Archived
 * ideas get no Edit and never a Delete. Exported for focused tests.
 */
export function IdeaPreviewCard(
  {
    idea, openEditor, t,
  }: {
    idea: IdeaListRow
    openEditor: (id: string) => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  return (
    <div className="dsh-idea-preview">
      <span className="dsh-idea-preview-title">{idea.title}</span>
      <span className="dsh-idea-preview-core">{idea.core}</span>
      {idea.currentConclusion.trim().length > 0 && (
        <span className="dsh-idea-preview-line">
          <span className="dsh-idea-detail-label">{t('read.field.currentConclusion')}</span>
          <span className="dsh-idea-preview-text">{idea.currentConclusion}</span>
        </span>
      )}
      {idea.useWhen.length > 0 && (
        <span className="dsh-idea-preview-line">
          <span className="dsh-idea-detail-label">{t('read.field.useWhen')}</span>
          <ul className="dsh-idea-detail-list" role="list">
            {idea.useWhen.slice(0, 3).map(item => <li key={item}>{item}</li>)}
          </ul>
        </span>
      )}
      <span className="dsh-idea-preview-meta">
        {t('read.preview.openQuestions', { count: idea.openQuestionsCount })}
        {' · '}
        {t('read.updated', { time: formatTime(idea.updatedAt) })}
      </span>
      {idea.status !== 'archived' && (
        <Button variant="outline" onClick={() => { openEditor(idea.id) }}>{t('read.edit')}</Button>
      )}
    </div>
  )
}

/** The read-only detail over one Idea's current version, its history, and the
 * status-scoped lifecycle actions (non-archived: Edit/Continue/Archive;
 * archived: Restore — plus the detail-only permanent delete for both). */
function IdeaDetailView(
  {
    detail, versions, versionsStatus, continueStatus, discussionId, evolutionStatus, evolutionFailure,
    archiveStatus, restoreStatus, continueIdea, prepareEvolution, openEditor, archiveIdea, restoreIdea, requestDelete, t,
  }: {
    detail: IdeaDetail
    versions: readonly IdeaVersionSummary[]
    versionsStatus: 'loading' | 'ready' | 'error'
    continueStatus: 'idle' | 'loading' | 'error'
    discussionId: IdeaReadState['discussionId']
    evolutionStatus: IdeaReadState['evolutionStatus']
    evolutionFailure: IdeaReadState['evolutionFailure']
    archiveStatus: IdeaReadState['archiveStatus']
    restoreStatus: IdeaReadState['restoreStatus']
    continueIdea: (id: string) => void
    prepareEvolution: () => void
    openEditor: (id: string) => void
    archiveIdea: () => void
    restoreIdea: () => void
    requestDelete: () => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  const source = detail.source
  const archived = detail.status === 'archived'
  const current = versions.find(version => version.id === detail.versionId)
  return (
    <div className="dsh-idea-detail">
      <h3 className="dsh-idea-detail-title">{detail.title}</h3>
      <p className="dsh-idea-row-meta">
        {t('read.created', { time: formatTime(detail.createdAt) })}
        {' · '}
        {t('read.updated', { time: formatTime(detail.updatedAt) })}
        {archived ? ` · ${t('read.status.archived')}` : ''}
      </p>
      {source !== undefined && (
        <p className="dsh-idea-source">
          {source.anchorMessageId !== undefined
            ? t('read.source.detail', { sessionId: source.sessionId, anchor: source.anchorMessageId })
            : t('read.source.detail.noAnchor', { sessionId: source.sessionId })}
        </p>
      )}
      <div className="dsh-idea-actions">
        {!archived && (
          <>
            <Button variant="outline" onClick={() => { openEditor(detail.id) }}>{t('read.edit')}</Button>
            <Button
              variant="outline"
              disabled={continueStatus === 'loading'}
              onClick={() => { continueIdea(detail.id) }}
            >
              {continueStatus === 'loading' ? t('read.continue.loading') : t('read.continue')}
            </Button>
            <Button variant="outline" disabled={archiveStatus === 'loading'} onClick={archiveIdea}>
              {archiveStatus === 'loading' ? t('read.archive.loading') : t('read.archive')}
            </Button>
          </>
        )}
        {archived && (
          <Button variant="outline" disabled={restoreStatus === 'loading'} onClick={restoreIdea}>
            {restoreStatus === 'loading' ? t('read.restore.loading') : t('read.restore')}
          </Button>
        )}
        <Button variant="outline" onClick={requestDelete}>{t('read.delete')}</Button>
      </div>
      {continueStatus === 'error' && <p className="dsh-idea-state">{t('read.continue.error')}</p>}
      {archiveStatus === 'error' && <p className="dsh-idea-state">{t('read.archive.error')}</p>}
      {restoreStatus === 'error' && <p className="dsh-idea-state">{t('read.restore.error')}</p>}
      {!archived && discussionId !== null && (
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

/** The shared seven-field editable draft form (evolution preview + manual edit). */
function IdeaDraftFields(
  {
    draft, disabled, onEdit, t,
  }: {
    draft: EditableIdeaDraft
    disabled: boolean
    onEdit: (patch: Partial<EditableIdeaDraft>) => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  return (
    <>
      {DRAFT_FIELDS.map(field =>
        field.multiline
          ? (
              <label key={field.key} className="dsh-idea-field">
                {t(field.label)}
                <textarea
                  value={draft[field.key]}
                  readOnly={disabled}
                  onChange={event => { onEdit({ [field.key]: event.target.value }) }}
                />
              </label>
            )
          : (
              <label key={field.key} className="dsh-idea-field">
                {t(field.label)}
                <input
                  type="text"
                  value={draft[field.key]}
                  readOnly={disabled}
                  onChange={event => { onEdit({ [field.key]: event.target.value }) }}
                />
              </label>
            )
      )}
    </>
  )
}

/**
 * The manual-edit editor: the seven current-version fields over the loaded
 * detail, Cancel (zero writes) and the one Save-as-new-version button.
 * Normalized no-change disables Save (the domain independently defends the
 * same invariant); a failed or conflicting commit keeps every edit visible.
 */
function IdeaManualEditView(
  {
    detail, edit, onEditDraft, onCancel, onSave, t,
  }: {
    detail: IdeaDetail
    edit: IdeaEditState
    onEditDraft: (patch: Partial<EditableIdeaDraft>) => void
    onCancel: () => void
    onSave: () => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  const draft = edit.draft
  if (draft === null) return null
  const committing = edit.status === 'committing'
  const unchanged = sameIdeaDraft(durableFrom(draft), detailDraftOf(detail))
  const saveDisabled = committing || unchanged || !requiredPresent(draft)
  return (
    <div className="dsh-idea-detail">
      <h3 className="dsh-idea-detail-title">{t('read.edit.title')}</h3>
      <div className="dsh-idea-form" role="form" aria-label={t('read.edit.title')}>
        <IdeaDraftFields draft={draft} disabled={committing} onEdit={onEditDraft} t={t} />
      </div>
      {edit.status === 'conflict' && <p className="dsh-idea-state">{t('read.edit.conflict')}</p>}
      {edit.status === 'error' && <p className="dsh-idea-state">{t('read.edit.error')}</p>}
      <div className="dsh-idea-evolution-actions">
        <Button disabled={committing} onClick={onCancel}>{t('read.edit.cancel')}</Button>
        <Button variant="primary" disabled={saveDisabled} onClick={onSave}>
          {committing ? t('read.edit.saving') : t('read.edit.save')}
        </Button>
      </div>
      <p className="dsh-idea-row-meta">{t('read.edit.hint')}</p>
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
        <IdeaDraftFields draft={proposal.draft} disabled={committing} onEdit={editProposalDraft} t={t} />
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

/**
 * The detail-only permanent-delete confirmation: the acknowledgement gate
 * keeps 永久删除 disabled until checked, cancel closes with zero durable
 * writes, and a failed delete keeps the dialog open with error copy. The
 * description states plainly that existing Harness conversations survive.
 */
function IdeaDeleteDialog(
  {
    deletion, onCancel, onConfirm, t,
  }: {
    deletion: IdeaDeletionState
    onCancel: () => void
    onConfirm: () => void
    t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
  },
): ReactNode {
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => {
    if (deletion.status === 'closed') setAcknowledged(false)
  }, [deletion.status])
  const deleting = deletion.status === 'deleting'
  // The exact §14 description stays verbatim; a failed delete appends the
  // visible failure copy to it, since the dialog is the only readable
  // surface while it is open.
  const description = deletion.status === 'error'
    ? `${t('read.delete.description')} ${t('read.delete.error')}`
    : t('read.delete.description')
  return (
    <RiskConfirmation
      open
      title={t('read.delete.title')}
      description={description}
      acknowledgeLabel={t('read.delete.acknowledge')}
      cancelLabel={t('read.delete.cancel')}
      closeLabel={t('read.delete.cancel')}
      confirmLabel={deleting ? t('read.delete.confirming') : t('read.delete.confirm')}
      acknowledged={acknowledged}
      disabled={deleting}
      onAcknowledgedChange={setAcknowledged}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
