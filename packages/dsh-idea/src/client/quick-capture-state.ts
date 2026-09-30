/**
 * Per-Session interaction state for the Quick Capture form inside the Idea
 * search card (T12). Browser interaction state only: the user's raw note,
 * one in-flight prepare marker, and one failure kind. `direct` prepares with
 * zero model calls and **auto-commits through the same preparation id**
 * (T12.2 R4 — no confirmation step); `ai` prepares with exactly one model
 * call and hands an editable preview to the Session's Save Idea surface,
 * whose modal owns the confirmation and the durable submit. A failed AI
 * prepare preserves the note verbatim and direct save stays available; a
 * refused preview handoff preserves the note (never silently dropped);
 * closing the card cancels an in-flight prepare, so a closed card can never
 * be followed by a late preview (T12.2 R1).
 * @module @dsh-external/dsh-idea/client/quick-capture-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { QuickCapturePreview } from '../preparation/types.ts'

/** The quick-capture prepare lifecycle marker. */
export type QuickCapturePreparing = 'none' | 'direct' | 'ai'

/** The failure kinds the form knows copy for. */
export type QuickCaptureFailure =
  | 'prepare-failed'
  | 'commit-failed'
  | 'handoff-failed'

/** The full interaction state of one Session's quick-capture form. */
export interface QuickCaptureUiState {
  /** Whether the capture form is open above the search input. */
  open: boolean
  /** The user's note as typed. */
  text: string
  /** The in-flight prepare, if any; mode buttons are disabled while set. */
  preparing: QuickCapturePreparing
  /** The failure the form should show, if any. */
  failure: QuickCaptureFailure | null
}

const CLOSED: QuickCaptureUiState = {
  open: false,
  text: '',
  preparing: 'none',
  failure: null,
}

/** Minimal structural face of the Host the surface talks to. */
export interface IdeaQuickCaptureFace {
  prepareQuickCapture(
    request: { sessionId: string; text: string; mode: 'direct' | 'ai' },
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: QuickCapturePreview }
    | { ok: false; error: { code: string } }
  >
}

export interface IdeaQuickCaptureCallbacks {
  /**
   * AI handoff: open the Save Idea surface's editable preview modal.
   * Returns whether the handoff was accepted; `false` keeps this form open
   * with the note intact (never silently dropped, T12.2 R1).
   */
  onPreview: (preview: QuickCapturePreview) => boolean
  /**
   * Direct auto-commit: run Preparation → commit on the SAME preparation id
   * without a confirmation step. Resolves `true` on success; `false` on
   * failure or when the save surface is busy (note stays visible).
   */
  onCommit: (preview: QuickCapturePreview) => Promise<boolean>
}

/**
 * One Session's Quick Capture surface: opens above the search input and
 * prepares a proposal (direct or AI). Double activations while a prepare is
 * in flight are no-ops; closing cancels the in-flight prepare; disposing
 * aborts it.
 */
export class IdeaQuickCaptureSurface {
  /** Observable interaction state; the card component selects slices of it. */
  readonly state: SnapshotStore<QuickCaptureUiState> = createSnapshotStore<QuickCaptureUiState>({ ...CLOSED })

  private prepareAbort: AbortController | undefined
  private prepareInFlight = false

  constructor(
    private readonly remote: IdeaQuickCaptureFace,
    private readonly sessionId: string,
    private readonly callbacks: IdeaQuickCaptureCallbacks,
  ) {}

  /** Whether the note has saveable content after trimming. */
  static canSave(text: string): boolean {
    return text.trim().length > 0
  }

  /** Reveal the capture form; repeats while open are no-ops. */
  open(): void {
    if (this.state.getSnapshot().open) return
    this.state.update((draft) => { draft.open = true })
  }

  /**
   * Hide the capture form and clear the note. While a prepare is in flight
   * this **cancels** it: the async result is silenced, so a closed card is
   * never followed by a late preview (T12.2 R1).
   */
  close(): void {
    this.prepareAbort?.abort()
    this.prepareAbort = undefined
    this.prepareInFlight = false
    this.state.update((current) => { Object.assign(current, CLOSED) })
  }

  /** Apply one text edit to the open form. */
  setText(text: string): void {
    if (this.prepareInFlight) return
    this.state.update((draft) => {
      draft.text = text
      draft.failure = null
    })
  }

  /** Prepare the deterministic direct-save proposal, then auto-commit it. */
  saveDirect(): void {
    this.runPrepare('direct')
  }

  /** Prepare the AI-organized proposal and hand over its editable preview. */
  organize(): void {
    this.runPrepare('ai')
  }

  private runPrepare(mode: 'direct' | 'ai'): void {
    const { text, preparing, open } = this.state.getSnapshot()
    if (!open || this.prepareInFlight || preparing !== 'none') return
    if (!IdeaQuickCaptureSurface.canSave(text)) return
    this.prepareInFlight = true
    const controller = new AbortController()
    this.prepareAbort = controller
    this.state.update((draft) => {
      draft.preparing = mode
      draft.failure = null
    })
    void this.runPrepareAsync(mode, text, controller)
  }

  private async runPrepareAsync(
    mode: 'direct' | 'ai',
    text: string,
    controller: AbortController,
  ): Promise<void> {
    let preview: QuickCapturePreview | null = null
    let failed = false
    try {
      const result = await this.remote.prepareQuickCapture(
        { sessionId: this.sessionId, text, mode },
        controller.signal,
      )
      if (!controller.signal.aborted && result.ok) preview = result.value
      else if (!result.ok) failed = true
    } catch {
      // A thrown carrier error is a failed prepare, not a crash; the note
      // stays and direct save remains available (T12 requirement 8).
      failed = true
    } finally {
      this.prepareInFlight = false
      this.prepareAbort = undefined
    }
    // Aborted (card closed/unmount) reads as silence: the form was cleared
    // by close(), and no preview or failure may surface afterwards.
    if (controller.signal.aborted) return

    if (preview !== null && mode === 'direct') {
      // R4: direct save auto-commits through the SAME preparation id — no
      // confirmation step, no preview modal.
      const committed = await this.callbacks.onCommit(preview)
      if (controller.signal.aborted) return
      if (committed) {
        this.state.update((current) => { Object.assign(current, CLOSED) })
        return
      }
      this.state.update((current) => {
        current.preparing = 'none'
        current.failure = 'commit-failed'
      })
      return
    }

    if (preview !== null) {
      // R1: a refused handoff must not silently drop the note — the form
      // stays open with the verbatim text and a visible failure.
      const handedOver = this.callbacks.onPreview(preview)
      if (handedOver) {
        this.state.update((current) => { Object.assign(current, CLOSED) })
        return
      }
      this.state.update((current) => {
        current.preparing = 'none'
        current.failure = 'handoff-failed'
      })
      return
    }

    this.state.update((current) => {
      current.preparing = 'none'
      // The verbatim note is preserved on failure (T12 requirement 8).
      current.failure = failed ? 'prepare-failed' : null
    })
  }

  /** Abort any in-flight prepare and reset to the closed state. */
  dispose(): void {
    this.close()
  }
}
