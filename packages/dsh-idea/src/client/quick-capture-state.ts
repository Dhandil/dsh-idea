/**
 * Per-Session interaction state for the Quick Capture form inside the Idea
 * search card (T12). Browser interaction state only: the user's raw note,
 * one in-flight prepare marker, and one failure kind. `direct` prepares with
 * zero model calls and `ai` with exactly one — both through the Host's
 * preparation registry, so the later save is idempotent. A failed AI prepare
 * preserves the note verbatim and direct save stays available; closing the
 * card discards the note with zero side effects, like every card action.
 * @module @dsh-external/dsh-idea/client/quick-capture-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { QuickCapturePreview } from '../preparation/types.ts'

/** The quick-capture prepare lifecycle marker. */
export type QuickCapturePreparing = 'none' | 'direct' | 'ai'

/** The full interaction state of one Session's quick-capture form. */
export interface QuickCaptureUiState {
  /** Whether the capture form is open above the search input. */
  open: boolean
  /** The user's note as typed. */
  text: string
  /** The in-flight prepare, if any; mode buttons are disabled while set. */
  preparing: QuickCapturePreparing
  /** The failure the form should show, if any. */
  failure: 'prepare-failed' | null
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

/**
 * One Session's Quick Capture surface: opens above the search input, prepares
 * a proposal (direct or AI), and hands the result to the Session's Save Idea
 * surface, whose modal owns the editable preview and the durable submit.
 * Double activations while a prepare is in flight are no-ops; disposing
 * aborts the in-flight request.
 */
export class IdeaQuickCaptureSurface {
  /** Observable interaction state; the card component selects slices of it. */
  readonly state: SnapshotStore<QuickCaptureUiState> = createSnapshotStore<QuickCaptureUiState>({ ...CLOSED })

  private prepareAbort: AbortController | undefined
  private prepareInFlight = false

  constructor(
    private readonly remote: IdeaQuickCaptureFace,
    private readonly sessionId: string,
    /** Receives the prepared proposal; opens the Session's preview modal. */
    private readonly onPreview: (preview: QuickCapturePreview) => void,
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

  /** Hide the capture form and discard the note; zero side effects. */
  close(): void {
    if (this.prepareInFlight) return
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

  /** Prepare the deterministic direct-save proposal; zero model calls. */
  saveDirect(): void {
    this.runPrepare('direct')
  }

  /** Prepare the AI-organized proposal; exactly one model call. */
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
    if (preview !== null) {
      // The modal takes over; the form closes and its note is consumed.
      this.onPreview(preview)
      this.state.update((current) => { Object.assign(current, CLOSED) })
      return
    }
    // Aborted (card dispose/unmount) reads as silence, not failure.
    if (controller.signal.aborted) return
    this.state.update((current) => {
      current.preparing = 'none'
      // The verbatim note is preserved on failure (T12 requirement 8).
      current.failure = failed ? 'prepare-failed' : null
    })
  }

  /** Abort any in-flight prepare and reset to the closed state. */
  dispose(): void {
    this.prepareAbort?.abort()
    this.prepareAbort = undefined
    this.prepareInFlight = false
    this.state.update((current) => { Object.assign(current, CLOSED) })
  }
}
