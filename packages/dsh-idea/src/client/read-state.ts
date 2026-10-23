/** Current-content Idea library, manual editing and lifecycle state.
 * Every mutation stays Host-owned; stale reads cannot replace another detail. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  IdeaDeleteResult,
  IdeaDetail,
  IdeaLifecycleResult,
  IdeaListRow,
  IdeaManualEditResult,
  IdeaSearchResult,
} from '../remote-host/types.ts'
import { durableFrom, editableFrom } from './state.ts'
import type { EditableIdeaDraft } from './state.ts'
import type { IdeaDraft } from '../types.ts'

/** The wire outcome of one read call. */
type RemoteRead<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string } }

/** The library view keys — exactly the two tabs; no deleted view exists. */
export type IdeaViewKey = 'current' | 'archived'

/** The read face of the Host idea namespace the section talks to. */
export interface IdeaReadFace {
  list(request: { view: IdeaViewKey }): Promise<RemoteRead<readonly IdeaListRow[]>>
  search(request: { query: string; scope: 'all' }, signal?: AbortSignal): Promise<RemoteRead<readonly IdeaSearchResult[]>>
  get(request: { id: string }): Promise<RemoteRead<IdeaDetail>>
  /** T13.1: durably pause or resume proactive reminders for one Idea. */
  setResurfacingMuted(request: { id: string; muted: boolean }): Promise<RemoteRead<{ muted: boolean }>>
  manualEdit(request: {
    id: string
    expectedCurrentVersionId: string
    draft: IdeaDraft
  }): Promise<RemoteRead<IdeaManualEditResult>>
  archive(request: { id: string; expectedCurrentVersionId: string }): Promise<RemoteRead<IdeaLifecycleResult>>
  restore(request: { id: string; expectedCurrentVersionId: string }): Promise<RemoteRead<IdeaLifecycleResult>>
  deleteIdea(request: { id: string; expectedCurrentVersionId: string }): Promise<RemoteRead<IdeaDeleteResult>>
}

/** The load lifecycle of one library view. */
export type IdeaReadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** One library view's load state and rows (Host order). */
export interface IdeaListLoad {
  status: IdeaReadStatus
  items: readonly IdeaListRow[]
}

/** The mixed-scope search load state over the whole library. */
export interface IdeaSearchLoad {
  status: IdeaReadStatus
  items: readonly IdeaSearchResult[]
}

/** The manual-edit lifecycle. `loading` marks an edit requested from a row
 * whose detail is still being fetched; the editor opens once it lands. */
export type IdeaEditStatus = 'idle' | 'loading' | 'reviewing' | 'committing' | 'error' | 'conflict'

/** The manual-edit editor state: the version it opened against plus the draft. */
export interface IdeaEditState {
  status: IdeaEditStatus
  /** The idea being edited; null while idle. */
  ideaId: string | null
  /** The current version the editor opened at — sent as `expectedCurrentVersionId`. */
  baseVersionId: string | null
  draft: EditableIdeaDraft | null
}

/** The permanent-delete lifecycle: confirmation gated, never optimistic. */
export type IdeaDeletionStatus = 'closed' | 'confirming' | 'deleting' | 'error'

/** The delete confirmation/deletion state over one idea. */
export interface IdeaDeletionState {
  status: IdeaDeletionStatus
  ideaId: string | null
  /** The wire code of the last failed delete, absent for a generic failure. */
  errorCode: string | null
}

/** The archive/restore click lifecycle on the detail's actions. */
export type IdeaLifecycleStatus = 'idle' | 'loading' | 'error'

/** The section snapshot. */
export interface IdeaReadState {
  /** The selected library tab. Switching is a read-only operation. */
  view: IdeaViewKey
  /** Per-view load states — current and archived load independently. */
  lists: { current: IdeaListLoad; archived: IdeaListLoad }
  /**
   * The section search box's text. Blank means the tabbed library views;
   * non-blank means one Host-ranked mixed search over every Idea
   * (scope `all`), each row marked with its status. The tabs and their
   * cached lists are untouched by searching and return on clearing.
   */
  searchQuery: string
  /** T13.1: whether the last reminder toggle failed (visible affordance). */
  reminderError: boolean
  /** T13.1: the reminder-toggle lifecycle. */
  reminderStatus: 'idle' | 'loading' | 'error'
  /** The mixed search load state behind the search box. */
  search: IdeaSearchLoad
  /** The open detail's idea id, or null while the list is shown. */
  detailId: string | null
  detailStatus: 'loading' | 'ready' | 'error'
  /** The loaded detail; non-null only while `detailStatus` is `ready`. */
  detail: IdeaDetail | null
  /** The wire code of the detail failure, absent for a generic failure. */
  detailErrorCode: string | null
  /** The manual-edit editor state. */
  edit: IdeaEditState
  /** The archive click lifecycle on the detail's actions. */
  archiveStatus: IdeaLifecycleStatus
  /** The restore click lifecycle on the detail's actions. */
  restoreStatus: IdeaLifecycleStatus
  /** The permanent-delete confirmation/deletion state. */
  deletion: IdeaDeletionState
}

const IDLE_EDIT: IdeaEditState = { status: 'idle', ideaId: null, baseVersionId: null, draft: null }
const CLOSED_DELETION: IdeaDeletionState = { status: 'closed', ideaId: null, errorCode: null }

const INITIAL: IdeaReadState = {
  reminderError: false,
  reminderStatus: 'idle',
  view: 'current',
  lists: { current: { status: 'idle', items: [] }, archived: { status: 'idle', items: [] } },
  searchQuery: '',
  search: { status: 'idle', items: [] },
  detailId: null,
  detailStatus: 'loading',
  detail: null,
  detailErrorCode: null,
  edit: IDLE_EDIT,
  archiveStatus: 'idle',
  restoreStatus: 'idle',
  deletion: CLOSED_DELETION,
}

/** The current version's draft as the editor's baseline for no-change detection. */
export const detailDraftOf = (detail: IdeaDetail): IdeaDraft => ({
  title: detail.title,
  core: detail.core,
  motivation: detail.motivation,
  currentConclusion: detail.currentConclusion,
  possibleValue: detail.possibleValue,
  useWhen: [...detail.useWhen],
  openQuestions: [...detail.openQuestions],
})

/** The current version's draft as an editable form payload. */
const editableFromDetail = (detail: IdeaDetail): EditableIdeaDraft => editableFrom(detailDraftOf(detail))

/**
 * The Ideas section's controller: one lazy load per library view, one
 * detail read at a time (opening a new detail aborts the previous), at most
 * one continuation/edit/commit/delete click in flight, and a dispose that
 * aborts everything in flight.
 */
export class IdeaReadSurface {
  /** Observable section state; the section component selects slices of it. */
  readonly state: SnapshotStore<IdeaReadState> = createSnapshotStore<IdeaReadState>({ ...INITIAL })

  private listFlights: Record<IdeaViewKey, boolean> = { current: false, archived: false }
  private listAborts: Record<IdeaViewKey, AbortController | undefined> = { current: undefined, archived: undefined }
  private searchAbort: AbortController | undefined
  private detailAbort: AbortController | undefined
  /** T13.1 R3: request generation for reminder preference mutations. */
  private reminderGeneration = 0
  /** An edit requested from a row whose detail is still loading. */
  private pendingEditId: string | null = null

  constructor(private readonly remote: IdeaReadFace) {}

  /** Load the selected view once; repeats while ready or already loading are no-ops. */
  load(): void {
    this.loadList(this.state.getSnapshot().view)
  }

  /** Switch the library tab. Read-only: at most a lazy load of that view. */
  selectView(view: IdeaViewKey): void {
    if (this.state.getSnapshot().view === view) return
    this.state.update((draft) => { draft.view = view })
    this.loadList(view)
  }

  private loadList(view: IdeaViewKey, force = false): void {
    if (this.listFlights[view]) return
    const { status } = this.state.getSnapshot().lists[view]
    if (!force && (status === 'ready' || status === 'loading')) return
    this.listFlights[view] = true
    const controller = new AbortController()
    this.listAborts[view] = controller
    this.state.update((draft) => { draft.lists[view].status = 'loading' })
    void this.runLoadList(view, controller)
  }

  private async runLoadList(view: IdeaViewKey, controller: AbortController): Promise<void> {
    let items: readonly IdeaListRow[] | undefined
    try {
      const result = await this.remote.list({ view })
      if (!controller.signal.aborted && result.ok) items = result.value
    } catch {
      // A thrown carrier failure renders as the view's error state.
    } finally {
      this.listFlights[view] = false
      this.listAborts[view] = undefined
    }
    if (controller.signal.aborted) return
    this.state.update((draft) => {
      if (items === undefined) {
        draft.lists[view].status = 'error'
        return
      }
      draft.lists[view].status = 'ready'
      draft.lists[view].items = items
    })
  }

  /**
   * T12.3: after a library creation succeeds, exit any search, return to the
   * Current view, and force-refetch it so the new Idea is immediately
   * visible. Never optimistic.
   */
  refreshToCurrent(): void {
    this.searchIdeas('')
    this.selectView('current')
    this.loadList('current', true)
  }

  /** Refetch both views after a confirmed mutation; never optimistic. */
  private refreshLists(): void {
    this.loadList('current', true)
    this.loadList('archived', true)
    // A live search re-runs too, so returning from the mutation's detail
    // never shows a stale mixed list.
    const { searchQuery } = this.state.getSnapshot()
    if (searchQuery.trim().length > 0) this.searchIdeas(searchQuery)
  }

  /**
   * Run the section search for the typed query. A blank query returns to
   * the tabbed library views (the tabs and their cached lists are
   * untouched); a non-blank query is one Host-ranked mixed search over
   * every Idea (scope `all`), with a newer query superseding an older one.
   */
  /**
   * T13.1: durably pause or resume proactive reminders for one Idea via the
   * Host preference, then refresh the open detail's projected state. A
   * failure surfaces through the reminder toggle's error affordance; the
   * preference itself never pretends to have changed.
   */
  async setResurfacingMuted(id: string, muted: boolean): Promise<void> {
    // T13.1 R3: the in-flight request is bound to the generation and the idea
    // it was issued for; only the current owner may apply its completion.
    const generation = this.reminderGeneration
    this.state.update((draft) => { draft.reminderStatus = 'loading' })
    const result = await this.remote.setResurfacingMuted({ id, muted })
      .catch(() => ({ ok: false as const, error: { code: 'gateway/internal' } }))
    if (generation !== this.reminderGeneration) {
      // open()/closeDetail() invalidated this request's UI authority; the
      // Host durable mutation has already landed and is not rolled back.
      return
    }
    if (!result.ok) {
      this.state.update((draft) => {
        draft.reminderStatus = 'error'
        draft.reminderError = true
      })
      return
    }
    this.state.update((draft) => {
      draft.reminderStatus = 'idle'
      draft.reminderError = false
      if (draft.detail !== null && draft.detailId === id) {
        draft.detail = { ...draft.detail, resurfacingMuted: muted }
      }
    })
  }

  searchIdeas(query: string): void {
    this.state.update((draft) => { draft.searchQuery = query })
    if (query.trim().length === 0) {
      this.searchAbort?.abort()
      this.searchAbort = undefined
      this.state.update((draft) => { draft.search = { status: 'idle', items: [] } })
      return
    }
    this.searchAbort?.abort()
    const controller = new AbortController()
    this.searchAbort = controller
    this.state.update((draft) => { draft.search.status = 'loading' })
    void this.runSearchIdeas(query, controller)
  }

  private async runSearchIdeas(query: string, controller: AbortController): Promise<void> {
    let items: readonly IdeaSearchResult[] | undefined
    try {
      const result = await this.remote.search({ query, scope: 'all' }, controller.signal)
      if (!controller.signal.aborted && result.ok) items = result.value
    } catch {
      // A thrown carrier failure renders as the search's error state.
    }
    if (controller.signal.aborted) return
    this.state.update((draft) => {
      // A newer query superseded this flight underneath the abort.
      if (draft.searchQuery !== query) return
      if (items === undefined) {
        draft.search.status = 'error'
        return
      }
      draft.search.status = 'ready'
      draft.search.items = items
    })
  }

  /** Open one Idea's current content; any prior read is abandoned. */
  open(id: string, options: { edit?: boolean } = {}): void {
    this.detailAbort?.abort()
    // T13.1 R3: any in-flight reminder request from the previous detail loses
    // its UI authority; the visible lifecycle resets with this open.
    this.reminderGeneration += 1
    this.state.update((draft) => {
      draft.reminderStatus = 'idle'
      draft.reminderError = false
    })
    const controller = new AbortController()
    this.detailAbort = controller
    this.pendingEditId = options.edit === true ? id : null
    this.state.update((draft) => {
      draft.detailId = id
      draft.detailStatus = 'loading'
      draft.detail = null
      draft.detailErrorCode = null
      draft.edit = IDLE_EDIT
      draft.archiveStatus = 'idle'
      draft.restoreStatus = 'idle'
      draft.deletion = CLOSED_DELETION
    })
    void this.runOpen(id, controller)
  }

  private async runOpen(id: string, controller: AbortController): Promise<void> {
    let detail: IdeaDetail | undefined
    let errorCode: string | undefined
    try {
      const result = await this.remote.get({ id })
      if (controller.signal.aborted) return
      if (result.ok) detail = result.value
      else errorCode = result.error.code
    } catch {
      // A thrown carrier failure renders as the generic detail error.
      if (controller.signal.aborted) return
    }
    this.state.update((draft) => {
      // The user moved on while this read was in flight.
      if (draft.detailId !== id) return
      if (detail !== undefined) {
        draft.detailStatus = 'ready'
        draft.detail = detail
        // A row-hover Edit that opened this detail enters the editor now.
        if (this.pendingEditId === id) {
          draft.edit = { status: 'reviewing', ideaId: id, baseVersionId: detail.versionId, draft: editableFromDetail(detail) }
        }
      } else {
        draft.detailStatus = 'error'
        draft.detailErrorCode = errorCode ?? null
      }
    })
    if (this.pendingEditId === id) this.pendingEditId = null
  }

  /**
   * Open the manual-edit editor for one idea. From the detail it opens
   * synchronously out of the loaded version; from a list row (hover-card
   * quick action) it opens the detail first and enters the editor once the
   * read lands.
   */
  openEditor(id: string): void {
    const { detail, detailStatus } = this.state.getSnapshot()
    if (detail !== null && detailStatus === 'ready' && detail.id === id) {
      this.state.update((draft) => {
        draft.edit = { status: 'reviewing', ideaId: id, baseVersionId: detail.versionId, draft: editableFromDetail(detail) }
      })
      return
    }
    this.open(id, { edit: true })
  }

  /** Close the detail and return to the list. */
  closeDetail(): void {
    this.detailAbort?.abort()
    this.detailAbort = undefined
    this.pendingEditId = null
    // T13.1 R3: a closing detail invalidates its in-flight reminder requests.
    this.reminderGeneration += 1
    this.state.update((draft) => {
      draft.reminderStatus = 'idle'
      draft.reminderError = false
      draft.detailId = null
      draft.detailStatus = 'loading'
      draft.detail = null
      draft.detailErrorCode = null
      draft.edit = IDLE_EDIT
      draft.archiveStatus = 'idle'
      draft.restoreStatus = 'idle'
      draft.deletion = CLOSED_DELETION
    })
  }

  /** Apply one field edit to the manual-edit form. */
  editDraft(patch: Partial<EditableIdeaDraft>): void {
    const { edit } = this.state.getSnapshot()
    if (edit.status !== 'reviewing' || edit.draft === null) return
    this.state.update((draft) => {
      if (draft.edit.ideaId === edit.ideaId && draft.edit.draft !== null) {
        draft.edit = { ...draft.edit, draft: { ...draft.edit.draft, ...patch } }
      }
    })
  }

  /** Discard the manual-edit form; zero durable writes, ignored while committing. */
  cancelEdit(): void {
    const { edit } = this.state.getSnapshot()
    if (edit.status === 'committing') return
    this.state.update((draft) => { draft.edit = IDLE_EDIT })
  }

  /**
   * Save the edited draft as the next version at the version the editor
   * opened against. A normalized no-op never reaches this (the client
   * disables Save; the domain independently rejects it). A conflict keeps
   * the edits visible with explicit stale copy; success refetches the
   * current detail so the appended `manual-edit` version shows up.
   */
  commitEdit(): void {
    const { edit } = this.state.getSnapshot()
    if (edit.status !== 'reviewing' || edit.draft === null || edit.baseVersionId === null || edit.ideaId === null) return
    this.state.update((draft) => {
      if (draft.edit.ideaId === edit.ideaId) draft.edit = { ...draft.edit, status: 'committing' }
    })
    void this.runCommitEdit(edit.ideaId, edit.baseVersionId, edit.draft)
  }

  private async runCommitEdit(id: string, baseVersionId: string, draft: EditableIdeaDraft): Promise<void> {
    let committed = false
    let conflict = false
    try {
      const result = await this.remote.manualEdit({
        id,
        expectedCurrentVersionId: baseVersionId,
        draft: durableFrom(draft),
      })
      if (result.ok) committed = true
      else conflict = result.error.code === 'idea/version-conflict'
    } catch {
      // A thrown carrier failure renders as the edit error state.
    }
    const snapshot = this.state.getSnapshot()
    // The user moved to another idea while the commit ran.
    if (snapshot.detailId !== id || snapshot.edit.ideaId !== id) return
    if (committed) {
      this.state.update((draft) => { draft.edit = IDLE_EDIT })
      this.refreshLists()
      // Re-open so the refreshed current content show up.
      this.open(id)
      return
    }
    this.state.update((draft) => {
      if (draft.edit.ideaId !== id) return
      draft.edit = { ...draft.edit, status: conflict ? 'conflict' : 'error' }
    })
  }

  /** Archive the open idea. Never optimistic: the lists refresh on Host success. */
  archiveIdea(): void {
    const { detail, archiveStatus } = this.state.getSnapshot()
    if (detail === null || detail.status === 'archived' || archiveStatus === 'loading') return
    this.state.update((draft) => { draft.archiveStatus = 'loading' })
    void this.runLifecycle('archive', detail.id, detail.versionId)
  }

  /** Restore the open archived idea. Same shape as {@link IdeaReadSurface.archiveIdea}. */
  restoreIdea(): void {
    const { detail, restoreStatus } = this.state.getSnapshot()
    if (detail === null || detail.status !== 'archived' || restoreStatus === 'loading') return
    this.state.update((draft) => { draft.restoreStatus = 'loading' })
    void this.runLifecycle('restore', detail.id, detail.versionId)
  }

  private async runLifecycle(
    kind: 'archive' | 'restore',
    id: string,
    expectedCurrentVersionId: string,
  ): Promise<void> {
    let done: IdeaLifecycleResult | undefined
    try {
      const result = kind === 'archive'
        ? await this.remote.archive({ id, expectedCurrentVersionId })
        : await this.remote.restore({ id, expectedCurrentVersionId })
      if (result.ok) done = result.value
    } catch {
      // A thrown carrier failure renders as the action's error state.
    }
    const snapshot = this.state.getSnapshot()
    if (snapshot.detailId !== id) return
    if (done === undefined) {
      // Nothing was confirmed: no refetch, no re-open — the visible error
      // stays on the detail and the retry carries the same (still valid)
      // expected version.
      this.state.update((draft) => {
        if (kind === 'archive') draft.archiveStatus = 'error'
        else draft.restoreStatus = 'error'
      })
      return
    }
    // Refresh whichever lists are loaded so the idea lands in the right tab.
    this.refreshLists()
    this.state.update((draft) => {
      if (kind === 'archive') draft.archiveStatus = 'idle'
      else draft.restoreStatus = 'idle'
      draft.edit = IDLE_EDIT
    })
    // Re-open so the detail re-renders for the new status.
    this.open(id)
  }

  /** Open the permanent-delete confirmation for the open idea. Detail-only. */
  requestDelete(): void {
    const { detail, deletion } = this.state.getSnapshot()
    if (detail === null || deletion.status === 'deleting') return
    this.state.update((draft) => {
      draft.deletion = { status: 'confirming', ideaId: detail.id, errorCode: null }
    })
  }

  /** Close the delete confirmation; zero durable writes, ignored while deleting. */
  cancelDelete(): void {
    const { deletion } = this.state.getSnapshot()
    if (deletion.status === 'deleting') return
    this.state.update((draft) => { draft.deletion = CLOSED_DELETION })
  }

  /**
   * Confirm the permanent delete at the version the detail was read at.
   * The Host runs the optimistic check before any destructive work; a stale
   * request fails with zero delete work and the confirmation stays open.
   * Success (or an already-deleted not-found) exits the detail and refetches
   * the lists — no Deleted view exists to navigate to.
   */
  confirmDelete(): void {
    const { detail, deletion } = this.state.getSnapshot()
    if (detail === null || deletion.ideaId !== detail.id) return
    if (deletion.status !== 'confirming' && deletion.status !== 'error') return
    this.state.update((draft) => {
      draft.deletion = { status: 'deleting', ideaId: detail.id, errorCode: null }
    })
    void this.runDelete(detail.id, detail.versionId)
  }

  private async runDelete(id: string, expectedCurrentVersionId: string): Promise<void> {
    let outcome: 'deleted' | 'gone' | 'failed' = 'failed'
    let errorCode: string | undefined
    try {
      const result = await this.remote.deleteIdea({ id, expectedCurrentVersionId })
      if (result.ok) outcome = 'deleted'
      else if (result.error.code === 'idea/not-found') outcome = 'gone'
      else errorCode = result.error.code
    } catch {
      // A thrown carrier failure renders as the confirmation's error state.
    }
    // Refresh whichever lists are loaded so the idea disappears everywhere.
    this.refreshLists()
    const snapshot = this.state.getSnapshot()
    if (outcome === 'failed') {
      if (snapshot.deletion.ideaId === id) {
        this.state.update((draft) => {
          draft.deletion = { status: 'error', ideaId: id, errorCode: errorCode ?? null }
        })
      }
      return
    }
    if (snapshot.detailId === id) this.closeDetail()
    this.state.update((draft) => {
      if (draft.deletion.ideaId === id) draft.deletion = CLOSED_DELETION
    })
  }

  /** Abort every in-flight read. */
  dispose(): void {
    for (const key of ['current', 'archived'] as const) {
      this.listAborts[key]?.abort()
      this.listAborts[key] = undefined
      this.listFlights[key] = false
    }
    this.searchAbort?.abort()
    this.searchAbort = undefined
    this.detailAbort?.abort()
    this.detailAbort = undefined
    this.pendingEditId = null
  }
}
