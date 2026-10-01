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
import type { QuickCapturePreview, QuickCaptureRouteContext } from '../preparation/types.ts'
import type { QuickCommitOutcome } from './state.ts'

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
    request: { route: QuickCaptureRouteContext; text: string; mode: 'direct' | 'ai' },
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
  /** T12.3: notified when a direct-save commit succeeds (e.g. the Settings
   * library refreshes its Current view). Optional. */
  onSuccess?: () => void
  /**
   * Direct auto-commit: run Preparation → commit on the SAME preparation id
   * without a confirmation step. Resolves with the commit outcome (R6):
   * `'unclear'` outcomes may only ever be recovered through the SAME
   * preparation id (R8) — never through a re-prepared one.
   */
  onCommit: (preview: QuickCapturePreview) => Promise<QuickCommitOutcome>
}

/**
 * One Session's Quick Capture surface: opens above the search input and
 * prepares a proposal (direct or AI). Double activations while a prepare is
 * in flight are no-ops; closing cancels the in-flight prepare while a commit
 * in flight is not cancellable (T12.2 R7); disposing aborts it.
 */
export class IdeaQuickCaptureSurface {
  /** Observable interaction state; the card component selects slices of it. */
  readonly state: SnapshotStore<QuickCaptureUiState> = createSnapshotStore<QuickCaptureUiState>({ ...CLOSED })

  private prepareAbort: AbortController | undefined
  private prepareInFlight = false
  /** A direct-save commit is in flight: not cancellable (T12.2 R7). */
  private commitInFlight = false
  /**
   * A quick-commit whose outcome was unclear (R8): recovery retries the
   * commit with this SAME preparation id; any other outcome clears it.
   */
  private pendingUnclear: QuickCapturePreview | null = null

  constructor(
    private readonly remote: IdeaQuickCaptureFace,
    private readonly route: QuickCaptureRouteContext,
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
   * T12.3: return from the capture subview to the list WITHOUT discarding
   * the unsaved note — only switches the subview; the panel-wide close keeps
   * its own phase-aware semantics (R7–R10).
   */
  hide(): void {
    this.state.update((current) => { current.open = false })
  }

  /**
   * Phase-aware close (T12.2 R7):
   * - idle: clear the form, zero side effects;
   * - preparing: **cancel** the prepare (the async result is silenced, so a
   *   closed card is never followed by a late preview — R1);
   * - committing: a commit is NOT cancellable — the form merely hides while
   *   the note and the pending outcome are preserved, so the user is never
   *   misled into thinking the save was cancelled and the note stays
   *   recoverable whichever way the commit settles.
   */
  close(): void {
    // R9: an unresolved pendingUnclear survives the close — the note and the
    // original preparation id are preserved so the recovery stays possible
    // after reopening; only a fully resolved lifecycle clears them.
    if (this.commitInFlight || this.pendingUnclear !== null) {
      this.state.update((current) => { current.open = false })
      return
    }
    this.prepareAbort?.abort()
    this.prepareAbort = undefined
    this.prepareInFlight = false
    this.state.update((current) => { Object.assign(current, CLOSED) })
  }

  /** Apply one text edit to the open form. R9: an unresolved
   * pendingUnclear cannot be bypassed by editing the note. */
  setText(text: string): void {
    if (this.prepareInFlight || this.commitInFlight || this.pendingUnclear !== null) return
    this.state.update((draft) => {
      draft.text = text
      draft.failure = null
    })
  }

  /**
   * Prepare the deterministic direct-save proposal, then auto-commit it.
   * When a previous commit's outcome was unclear (R8), the retry runs the
   * commit with the ORIGINAL preparation id — a new preparation is never
   * minted to recover an unclear commit.
   */
  saveDirect(): void {
    const { open } = this.state.getSnapshot()
    if (!open || this.prepareInFlight || this.commitInFlight) return
    if (this.pendingUnclear !== null) {
      // R9: the same-id retry enters commitInFlight synchronously, so a
      // double activation can never fire a concurrent duplicate commit and
      // a close during the retry only hides the form (the note and the
      // original preparation id stay recoverable).
      const pending = this.pendingUnclear
      this.commitInFlight = true
      this.state.update((draft) => {
        draft.preparing = 'direct'
        draft.failure = null
      })
      void this.callbacks.onCommit(pending).then((outcome) => {
        this.commitInFlight = false
        this.applyCommitOutcome(pending, outcome)
      })
      return
    }
    this.runPrepare('direct')
  }

  /** Prepare the AI-organized proposal and hand over its editable preview.
   * R9: an unresolved pendingUnclear cannot be bypassed by a re-preparation. */
  organize(): void {
    if (this.pendingUnclear !== null) return
    this.runPrepare('ai')
  }

  private runPrepare(mode: 'direct' | 'ai'): void {
    const { text, preparing, open } = this.state.getSnapshot()
    if (!open || this.prepareInFlight || this.commitInFlight || preparing !== 'none') return
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
        { route: this.route, text, mode },
        controller.signal,
      )
      if (!controller.signal.aborted && result.ok) preview = result.value
      else if (!result.ok) failed = true
    } catch {
      // A thrown carrier error is a failed prepare, not a crash; the note
      // stays and direct save remains available (T12 requirement 8).
      failed = true
    } finally {
      // R8 ownership guard: a stale task's finally must never clobber a
      // newer task's AbortController or lifecycle state (close → reopen →
      // new task races).
      if (this.prepareAbort === controller) {
        this.prepareInFlight = false
        this.prepareAbort = undefined
      }
    }
    // Aborted (card closed/unmount) reads as silence: the form was cleared
    // by close(), and no preview or failure may surface afterwards.
    if (controller.signal.aborted) return

    if (preview !== null && mode === 'direct') {
      // R4: direct save auto-commits through the SAME preparation id — no
      // confirmation step, no preview modal. The commit is not cancellable
      // (R7): commitInFlight is set synchronously with the aborted check, so
      // a close cannot interleave between the two.
      if (controller.signal.aborted) return
      this.commitInFlight = true
      const outcome = await this.callbacks.onCommit(preview)
      this.commitInFlight = false
      this.applyCommitOutcome(preview, outcome)
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

  /**
   * Apply one direct-commit outcome (R8/R10): success consumes the note; an
   * UNCLEAR outcome keeps the note and remembers the SAME preparation id for
   * the retry; a BUSY outcome means nothing was attempted — the prepared
   * proposal (and any existing pendingUnclear) stays exactly as it was, so
   * the same-id retry remains the only recovery and no duplicate creation is
   * possible; a definitive failure clears the stale id (the Host reset the
   * preparation) while keeping the note for a fresh prepare.
   */
  private applyCommitOutcome(preview: QuickCapturePreview, outcome: QuickCommitOutcome): void {
    if (outcome === 'success') {
      this.pendingUnclear = null
      this.state.update((current) => { Object.assign(current, CLOSED) })
      return
    }
    if (outcome === 'failed') {
      this.pendingUnclear = null
    } else if (this.pendingUnclear === null && (outcome === 'unclear' || outcome === 'busy')) {
      // `unclear`: the same-id recovery is born. `busy`: the preparation was
      // already registered but the commit never left — keeping it here makes
      // the later retry commit the SAME id, so no duplicate creation is
      // possible (T12.2 R10).
      this.pendingUnclear = preview
    }
    // 'busy': nothing was attempted — the lifecycle is untouched apart from
    // the visible failure notice; the note and any pending id survive.
    this.state.update((current) => {
      current.preparing = 'none'
      current.failure = 'commit-failed'
    })
  }

  /** Abort any in-flight prepare and reset to the closed state. */
  dispose(): void {
    this.close()
  }
}
