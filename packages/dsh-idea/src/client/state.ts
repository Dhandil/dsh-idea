/**
 * Per-Session interaction state for the Save Idea surface. This is browser
 * interaction state only: no canonical Idea data ever lives here, preparation
 * references may expire at any time, and disposing the surface aborts any
 * in-flight preparation. Durable writes happen exclusively on the Host.
 * @module @dsh-external/dsh-idea/client/state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { IdeaPreparationId, IdeaPreparationSourceInfo } from '../preparation/types.ts'
import type { IdeaDraft } from '../types.ts'

/** The stable failure kinds the UI knows copy for. */
export type IdeaUiFailure =
  /** The model proposal could not be produced. */
  | 'prepare-failed'
  /** The durable write failed; the modal stays open for retry. */
  | 'save-failed'
  /** The preparation expired; the edits stay visible until the user closes. */
  | 'expired'

/** The seven editable fields; list fields are newline-separated text. */
export interface EditableIdeaDraft {
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhenText: string
  openQuestionsText: string
}

/** The modal's local payload: a preparation reference plus the editable draft. */
export interface IdeaModalState {
  preparationId: IdeaPreparationId
  draft: EditableIdeaDraft
  source: IdeaPreparationSourceInfo
}

/** The full interaction state of one Session's Idea surface. */
export interface IdeaSaveState {
  /** The message whose 💡 proposal is in flight, if any. */
  preparingMessageId: MessageId | null
  /** The open preview modal, if any. */
  modal: IdeaModalState | null
  /** Whether a durable save is being awaited. */
  submitting: boolean
  /** The failure the overlay should show a toast for, if any. */
  failure: IdeaUiFailure | null
  /** Sequence of the success toast currently shown (0 = none). */
  toastSeq: number
}

const CLOSED: IdeaSaveState = {
  preparingMessageId: null,
  modal: null,
  submitting: false,
  failure: null,
  toastSeq: 0,
}

/** Split editor text into normalized list items: trim, drop empties, keep order. */
export const listItemsOf = (text: string): string[] =>
  text.split('\n').map(line => line.trim()).filter(line => line.length > 0)

/** Join list items back into one line-per-item editor text. */
export const listTextOf = (items: readonly string[]): string => items.join('\n')

/** Model proposal → editable draft (round-trippable through listTextOf). */
export const editableFrom = (draft: IdeaDraft): EditableIdeaDraft => ({
  title: draft.title,
  core: draft.core,
  motivation: draft.motivation,
  currentConclusion: draft.currentConclusion,
  possibleValue: draft.possibleValue,
  useWhenText: listTextOf(draft.useWhen),
  openQuestionsText: listTextOf(draft.openQuestions),
})

/** Editable draft → the durable draft submitted to the Host. */
export const durableFrom = (draft: EditableIdeaDraft): IdeaDraft => ({
  title: draft.title,
  core: draft.core,
  motivation: draft.motivation,
  currentConclusion: draft.currentConclusion,
  possibleValue: draft.possibleValue,
  useWhen: listItemsOf(draft.useWhenText),
  openQuestions: listItemsOf(draft.openQuestionsText),
})

/** Whether the required fields have content after trim. */
export const requiredPresent = (draft: EditableIdeaDraft): boolean =>
  [draft.title, draft.core, draft.motivation].every(field => field.trim().length > 0)

/**
 * Whether two durable drafts carry identical normalized semantic content,
 * field by field — the no-change check that disables the manual-edit Save.
 */
export const sameIdeaDraft = (a: IdeaDraft, b: IdeaDraft): boolean =>
  a.title === b.title
  && a.core === b.core
  && a.motivation === b.motivation
  && a.currentConclusion === b.currentConclusion
  && a.possibleValue === b.possibleValue
  && a.useWhen.length === b.useWhen.length
  && a.useWhen.every((item, index) => item === b.useWhen[index])
  && a.openQuestions.length === b.openQuestions.length
  && a.openQuestions.every((item, index) => item === b.openQuestions[index])

/** Minimal structural face of the Host the surface talks to. */
export interface IdeaRemoteFace {
  prepareFromMessage(
    request: { sessionId: string; messageId: string },
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: { preparationId: IdeaPreparationId; draft: IdeaDraft; source: IdeaPreparationSourceInfo } }
    | { ok: false; error: { code: string } }
  >
  create(
    request: { preparationId: IdeaPreparationId; draft: IdeaDraft },
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: { ideaId: string; currentVersionId: string; status: 'active'; title: string; createdAt: number } }
    | { ok: false; error: { code: string } }
  >
}

/**
 * One Session's Save Idea surface: the 💡 preparation lifecycle, the preview
 * modal draft, and the idempotent-looking submit flow (the Host owns real
 * idempotency; here double-clicks are simply not sent).
 */
export class IdeaSaveSurface {
  /** Observable interaction state; slot components select slices of it. */
  readonly state: SnapshotStore<IdeaSaveState> = createSnapshotStore<IdeaSaveState>({ ...CLOSED })

  private prepareAbort: AbortController | undefined
  private prepareInFlight = false
  private submitInFlight = false

  constructor(
    private readonly remote: IdeaRemoteFace,
    private readonly sessionId: string,
  ) {}

  /** Start the one prepare call for a message; repeats while pending are no-ops. */
  prepare(messageId: MessageId): void {
    const { preparingMessageId, modal } = this.state.getSnapshot()
    if (this.prepareInFlight || preparingMessageId !== null || modal !== null) return
    this.prepareInFlight = true
    const controller = new AbortController()
    this.prepareAbort = controller
    this.state.update((draft) => { draft.preparingMessageId = messageId })
    void this.runPrepare(messageId, controller)
  }

  private async runPrepare(messageId: MessageId, controller: AbortController): Promise<void> {
    let outcome: 'done' | 'cancelled' | 'failed' = 'failed'
    let modal: IdeaModalState | null = null
    try {
      const result = await this.remote.prepareFromMessage(
        { sessionId: this.sessionId, messageId },
        controller.signal,
      )
      if (controller.signal.aborted) {
        outcome = 'cancelled'
      } else if (result.ok) {
        outcome = 'done'
        modal = {
          preparationId: result.value.preparationId,
          draft: editableFrom(result.value.draft),
          source: result.value.source,
        }
      }
    } catch {
      // A thrown carrier error is a failed prepare, not a crash.
    } finally {
      this.prepareInFlight = false
      this.prepareAbort = undefined
    }
    // Cancellation from session unmount/navigation must not read as failure.
    if (outcome === 'cancelled') {
      this.state.update((draft) => { draft.preparingMessageId = null })
      return
    }
    if (outcome === 'done' && modal !== null) {
      this.state.update((current) => {
        current.preparingMessageId = null
        current.modal = modal
      })
      return
    }
    this.state.update((current) => {
      current.preparingMessageId = null
      current.failure = 'prepare-failed'
    })
  }

  /** Apply one field edit to the open modal's draft. */
  editDraft(patch: Partial<EditableIdeaDraft>): void {
    const { modal, submitting } = this.state.getSnapshot()
    if (modal === null || submitting) return
    const next = { ...modal, draft: { ...modal.draft, ...patch } }
    // Identity against a raw snapshot cannot be tested inside the immer
    // draft (draft proxies never equal raw objects); the preparation id is
    // the stable discriminator for "still the modal this edit targeted".
    this.state.update((current) => {
      if (current.modal !== null && current.modal.preparationId === modal.preparationId) {
        current.modal = next
      }
    })
  }

  /** Submit the edited draft; double-clicks while submitting are no-ops. */
  submit(): void {
    const { modal } = this.state.getSnapshot()
    if (modal === null || this.submitInFlight || !requiredPresent(modal.draft)) return
    this.submitInFlight = true
    this.state.update((current) => {
      current.submitting = true
      current.failure = null
    })
    void this.runSubmit(modal)
  }

  private async runSubmit(modal: IdeaModalState): Promise<void> {
    const result = await this.remote.create({
      preparationId: modal.preparationId,
      draft: durableFrom(modal.draft),
    })
    this.submitInFlight = false
    // The modal was replaced or closed underneath: nothing to report.
    if (this.state.getSnapshot().modal !== modal) {
      this.state.update((current) => { current.submitting = false })
      return
    }
    if (result.ok) {
      this.state.update((current) => {
        current.modal = null
        current.submitting = false
        current.failure = null
        current.toastSeq += 1
      })
      return
    }
    if (result.error.code === 'idea/preparation-not-found') {
      // Expired: keep the edits visible and ask for an explicit re-prepare.
      this.state.update((current) => {
        current.submitting = false
        current.failure = 'expired'
      })
      return
    }
    // Durable failure: keep the modal open, keep the draft, allow retry.
    this.state.update((current) => {
      current.submitting = false
      current.failure = 'save-failed'
    })
  }

  /** Close the modal with zero durable writes; ignored while committing. */
  cancel(): void {
    if (this.submitInFlight) return
    this.state.update((current) => {
      current.modal = null
      current.failure = null
    })
  }

  /** Retire the failure toast once its hold completes. */
  dismissFailure(): void {
    this.state.update((current) => { current.failure = null })
  }

  /** Retire the success toast so a later save can replay it. */
  dismissToast(seq: number): void {
    if (this.state.getSnapshot().toastSeq === seq) {
      this.state.update((current) => { current.toastSeq = 0 })
    }
  }

  /** Abort any in-flight prepare and reset to the closed state. */
  dispose(): void {
    this.prepareAbort?.abort()
    this.prepareAbort = undefined
    this.prepareInFlight = false
    this.submitInFlight = false
    this.state.update((current) => {
      current.preparingMessageId = null
      current.modal = null
      current.submitting = false
      current.failure = null
      current.toastSeq = 0
    })
  }
}
