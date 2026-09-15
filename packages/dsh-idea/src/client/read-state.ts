/**
 * The Ideas settings section's browser state: the saved-Idea list, the open
 * detail, and the detail's Continue Discussion action. The reads are
 * read-only by construction; the one write path (continueDiscussion) is
 * user-triggered from the detail view, guards against duplicate clicks, and
 * hands the returned conversation to the injected opener on success.
 * Every fact is fetched from the Host `idea` namespace on demand, and
 * disposing the surface aborts any in-flight read. No canonical Idea data
 * lives here beyond what a read returned.
 * @module @dsh-external/dsh-idea/client/read-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { IdeaContinueDiscussionResult, IdeaDetail, IdeaSummary, IdeaVersionSummary } from '../remote-host/types.ts'

/** The wire outcome of one read call. */
type RemoteRead<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string } }

/** The read face of the Host idea namespace the section talks to. */
export interface IdeaReadFace {
  list(): Promise<RemoteRead<IdeaSummary[]>>
  get(request: { id: string }): Promise<RemoteRead<IdeaDetail>>
  getVersions(request: { id: string }): Promise<RemoteRead<IdeaVersionSummary[]>>
  continueDiscussion(request: { id: string }): Promise<RemoteRead<IdeaContinueDiscussionResult>>
}

/** The list lifecycle the section renders. */
export type IdeaReadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** The section snapshot. */
export interface IdeaReadState {
  status: IdeaReadStatus
  /** The saved ideas, most recently updated first (Host order). */
  items: readonly IdeaSummary[]
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
}

const INITIAL: IdeaReadState = {
  status: 'idle',
  items: [],
  detailId: null,
  detailStatus: 'loading',
  detail: null,
  detailErrorCode: null,
  detailVersionsStatus: 'loading',
  detailVersions: [],
  continueStatus: 'idle',
}

/**
 * The Ideas section's controller: one lazy whole-list load, one detail read
 * at a time (opening a new detail aborts the previous), at most one
 * continuation click in flight, and a dispose that aborts everything in
 * flight.
 */
export class IdeaReadSurface {
  /** Observable section state; the section component selects slices of it. */
  readonly state: SnapshotStore<IdeaReadState> = createSnapshotStore<IdeaReadState>({ ...INITIAL })

  private listAbort: AbortController | undefined
  private listInFlight = false
  private detailAbort: AbortController | undefined

  constructor(
    private readonly remote: IdeaReadFace,
    /** Hands a created continuation conversation to the client session domain. */
    private readonly openConversation: (conversationId: string) => void | Promise<void> = () => {},
  ) {}

  /** Load the list once; repeats while ready or already loading are no-ops. */
  load(): void {
    const { status } = this.state.getSnapshot()
    if (this.listInFlight || status === 'ready') return
    this.listInFlight = true
    const controller = new AbortController()
    this.listAbort = controller
    this.state.update((draft) => { draft.status = 'loading' })
    void this.runLoad(controller)
  }

  private async runLoad(controller: AbortController): Promise<void> {
    let items: readonly IdeaSummary[] | undefined
    try {
      const result = await this.remote.list()
      if (!controller.signal.aborted && result.ok) items = result.value
    } catch {
      // A thrown carrier failure renders as the list error state.
    } finally {
      this.listInFlight = false
      this.listAbort = undefined
    }
    if (controller.signal.aborted) return
    if (items === undefined) {
      this.state.update((draft) => { draft.status = 'error' })
      return
    }
    this.state.update((draft) => {
      draft.status = 'ready'
      draft.items = items
    })
  }

  /** Open one idea's detail and its version history; any prior read is abandoned. */
  open(id: string): void {
    this.detailAbort?.abort()
    const controller = new AbortController()
    this.detailAbort = controller
    this.state.update((draft) => {
      draft.detailId = id
      draft.detailStatus = 'loading'
      draft.detail = null
      draft.detailErrorCode = null
      draft.detailVersionsStatus = 'loading'
      draft.detailVersions = []
      draft.continueStatus = 'idle'
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
      } else {
        draft.detailStatus = 'error'
        draft.detailErrorCode = errorCode ?? null
      }
    })
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

  /** Close the detail and return to the list. */
  closeDetail(): void {
    this.detailAbort?.abort()
    this.detailAbort = undefined
    this.state.update((draft) => {
      draft.detailId = null
      draft.detailStatus = 'loading'
      draft.detail = null
      draft.detailErrorCode = null
      draft.detailVersionsStatus = 'loading'
      draft.detailVersions = []
      draft.continueStatus = 'idle'
    })
  }

  /**
   * Continue the open idea as a new discussion. A click while one is in
   * flight is ignored — the button is the only entry, so duplicate clicks
   * collapse into one Host call (the Host additionally reuses the active
   * discussion for the same base version). On success the created
   * conversation is handed to the opener; a failed opener lands in the same
   * visible error state as a failed call — never a silent retry.
   */
  continueDiscussion(id: string): void {
    if (this.state.getSnapshot().continueStatus === 'loading') return
    this.state.update((draft) => { draft.continueStatus = 'loading' })
    void this.runContinue(id)
  }

  private async runContinue(id: string): Promise<void> {
    let conversationId: string | undefined
    try {
      const result = await this.remote.continueDiscussion({ id })
      if (result.ok) conversationId = result.value.conversationId
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
    })
  }

  /** Abort every in-flight read. */
  dispose(): void {
    this.listAbort?.abort()
    this.detailAbort?.abort()
    this.listAbort = undefined
    this.detailAbort = undefined
    this.listInFlight = false
  }
}
