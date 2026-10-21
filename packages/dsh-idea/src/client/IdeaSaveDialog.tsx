/**
 * The Session's Save Idea preview modal: seven editable fields over the
 * proposed draft, a read-only source summary, and Cancel/Save. Cancel closes
 * with zero durable writes; Save submits only the preparation reference and
 * the edited draft — the Host owns provenance. Success and failure surface as
 * toasts anchored over the composer card.
 * @module @dsh-external/dsh-idea/client/IdeaSaveDialog
 */

import { useCallback, useEffect, useRef } from 'react'
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
  editDraft, submit, cancel, dismissFailure, dismissToast, useIdea, t,
}: IdeaDialogProps) {
  const state = useIdea(view => view)
  const probeRef = useRef<HTMLSpanElement | null>(null)
  // The composer card anchors the toasts; the overlay mounts beside it.
  const card = probeRef.current?.closest<HTMLElement>('[data-composer-card]') ?? undefined
  const modal = state.modal

  const toast = state.toastSeq
  // A toast retires with the entry that showed it: the Toast's own timer dies
  // on unmount, and the Session's controller must not replay it on return.
  const onToastDone = useCallback(() => { dismissToast(toast) }, [dismissToast, toast])
  useEffect(() => () => { dismissToast(toast) }, [dismissToast, toast])

  const failure = state.failure
  const failureCopy = failure === null
    ? null
    : failure === 'expired' ? t('error.expired') : failure === 'save-failed' ? t('error.save') : t('error.prepare')
  const onFailureDone = useCallback(() => { dismissFailure() }, [dismissFailure])

  const saveDisabled = state.submitting || modal === null || !requiredPresent(modal.draft)

  return (
    <>
      <span ref={probeRef} hidden />
      {modal !== null && (
        <Modal
          open
          title={t('dialog.title')}
          closeLabel={t('dialog.close')}
          onClose={cancel}
          className="dsh-idea-modal"
          footer={(
            <>
              <Button disabled={state.submitting} onClick={cancel}>{t('dialog.cancel')}</Button>
              <Button variant="primary" disabled={saveDisabled} onClick={submit}>
                {state.submitting ? t('dialog.saving') : t('dialog.save')}
              </Button>
            </>
          )}
        >
          <div className="dsh-idea-form" role="form" aria-label={t('dialog.title')}>
            {modal.source === null
              ? <p className="dsh-idea-source">{t('dialog.sourceQuick')}</p>
              : <p className="dsh-idea-source">{t('dialog.source', { count: modal.source.messageCount })}</p>}
            <IdeaDraftFields draft={modal.draft} disabled={state.submitting} onEdit={editDraft} t={t} />
          </div>
        </Modal>
      )}
      {toast > 0 && failure === null && (
        <Toast
          key={toast}
          text={t('toast.saved')}
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
