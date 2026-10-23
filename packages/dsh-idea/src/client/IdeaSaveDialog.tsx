/**
 * The Session's Save Idea preview modal: seven editable fields over the
 * proposed draft, a read-only source summary, and Cancel/Save. Cancel closes
 * with zero durable writes; Save submits only the preparation reference and
 * the edited draft — the Host owns provenance. Success and failure surface as
 * toasts anchored over the composer card.
 * @module @dsh-external/dsh-idea/client/IdeaSaveDialog
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Button, IconCheckOutlineRegular, IconWarningOutlineRegular, Modal, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IdeaDialogProps } from './slots.ts'
import { requiredPresent } from './state.ts'
import { IdeaDraftFields } from './IdeaDraftForm.tsx'

/**
 * The Session's Idea preview modal plus its toasts.
 * @param props - the injected verbs, the shared Idea state hook, and the
 * locale seat.
 * @returns the modal (when open) and the active toast (when any).
 */
export function IdeaSaveDialog({
  sessionId, chooseMode, queryTargets, selectTarget, generate, editDraft, submit, cancel, cancelPending, recordRendered, dismissFailure, dismissToast, useIdea, t,
}: IdeaDialogProps) {
  const state = useIdea(view => view)
  const probeRef = useRef<HTMLSpanElement | null>(null)
  // The composer card anchors the toasts; the overlay mounts beside it.
  const card = probeRef.current?.closest<HTMLElement>('[data-composer-card]') ?? undefined
  const modal = state.modal
  const summary = state.summary
  const [discard, setDiscard] = useState<(() => void) | null>(null)
  useEffect(() => { setDiscard(null) }, [sessionId])
  const identity = modal?.kind === 'update' ? modal.updateId : modal?.preparationId
  const original = useRef<{ id: string | undefined; draft: string }>({ id: undefined, draft: '' })
  if (original.current.id !== identity) original.current = { id: identity, draft: modal ? JSON.stringify(modal.draft) : '' }
  const dirty = modal !== null && original.current.draft !== JSON.stringify(modal.draft)
  const close = () => { if (state.submitting) return; if (dirty) setDiscard(() => cancel); else cancel() }
  const change = (action: () => void) => { if (modal) setDiscard(() => action); else action() }
  const pending = state.preparingMessageId !== null && modal === null
  useLayoutEffect(() => {
    if (pending) recordRendered('pending')
    else if (modal !== null) recordRendered('preview')
  }, [pending, modal, recordRendered])
  // The session-scoped slot may be reused for a different Session without unmounting.
  useEffect(() => () => { cancelPending() }, [sessionId])

  const toast = state.toastSeq
  // A toast retires with the entry that showed it: the Toast's own timer dies
  // on unmount, and the Session's controller must not replay it on return.
  const onToastDone = useCallback(() => { dismissToast(toast) }, [dismissToast, toast])
  useEffect(() => () => { dismissToast(toast) }, [dismissToast, toast])

  const failure = modal?.kind === 'update' ? modal.issue ?? state.failure : state.failure
  const failureCopy = failure === null ? null
    : failure === 'expired' ? t('error.expired')
      : failure === 'conflict' ? t('summary.conflict')
        : failure === 'unavailable' ? t('summary.unavailable')
          : failure === 'source' ? t('summary.sourceError')
            : failure === 'model' ? t('summary.modelError')
              : failure === 'invalid-output' ? t('summary.outputError')
                : failure === 'uncertain' ? t('summary.uncertain')
                  : failure === 'save-failed' ? t('error.save') : t('error.prepare')
  const onFailureDone = useCallback(() => { dismissFailure() }, [dismissFailure])

  const saveDisabled = state.submitting || modal === null || !requiredPresent(modal.draft)
    || (modal.kind === 'update' && ['conflict', 'expired', 'unavailable', 'uncertain'].includes(modal.issue ?? ''))

  // A menu double-click can land its second click on the newly portaled mask.
  // Capture only that continued pointer sequence; explicit controls, Escape,
  // and the next ordinary mask click keep the shared Modal's close behavior.
  const onModalClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (event.detail > 1 && target instanceof HTMLElement
      && target.getAttribute('aria-hidden') === 'true'
      && target.closest('[role="dialog"]') === null) {
      event.stopPropagation()
    }
  }

  return (
    <>
      <span ref={probeRef} hidden />
      {(summary !== null || pending || modal !== null) && (
        <div style={{ display: 'contents' }} onClickCapture={onModalClickCapture}>
          <Modal
            open
            title={summary ? t('summary.title') : t('dialog.title')}
            closeLabel={t('dialog.close')}
            onClose={close}
            className="dsh-idea-modal"
            contentClassName="dsh-idea-modal-content"
            footer={modal === null ? <>
              <Button onClick={close}>{t('dialog.cancel')}</Button>
              {!pending && summary && <Button variant="primary"
                disabled={summary.mode === 'update' && (summary.targetStatus !== 'ready' || summary.target === null)}
                onClick={generate}>{t('summary.generate')}</Button>}
            </> : <>
              <Button disabled={state.submitting} onClick={close}>{t('dialog.cancel')}</Button>
              <Button variant="primary" disabled={saveDisabled} onClick={submit}>
                {state.submitting ? t('dialog.saving') : modal.kind === 'update' ? t('summary.commit') : summary ? t('summary.saveNew') : t('dialog.save')}
              </Button>
            </>}

          >
            {summary && <div className="dsh-idea-summary-modes" role="group" aria-label={t('summary.mode')}>
              <Button disabled={state.submitting} aria-pressed={summary.mode === 'new'} onClick={() => { if (summary.mode !== 'new') change(() => chooseMode('new')) }}>{t('summary.new')}</Button>
              <Button disabled={state.submitting} aria-pressed={summary.mode === 'update'} onClick={() => { if (summary.mode !== 'update') change(() => chooseMode('update')) }}>{t('summary.update')}</Button>
              {summary.mode === 'update' && (pending || modal) && <Button disabled={state.submitting}
                onClick={() => change(() => chooseMode('update'))}>{t('summary.changeTarget')}</Button>}
            </div>}
            {summary && !pending && modal === null && (summary.mode === 'new'
              ? <p className="dsh-idea-source">{t('summary.newHint')}</p>
              : <div className="dsh-idea-picker">
                <label>{t('summary.search')}<input value={summary.query} onChange={event => queryTargets(event.target.value)} /></label>
                {summary.listStatus === 'loading' && <p role="status">{t('read.loading')}</p>}
                {summary.listStatus === 'error' && <p role="alert">{t('read.error')} <Button onClick={() => queryTargets(summary.query)}>{t('summary.retry')}</Button></p>}
                {summary.listStatus === 'ready' && summary.items.length === 0 && <p>{t('summary.empty')}</p>}
                <div className="dsh-idea-picker-list" role="group" aria-label={t('summary.targets')}>
                  {summary.items.map(item => <button type="button" key={item.id} aria-pressed={summary.selectedId === item.id}
                    onClick={() => selectTarget(item.id)}><strong>{item.title}</strong><span>{item.core}</span></button>)}
                </div>
                {summary.targetStatus === 'loading' && <p role="status">{t('read.loading')}</p>}
                {summary.targetStatus === 'error' && <p role="alert">{t('summary.unavailable')}</p>}
                {summary.target && <section className="dsh-idea-target" aria-label={t('summary.current')}>
                  <h3>{summary.target.title}</h3><p>{summary.target.core}</p>
                  {summary.target.currentConclusion && <p>{summary.target.currentConclusion}</p>}
                </section>}
                <p className="dsh-idea-source">{t('summary.selectionHint')}</p>
              </div>)}
            {summary?.target && (pending || modal) && <p className="dsh-idea-source">{t('summary.target', { title: summary.target.title })}</p>}
            {failureCopy && summary && <p role="alert">{failureCopy}</p>}
            {modal?.kind === 'update' && modal.verifiedCurrent && <section className="dsh-idea-target" aria-label={t('summary.verified')}>
              <h3>{t('summary.verified')}</h3><p>{modal.verifiedCurrent.title}</p><p>{modal.verifiedCurrent.core}</p>
            </section>}
            {pending ? <p className="dsh-idea-source" role="status" aria-live="polite">{t('dialog.preparing')}</p> : modal !== null && (
              <div className="dsh-idea-form" role="form" aria-label={t('dialog.title')}>
                {modal.source === null
                  ? <p className="dsh-idea-source">{t('dialog.sourceQuick')}</p>
                  : <p className="dsh-idea-source">{t('dialog.source', { count: modal.source.messageCount })}{' · '}{t('summary.range', { start: modal.source.startSeq, end: modal.source.endSeq })}{modal.source.truncated ? ` · ${t('summary.truncated')}` : ''}</p>}
                <IdeaDraftFields draft={modal.draft} disabled={state.submitting || (modal.kind === 'update' && modal.locked === true)} onEdit={editDraft} t={t} />
              </div>
            )}
          </Modal>
        </div>
      )}
      {discard && <Modal open title={t('summary.discardTitle')} closeLabel={t('read.edit.leave.stay')}
        onClose={() => setDiscard(null)} footer={<>
          <Button onClick={() => setDiscard(null)}>{t('read.edit.leave.stay')}</Button>
          <Button variant="primary" onClick={() => { const action = discard; setDiscard(null); action() }}>{t('read.edit.leave.discard')}</Button>
        </>}><p>{t('summary.discardHint')}</p></Modal>}
      {toast > 0 && failure === null && (
        <Toast
          key={toast}
          text={t(state.success === 'unchanged' ? 'summary.unchanged' : state.success === 'updated' ? 'summary.updated' : 'toast.saved')}
          icon={<span><IconCheckOutlineRegular size={12} /></span>}
          anchor={card}
          onDone={onToastDone}
        />
      )}
      {failure !== null && failureCopy !== null && (
        <Toast
          key={`failure-${failure}`}
          text={failureCopy}
          icon={<IconWarningOutlineRegular />}
          anchor={card}
          holdMs={6000}
          onDone={onFailureDone}
        />
      )}
    </>
  )
}
