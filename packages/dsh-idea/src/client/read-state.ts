/**
 * The Ideas settings section's browser state: the two library views
 * (current/archived), the open detail, the detail's Continue Discussion
 * action, the evolution proposal flow the discussion unlocks, and the T8
 * lifecycle flows — manual edit (idle/loading/reviewing/committing/error/
 * conflict), archive, restore, and the permanent-delete confirmation
 * (closed/confirming/deleting/error). The reads are read-only by
 * construction; the write paths are user-triggered, guard against duplicate
 * clicks, and a failure keeps the user's input on screen for retry. A
 * confirmed delete exits the detail only after the Host confirmed; the
 * lists refetch from the Host afterwards, never optimistically. Tab and
 * detail switches abandon in-flight results so a stale response can never
 * apply to another view or Idea. Preparing a proposal writes nothing
 * durable. Every fact is fetched from the Host `idea` namespace on demand,
 * and disposing the surface aborts any in-flight read. No canonical Idea
 * data lives here beyond what a read returned.
 * @module @dsh-external/dsh-idea/client/read-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  IdeaCommitEvolutionResult,
  IdeaContinueDiscussionResult,
  IdeaDeleteResult,
  IdeaDetail,
  IdeaEvolutionProposalPreview,
  IdeaLifecycleResult,
  IdeaListRow,
  IdeaManualEditResult,
  IdeaVersionSummary,
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
  get(request: { id: string }): Promise<RemoteRead<IdeaDetail>>
  getVersions(request: { id: string }): Promise<RemoteRead<readonly IdeaVersionSummary[]>>
  continueDiscussion(request: { id: string; workspaceId?: string }): Promise<RemoteRead<IdeaContinueDiscussionResult>>
  prepareEvolution(
    request: { discussionId: string },
    signal?: AbortSignal,
  ): Promise<RemoteRead<IdeaEvolutionProposalPreview>>
  commitEvolution(request: {
    proposalId: string
    expectedCurrentVersionId: string
    draft: IdeaDraft
  }): Promise<RemoteRead<IdeaCommitEvolutionResult>>
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

/** The evolution proposal flow's lifecycle inside the detail view. */
export type IdeaEvolutionStatus = 'idle' | 'preparing' | 'reviewing' | 'committing' | 'error'

/** The open detail's pending evolution proposal: reference plus editable draft. */
export interface IdeaProposalState {
  proposalId: string
  baseVersionId: string
  draft: EditableIdeaDraft
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
  /** The open detail's idea id, or null while the list is shown. */
  detailId: string | null
  detailStatus: 'loading' | 'ready' | 'error'
  /** The loaded detail; non-null only while `detailStatus` is `ready`. */
  detail: IdeaDetail | null
  /** The wire code of the detail failure, absent for a generic failure. */
  detailErrorCode: string | null
  detailVersionsStatus: 'loading' | 'ready' | 'error'
  /** The open idea's version history, v1 first; ready alongside the detail. */
  detailVersions: readonly IdeaVersionSummary[]
  /** The detail's Continue Discussion click lifecycle. */
  continueStatus: 'idle' | 'loading' | 'error'
  /** The discussion workspace this detail's evolution flow reads from. */
  discussionId: string | null
  /** The evolution proposal flow's lifecycle. */
  evolutionStatus: IdeaEvolutionStatus
  /** Which half failed last, when `evolutionStatus` is `error`; `stale` marks a superseded discussion base. */
  evolutionFailure: 'prepare' | 'stale' | 'commit' | null
  /** The proposal under review, present only while reviewing. */
  proposal: IdeaProposalState | null
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
  view: 'current',
  lists: { current: { status: 'idle', items: [] }, archived: { status: 'idle', items: [] } },
  detailId: null,
  detailStatus: 'loading',
  detail: null,
  detailErrorCode: null,
  detailVersionsStatus: 'loading',
  detailVersions: [],
  continueStatus: 'idle',
  discussionId: null,
  evolutionStatus: 'idle',
  evolutionFailure: null,
  proposal: null,
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
  private detailAbort: AbortController | undefined
  private evolutionAbort: AbortController | undefined
  /** An edit requested from a row whose detail is still loading. */
  private pendingEditId: string | null = null

  constructor(
    private readonly remote: IdeaReadFace,
    /** Hands a created continuation conversation to the client session domain. */
    private readonly openConversation: (conversationId: string) => void | Promise<void> = () => {},
    /**
     * Resolves the Workspace the continuation conversation should be created
     * in — the current session's workspace, else the most recently updated
     * one. Returns undefined to let the Host create its default. The client
     * never creates or nominates the Session itself; the Host's Session
     * Controller owns that identity.
     */
    private readonly prepareWorkspace: () => Promise<string | undefined> = async () => undefined,
  ) {}

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

  /** Refetch both views after a confirmed mutation; never optimistic. */
  private refreshLists(): void {
    this.loadList('current', true)
    this.loadList('archived', true)
  }

  /** Open one idea's detail and its version history; any prior read is abandoned. */
  open(id: string, options: { edit?: boolean } = {}): void {
    this.detailAbort?.abort()
    const controller = new AbortController()
    this.detailAbort = controller
    this.pendingEditId = options.edit === true ? id : null
    this.state.update((draft) => {
      draft.detailId = id
      draft.detailStatus = 'loading'
      draft.detail = null
      draft.detailErrorCode = null
      draft.detailVersionsStatus = 'loading'
      draft.detailVersions = []
      draft.continueStatus = 'idle'
      draft.discussionId = null
      draft.evolutionStatus = 'idle'
      draft.evolutionFailure = null
      draft.proposal = null
      draft.edit = IDLE_EDIT
      draft.archiveStatus = 'idle'
      draft.restoreStatus = 'idle'
      draft.deletion = CLOSED_DELETION
    })
    void this.runOpen(id, controller)
    void this.runVersions(id, controller)
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
   * Load the open idea's version history alongside its detail. A failure
   * only hides the history block — the detail itself stays fully usable.
   */
  private async runVersions(id: string, controller: AbortController): Promise<void> {
    let versions: readonly IdeaVersionSummary[] | undefined
    try {
      const result = await this.remote.getVersions({ id })
      if (!controller.signal.aborted && result.ok) versions = result.value
    } catch {
      // A thrown carrier failure hides the history block, never the detail.
    }
    if (controller.signal.aborted) return
    this.state.update((draft) => {
      if (draft.detailId !== id) return
      if (versions === undefined) {
        draft.detailVersionsStatus = 'error'
      } else {
        draft.detailVersionsStatus = 'ready'
        draft.detailVersions = versions
      }
    })
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
        draft.proposal = null
        draft.evolutionStatus = 'idle'
        draft.evolutionFailure = null
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
    this.state.update((draft) => {
      draft.detailId = null
      draft.detailStatus = 'loading'
      draft.detail = null
      draft.detailErrorCode = null
      draft.detailVersionsStatus = 'loading'
      draft.detailVersions = []
      draft.continueStatus = 'idle'
      draft.discussionId = null
      draft.evolutionStatus = 'idle'
      draft.evolutionFailure = null
      draft.proposal = null
      draft.edit = IDLE_EDIT
      draft.archiveStatus = 'idle'
      draft.restoreStatus = 'idle'
      draft.deletion = CLOSED_DELETION
    })
  }

  /**
   * Continue the open idea as a new discussion. A click while one is in
   * flight is ignored — the button is the only entry, so duplicate clicks
   * collapse into one Host call (the Host additionally reuses the active
   * discussion for the same base version, and rejects archived ideas). On
   * success the created conversation is handed to the opener and the
   * discussion workspace is remembered as this detail's evolution source; a
   * failed opener lands in the same visible error state as a failed call —
   * never a silent retry.
   */
  continueDiscussion(id: string): void {
    if (this.state.getSnapshot().continueStatus === 'loading') return
    this.state.update((draft) => { draft.continueStatus = 'loading' })
    void this.runContinue(id)
  }

  private async runContinue(id: string): Promise<void> {
    let conversationId: string | undefined
    let discussionId: string | undefined
    try {
      const workspaceId = await this.prepareWorkspace()
      const result = await this.remote.continueDiscussion(
        workspaceId === undefined ? { id } : { id, workspaceId },
      )
      if (result.ok) {
        conversationId = result.value.conversationId
        discussionId = result.value.discussionId
      }
    } catch {
      // A thrown carrier failure renders as the continue error state.
    }
    if (conversationId !== undefined) {
      try {
        await this.openConversation(conversationId)
      } catch {
        conversationId = undefined
      }
    }
    this.state.update((draft) => {
      if (draft.detailId !== id) return
      draft.continueStatus = conversationId !== undefined ? 'idle' : 'error'
      if (conversationId !== undefined && discussionId !== undefined) {
        draft.discussionId = discussionId
      }
    })
  }

  /**
   * Ask the Host to propose the next version from this detail's discussion.
   * Guarded to the idle/error lifecycles; requires the discussion created by
   * a previous Continue Discussion. Zero durable writes happen on this path.
   */
  prepareEvolution(): void {
    const { discussionId, evolutionStatus } = this.state.getSnapshot()
    if (discussionId === null || evolutionStatus === 'preparing' || evolutionStatus === 'reviewing' || evolutionStatus === 'committing') return
    const controller = new AbortController()
    this.evolutionAbort = controller
    this.state.update((draft) => {
      draft.evolutionStatus = 'preparing'
      draft.evolutionFailure = null
    })
    void this.runPrepareEvolution(discussionId, controller)
  }

  private async runPrepareEvolution(discussionId: string, controller: AbortController): Promise<void> {
    let preview: IdeaEvolutionProposalPreview | undefined
    let failureCode: string | undefined
    let cancelled = false
    try {
      const result = await this.remote.prepareEvolution({ discussionId }, controller.signal)
      if (controller.signal.aborted) cancelled = true
      else if (result.ok) preview = result.value
      else failureCode = result.error.code
    } catch {
      // A thrown carrier failure renders as the prepare error state.
    } finally {
      this.evolutionAbort = undefined
    }
    if (cancelled) return
    this.state.update((draft) => {
      if (draft.discussionId !== discussionId) return
      if (preview !== undefined) {
        draft.evolutionStatus = 'reviewing'
        draft.proposal = {
          proposalId: preview.proposalId,
          baseVersionId: preview.baseVersionId,
          draft: editableFrom(preview.draft),
        }
      } else {
        draft.evolutionStatus = 'error'
        draft.evolutionFailure = failureCode === 'idea/version-conflict' ? 'stale' : 'prepare'
      }
    })
  }

  /** Apply one field edit to the proposal under review. */
  editProposalDraft(patch: Partial<EditableIdeaDraft>): void {
    const { proposal, evolutionStatus } = this.state.getSnapshot()
    if (proposal === null || evolutionStatus !== 'reviewing') return
    this.state.update((draft) => {
      if (draft.proposal !== null && draft.proposal.proposalId === proposal.proposalId) {
        draft.proposal = { ...draft.proposal, draft: { ...draft.proposal.draft, ...patch } }
      }
    })
  }

  /** Discard the proposal under review; zero durable writes, ignored while committing. */
  cancelProposal(): void {
    const { evolutionStatus } = this.state.getSnapshot()
    if (evolutionStatus === 'committing') return
    this.state.update((draft) => {
      draft.proposal = null
      draft.evolutionStatus = 'idle'
      draft.evolutionFailure = null
    })
  }

  /**
   * Commit the approved proposal as the next version, at the current version
   * this detail was read at. A failure keeps the reviewed draft on screen
   * for retry; success resets the flow and re-opens the detail so the new
   * current version and history are re-fetched.
   */
  commitProposal(): void {
    const { detail, proposal, evolutionStatus } = this.state.getSnapshot()
    if (detail === null || proposal === null || evolutionStatus !== 'reviewing') return
    this.state.update((draft) => {
      draft.evolutionStatus = 'committing'
      draft.evolutionFailure = null
    })
    void this.runCommitProposal(detail.id, proposal)
  }

  private async runCommitProposal(id: string, proposal: IdeaProposalState): Promise<void> {
    let committed: IdeaCommitEvolutionResult | undefined
    let stale = false
    try {
      const { detail } = this.state.getSnapshot()
      const result = await this.remote.commitEvolution({
        proposalId: proposal.proposalId,
        expectedCurrentVersionId: detail?.versionId ?? proposal.baseVersionId,
        draft: durableFrom(proposal.draft),
      })
      if (result.ok) committed = result.value
    } catch {
      // A thrown carrier failure renders as the commit error state.
    }
    // The user moved to another detail while the commit ran.
    if (this.state.getSnapshot().detailId !== id) stale = true
    if (stale) return
    if (committed !== undefined) {
      this.state.update((draft) => {
        draft.proposal = null
        draft.evolutionStatus = 'idle'
        draft.evolutionFailure = null
        draft.discussionId = null
      })
      // Re-open so the refreshed current version and history show up.
      this.open(id)
      return
    }
    this.state.update((draft) => {
      draft.evolutionStatus = 'reviewing'
      draft.evolutionFailure = 'commit'
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
   * detail and history so the appended `manual-edit` version shows up.
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
      // Re-open so the refreshed current version and history show up.
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
      draft.discussionId = null
      draft.proposal = null
      draft.evolutionStatus = 'idle'
      draft.evolutionFailure = null
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
    this.detailAbort?.abort()
    this.detailAbort = undefined
    this.evolutionAbort?.abort()
    this.evolutionAbort = undefined
    this.pendingEditId = null
  }
}
