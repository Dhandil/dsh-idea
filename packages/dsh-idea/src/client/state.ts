/**
 * Per-Session interaction state for the Save Idea surface. This is browser
 * interaction state only: no canonical Idea data ever lives here, preparation
 * references may expire at any time, and disposing the surface aborts any
 * in-flight preparation. Durable writes happen exclusively on the Host.
 * @module @dsh-external/dsh-idea/client/state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { IdeaPreparationId, IdeaPreparationSourceInfo, QuickCapturePreview, QuickCaptureRouteContext } from '../preparation/types.ts'
import type { IdeaDraft } from '../types.ts'
import type { IdeaDetail, IdeaListRow, IdeaSearchResult } from '../remote-host/types.ts'
import type { IdeaPrepareUpdateRequest, IdeaUpdateId, IdeaUpdatePreview, IdeaUpdateResult } from '../preparation/update-types.ts'
import { IdeaPerfMetrics } from '../perf/metrics.ts'

/** The stable failure kinds the UI knows copy for. */
export type IdeaUiFailure =
  /** The model proposal could not be produced. */
  | 'prepare-failed'
  /** The durable write failed; the modal stays open for retry. */
  | 'save-failed'
  /** The preparation expired; the edits stay visible until the user closes. */
  | 'expired'
  | 'conflict' | 'unavailable' | 'source' | 'model' | 'invalid-output' | 'uncertain'

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
export type IdeaModalState = {
  draft: EditableIdeaDraft
  source: (IdeaPreparationSourceInfo & { truncated?: boolean }) | null
} & (
  | { kind?: 'create'; preparationId: IdeaPreparationId; updateId?: never }
  | { kind: 'update'; updateId: IdeaUpdateId; preparationId?: never; target: IdeaUpdatePreview['targetSummary']; issue?: IdeaUiFailure; locked?: boolean; verifiedCurrent?: IdeaDetail | null }
)

/** Explicit selection is interaction intent, never inferred reference ownership. */
export interface IdeaSummaryState {
  messageId: MessageId
  mode: 'new' | 'update'
  query: string
  items: readonly IdeaListRow[]
  listStatus: 'idle' | 'loading' | 'ready' | 'error'
  selectedId: string | null
  target: IdeaDetail | null
  targetStatus: 'idle' | 'loading' | 'ready' | 'error'
}

/** The full interaction state of one Session's Idea surface. */
export interface IdeaSaveState {
  summary: IdeaSummaryState | null
  success: 'saved' | 'updated' | 'unchanged'
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
  summary: null, success: 'saved',
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

/** The outcome of one quick-commit attempt (T12.2 R6/R8/R10):
 * - `success`: the Host committed the preparation;
 * - `failed`: a DEFINITIVE Host answer (`idea/*` failure) — the Host reset
 *   the preparation, so only a fresh prepare may recover;
 * - `unclear`: the answer is unknown (thrown carrier or `gateway/*`) —
 *   recovery may only retry with the SAME preparation id;
 * - `busy`: the commit was NOT attempted (this surface was busy) — nothing
 *   is known or changed, and any prepared proposal stays exactly as it was. */
export type QuickCommitOutcome = 'success' | 'failed' | 'unclear' | 'busy'

/** Whether the required fields have content after trim. Motivation may be
 * empty since T12 (D1): every save surface gates on title + core only. */
export const requiredPresent = (draft: EditableIdeaDraft): boolean =>
  [draft.title, draft.core].every(field => field.trim().length > 0)

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
type Outcome<T> = { ok: true; value: T } | { ok: false; error: { code: string } }
export interface IdeaRemoteFace {
  list(request: { view: 'current' }): Promise<Outcome<readonly IdeaListRow[]>>
  search(request: { query: string; scope: 'current' }, signal?: AbortSignal): Promise<Outcome<readonly IdeaSearchResult[]>>
  get(request: { id: string }): Promise<Outcome<IdeaDetail>>
  prepareUpdateFromMessage(request: IdeaPrepareUpdateRequest, signal?: AbortSignal): Promise<Outcome<IdeaUpdatePreview>>
  commitPreparedUpdate(request: { updateId: IdeaUpdateId; draft: IdeaDraft }): Promise<Outcome<IdeaUpdateResult>>
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
  /** Prepare a quick-capture proposal from the user's own note (T12). */
  prepareQuickCapture(
    request: { route: QuickCaptureRouteContext; text: string; mode: 'direct' | 'ai' },
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: QuickCapturePreview }
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
  readonly performance = new IdeaPerfMetrics()

  private queryAbort: AbortController | undefined
  private targetAbort: AbortController | undefined
  private prepareAbort: AbortController | undefined
  private prepareInFlight = false
  private submitInFlight = false
  private disposed = false
  private pendingStartedAt: number | undefined
  private previewReadyAt: number | undefined

  constructor(
    private readonly remote: IdeaRemoteFace,
    private readonly context: QuickCaptureRouteContext,
  ) {}

  /** The Session id; present only for a session-kind surface (T12.3). */
  private get sessionId(): string {
    return this.context.kind === 'session' ? this.context.sessionId : ''
  }

  /** Open immediately, without a model call or fabricated preparation reference. */
  openSummary(messageId: MessageId): void {
    if (this.context.kind !== 'session' || this.disposed || this.submitInFlight) return
    const current = this.state.getSnapshot()
    if (current.summary || current.modal || this.prepareInFlight) return
    this.state.update(state => {
      state.summary = { messageId, mode: 'new', query: '', items: [], listStatus: 'idle', selectedId: null, target: null, targetStatus: 'idle' }
      state.failure = null
    })
  }

  /** Called only after any preview-discard confirmation in the dialog. */
  chooseMode(mode: 'new' | 'update'): void {
    const summary = this.state.getSnapshot().summary
    if (!summary || this.submitInFlight) return
    this.cancelPreparation()
    this.queryAbort?.abort(); this.targetAbort?.abort()
    this.state.update(state => {
      state.modal = null; state.failure = null
      state.summary = { ...summary, mode, query: '', items: [], listStatus: 'idle', target: null, selectedId: null, targetStatus: 'idle' }
    })
    if (mode === 'update') this.queryTargets('')
  }

  queryTargets(query: string): void {
    if (this.disposed || this.state.getSnapshot().summary?.mode !== 'update' || this.submitInFlight) return
    this.queryAbort?.abort()
    const controller = new AbortController(); this.queryAbort = controller
    this.state.update(state => { if (state.summary) { state.summary.query = query; state.summary.listStatus = 'loading' } })
    void (async () => {
      let items: readonly IdeaListRow[] | undefined
      try {
        const result = query.trim() ? await this.remote.search({ query, scope: 'current' }, controller.signal) : await this.remote.list({ view: 'current' })
        if (result.ok) items = result.value
      } catch { /* Keep failures local; never guess a target. */ }
      if (controller.signal.aborted || this.disposed) return
      this.state.update(state => {
        if (!state.summary || state.summary.mode !== 'update' || state.summary.query !== query) return
        state.summary.items = items ?? []; state.summary.listStatus = items ? 'ready' : 'error'
      })
    })()
  }

  selectTarget(id: string): void {
    if (this.disposed || this.submitInFlight || this.state.getSnapshot().summary?.mode !== 'update') return
    this.cancelPreparation(); this.targetAbort?.abort()
    const controller = new AbortController(); this.targetAbort = controller
    this.state.update(state => {
      state.modal = null; state.failure = null
      if (state.summary) { state.summary.selectedId = id; state.summary.target = null; state.summary.targetStatus = 'loading' }
    })
    void (async () => {
      let target: IdeaDetail | undefined
      try { const result = await this.remote.get({ id }); if (result.ok && result.value.id === id && result.value.status !== 'archived') target = result.value } catch { /* no implicit fallback */ }
      if (controller.signal.aborted || this.disposed) return
      this.state.update(state => {
        if (state.summary?.selectedId !== id) return
        state.summary.target = target ?? null; state.summary.targetStatus = target ? 'ready' : 'error'
      })
    })()
  }

  /** Generating is a separate, explicit user action, with one operation flight. */
  generate(): void {
    const { summary, modal } = this.state.getSnapshot()
    if (!summary || modal || this.prepareInFlight || this.submitInFlight || this.disposed) return
    if (summary.mode === 'new') { this.prepare(summary.messageId); return }
    if (!summary.target || summary.targetStatus !== 'ready') return
    const controller = new AbortController(); this.prepareAbort = controller; this.prepareInFlight = true
    this.pendingStartedAt = performance.now()
    this.state.update(state => { state.preparingMessageId = summary.messageId; state.failure = null })
    const request = { requestKey: crypto.randomUUID(), sessionId: this.sessionId, messageId: summary.messageId,
      ideaId: summary.target.id, expectedCurrentVersionId: summary.target.versionId }
    void (async () => {
      const started = performance.now()
      try {
        const result = await this.remote.prepareUpdateFromMessage(request, controller.signal)
        if (controller.signal.aborted || this.disposed) return
        if (result.ok) {
          this.previewReadyAt = performance.now()
          this.state.update(state => {
            state.modal = { kind: 'update', updateId: result.value.updateId, target: result.value.targetSummary,
              draft: editableFrom(result.value.draft), source: result.value.sourceStats }
          })
        } else this.state.update(state => { state.failure = updateFailure(result.error.code) })
      } catch {
        if (!controller.signal.aborted && !this.disposed) this.state.update(state => { state.failure = 'prepare-failed' })
      } finally {
        this.performance.record('client.rpc', started)
        if (this.prepareAbort === controller) {
          this.prepareAbort = undefined; this.prepareInFlight = false
          this.state.update(state => { state.preparingMessageId = null })
        }
      }
    })()
  }

  private cancelPreparation(): void {
    this.prepareAbort?.abort(); this.prepareAbort = undefined; this.prepareInFlight = false
    this.pendingStartedAt = undefined; this.previewReadyAt = undefined
    this.state.update(state => { state.preparingMessageId = null })
  }

  /** Start the one prepare call for a message; repeats while pending are
   * no-ops. Session-only: a default-context surface (Settings, T12.3) has no
   * conversation to prepare from and never enters this flow. */
  prepare(messageId: MessageId): void {
    if (this.context.kind !== 'session' || this.disposed) return
    const { preparingMessageId, modal } = this.state.getSnapshot()
    if (this.prepareInFlight || preparingMessageId !== null || modal !== null) return
    this.prepareInFlight = true
    const controller = new AbortController()
    this.prepareAbort = controller
    this.pendingStartedAt = performance.now()
    this.state.update((draft) => { draft.preparingMessageId = messageId; draft.failure = null })
    void this.runPrepare(messageId, controller)
  }

  private async runPrepare(messageId: MessageId, controller: AbortController): Promise<void> {
    let outcome: 'done' | 'cancelled' | 'failed' = 'failed'
    let modal: IdeaModalState | null = null
    const rpcStartedAt = performance.now()
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
      this.performance.record('client.rpc', rpcStartedAt)
      if (this.prepareAbort === controller) {
        this.prepareInFlight = false
        this.prepareAbort = undefined
      }
    }
    // Cancellation or a superseded request has no authority over a later prepare.
    if (controller.signal.aborted || this.disposed || outcome === 'cancelled') return
    if (outcome === 'done' && modal !== null) {
      this.previewReadyAt = performance.now()
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

  /** Called after the corresponding React commit; each phase records once. */
  recordRendered(phase: 'pending' | 'preview'): void {
    if (phase === 'pending' && this.pendingStartedAt !== undefined
      && this.state.getSnapshot().preparingMessageId !== null) {
      this.performance.record('client.pending-render', this.pendingStartedAt)
      this.pendingStartedAt = undefined
    } else if (phase === 'preview' && this.previewReadyAt !== undefined
      && this.state.getSnapshot().modal !== null) {
      this.performance.record('client.preview-render', this.previewReadyAt)
      this.previewReadyAt = undefined
    }
  }

  /** Apply one field edit to the open modal's draft. */
  editDraft(patch: Partial<EditableIdeaDraft>): void {
    const { modal, submitting } = this.state.getSnapshot()
    if (modal === null || submitting || (modal.kind === 'update' && modal.locked)) return
    const next = { ...modal, draft: { ...modal.draft, ...patch } }
    // Identity against a raw snapshot cannot be tested inside the immer
    // draft (draft proxies never equal raw objects); the operation's opaque
    // reference identifies the modal this edit targeted.
    this.state.update((current) => {
      if (current.modal !== null && (modal.kind === 'update'
        ? current.modal.updateId === modal.updateId
        : current.modal.preparationId === modal.preparationId)) {
        current.modal = next
      }
    })
  }

  /** Submit the edited draft; double-clicks while submitting are no-ops. */
  submit(): void {
    const { modal } = this.state.getSnapshot()
    if (modal === null || this.submitInFlight || !requiredPresent(modal.draft)
      || (modal.kind === 'update' && ['conflict', 'expired', 'unavailable', 'uncertain'].includes(modal.issue ?? ''))) return
    this.submitInFlight = true
    this.state.update((current) => {
      current.submitting = true
      current.failure = null
    })
    void this.runSubmit(modal)
  }

  private async runSubmit(modal: IdeaModalState): Promise<void> {
    if (modal.kind === 'update') { await this.runUpdateSubmit(modal); return }
    let result: Awaited<ReturnType<IdeaRemoteFace['create']>>
    try {
      // A thrown carrier error is an unclear outcome, not a known failure:
      // the modal stays open and a retry resubmits the SAME preparation id —
      // the Host commit machine dedups it (T12: never re-prepare to recover).
      result = await this.remote.create({
        preparationId: modal.preparationId,
        draft: durableFrom(modal.draft),
      })
    } catch {
      result = { ok: false, error: { code: 'gateway/internal' } }
    }
    this.submitInFlight = false
    // The modal was replaced or closed underneath: nothing to report.
    if (this.state.getSnapshot().modal !== modal) {
      this.state.update((current) => { current.submitting = false })
      return
    }
    if (result.ok) {
      this.state.update((current) => {
        current.modal = null
        current.summary = null
        current.success = 'saved'
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

  private async runUpdateSubmit(modal: Extract<IdeaModalState, { kind: 'update' }>): Promise<void> {
    let result: Outcome<IdeaUpdateResult>
    try { result = await this.remote.commitPreparedUpdate({ updateId: modal.updateId, draft: durableFrom(modal.draft) }) }
    catch { result = { ok: false, error: { code: 'gateway/internal' } } }
    this.submitInFlight = false
    if (this.disposed || this.state.getSnapshot().modal !== modal) return
    if (result.ok) {
      this.state.update(state => {
        state.modal = null; state.summary = null; state.submitting = false; state.failure = null
        state.success = result.value.updated ? 'updated' : 'unchanged'; state.toastSeq += 1
      })
      return
    }
    const failure = updateFailure(result.error.code, true)
    this.state.update(state => {
      state.submitting = false; state.failure = failure
      if (state.modal?.kind === 'update') { state.modal.issue = failure; state.modal.locked = result.error.code !== 'idea/invalid-draft' }
    })
    // A read is evidence for user verification, never authority to rebase or rewrite.
    if (failure === 'uncertain') {
      try {
        const read = await this.remote.get({ id: modal.target.ideaId })
        if (this.disposed) return
        this.state.update(state => {
          if (state.modal?.kind === 'update' && state.modal.updateId === modal.updateId) state.modal.verifiedCurrent = read.ok ? read.value : null
        })
      } catch { /* Keep the result uncertain; no automatic write or model call. */ }
    }
  }

  /** Close the modal with zero durable writes; ignored while committing. */
  cancel(): void {
    if (this.submitInFlight) return
    this.queryAbort?.abort(); this.targetAbort?.abort()
    this.previewReadyAt = undefined
    if (this.prepareAbort !== undefined) {
      const controller = this.prepareAbort
      this.prepareAbort = undefined
      this.prepareInFlight = false
      this.pendingStartedAt = undefined
      controller.abort()
    }
    this.state.update((current) => {
      current.preparingMessageId = null
      current.modal = null
      current.summary = null
      current.failure = null
    })
  }

  /** Retire a conversation summary on navigation; retain independent Quick Capture previews. */
  cancelPending(): void {
    if (this.prepareAbort !== undefined || this.state.getSnapshot().summary !== null) this.cancel()
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

/** Open the preview modal for a quick-capture proposal (T12): the same
   * editable modal the chat flow uses, with no source stats to show.
   * @returns whether the handoff was accepted; `false` means this surface is
   * busy and the caller must keep the user's note visible (T12.2 R1). */
  openQuickPreview(preview: QuickCapturePreview): boolean {
    if (this.prepareInFlight || this.submitInFlight) return false
    const { preparingMessageId, modal } = this.state.getSnapshot()
    if (preparingMessageId !== null || modal !== null || this.state.getSnapshot().summary !== null) return false
    this.state.update((current) => {
      current.modal = {
        preparationId: preview.preparationId,
        draft: editableFrom(preview.draft),
        source: null,
      }
    })
    return true
  }

  /**
   * Auto-commit a direct-save quick-capture proposal (T12.2 R4): the
   * Preparation → commit chain runs without a confirmation step, on the
   * SAME preparation id. An unclear (thrown) outcome is retried once with
   * that id — the Host commit machine dedups, so a retry never double-writes
   * — and a retry is the only recovery ever attempted (never a re-prepare).
   * @returns a promise resolving with the commit outcome; `'failed'` also
   * covers a busy surface (the caller must keep the user's note visible).
   */
  commitQuickPreview(preview: QuickCapturePreview): Promise<QuickCommitOutcome> {
    // R10: a busy surface means the commit is NOT attempted — distinct from
    // a definitive Host failure, so the caller never treats it as one.
    if (this.submitInFlight) return Promise.resolve('busy')
    const { preparingMessageId, modal } = this.state.getSnapshot()
    if (preparingMessageId !== null || modal !== null || this.state.getSnapshot().summary !== null) return Promise.resolve('busy')
    this.submitInFlight = true
    this.state.update((current) => {
      current.submitting = true
      current.failure = null
    })
    return this.runQuickCommit(preview)
  }

  private async runQuickCommit(preview: QuickCapturePreview): Promise<QuickCommitOutcome> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.remote.create({
          preparationId: preview.preparationId,
          // The Host prepared this draft; it is committed verbatim (the
          // browser never re-edits a direct-save proposal).
          draft: preview.draft,
        })
        // R6: every exit path fully restores both the in-flight flag and the
        // observable submitting state — never a stuck spinner.
        this.submitInFlight = false
        if (!result.ok) {
          // R9: a Gateway/transport-class structured failure means the
          // Host's answer is UNKNOWN — the request may or may not have
          // landed — so it is classified `unclear` (same-id recovery only),
          // never as a definitive failure. Only plugin-owned `idea/*` codes
          // are definitive: the Host answered and reset the preparation.
          if (result.error.code.startsWith('gateway/')) {
            this.state.update((current) => { current.submitting = false })
            return 'unclear'
          }
          this.state.update((current) => { current.submitting = false })
          return 'failed'
        }
        this.state.update((current) => {
          current.submitting = false
          current.success = 'saved'
          current.toastSeq += 1
        })
        return 'success'
      } catch {
        // Unclear outcome: the modal machinery is not involved; the same-id
        // retry below is the only recovery (T12.2 R4/R8).
      }
    }
    this.submitInFlight = false
    this.state.update((current) => { current.submitting = false })
    return 'unclear'
  }

  /** Abort any in-flight prepare and reset to the closed state. */
  dispose(): void {
    this.disposed = true
    this.queryAbort?.abort(); this.targetAbort?.abort()
    this.prepareAbort?.abort()
    this.prepareAbort = undefined
    this.prepareInFlight = false
    this.submitInFlight = false
    this.pendingStartedAt = undefined
    this.previewReadyAt = undefined
    this.state.update((current) => {
      current.preparingMessageId = null
      current.modal = null
      current.summary = null
      current.submitting = false
      current.failure = null
      current.toastSeq = 0
    })
  }
}

/** Only known pre-write rejections remain retryable; unknown saves require verification. */
function updateFailure(code: string, committing = false): IdeaUiFailure {
  if (code === 'idea/version-conflict') return 'conflict'
  if (code === 'idea/update-not-found') return 'expired'
  if (['idea/archived', 'idea/deleting', 'idea/not-found'].includes(code)) return 'unavailable'
  if (code.startsWith('idea/source-')) return 'source'
  if (code === 'idea/model-unavailable' || code === 'idea/model-failed') return 'model'
  if (code === 'idea/invalid-model-output') return 'invalid-output'
  if (committing && !['idea/invalid-draft'].includes(code)) return 'uncertain'
  return committing ? 'save-failed' : 'prepare-failed'
}
