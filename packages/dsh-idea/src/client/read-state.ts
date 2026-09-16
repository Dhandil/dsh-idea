/**
 * The Ideas settings section's browser state: the saved-Idea list, the open
 * detail, the detail's Continue Discussion action, and the evolution
 * proposal flow the discussion unlocks. The reads are read-only by
 * construction; the write paths (continueDiscussion, commitProposal) are
 * user-triggered, guard against duplicate clicks, and a commit failure keeps
 * the reviewed draft on screen for retry. Preparing a proposal writes
 * nothing durable. Every fact is fetched from the Host `idea` namespace on
 * demand, and disposing the surface aborts any in-flight read. No canonical
 * Idea data lives here beyond what a read returned.
 * @module @dsh-external/dsh-idea/client/read-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  IdeaCommitEvolutionResult,
  IdeaContinueDiscussionResult,
  IdeaDetail,
  IdeaEvolutionProposalPreview,
  IdeaSummary,
  IdeaVersionSummary,
} from '../remote-host/types.ts'
import { durableFrom, editableFrom } from './state.ts'
import type { EditableIdeaDraft } from './state.ts'
import type { IdeaDraft } from '../types.ts'

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
  prepareEvolution(
    request: { discussionId: string },
    signal?: AbortSignal,
  ): Promise<RemoteRead<IdeaEvolutionProposalPreview>>
  commitEvolution(request: {
    proposalId: string
    expectedCurrentVersionId: string
    draft: IdeaDraft
  }): Promise<RemoteRead<IdeaCommitEvolutionResult>>
}

/** The list lifecycle the section renders. */
export type IdeaReadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** The evolution proposal flow's lifecycle inside the detail view. */
export type IdeaEvolutionStatus = 'idle' | 'preparing' | 'reviewing' | 'committing' | 'error'

/** The open detail's pending evolution proposal: reference plus editable draft. */
export interface IdeaProposalState {
  proposalId: string
  baseVersionId: string
  draft: EditableIdeaDraft
}

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
  /** The discussion workspace this detail's evolution flow reads from. */
  discussionId: string | null
  /** The evolution proposal flow's lifecycle. */
  evolutionStatus: IdeaEvolutionStatus
  /** Which half failed last, when `evolutionStatus` is `error`; `stale` marks a superseded discussion base. */
  evolutionFailure: 'prepare' | 'stale' | 'commit' | null
  /** The proposal under review, present only while reviewing. */
  proposal: IdeaProposalState | null
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
  discussionId: null,
  evolutionStatus: 'idle',
  evolutionFailure: null,
  proposal: null,
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
  private evolutionAbort: AbortController | undefined

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
      draft.discussionId = null
      draft.evolutionStatus = 'idle'
      draft.evolutionFailure = null
      draft.proposal = null
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
      draft.discussionId = null
      draft.evolutionStatus = 'idle'
      draft.evolutionFailure = null
      draft.proposal = null
    })
  }

  /**
   * Continue the open idea as a new discussion. A click while one is in
   * flight is ignored — the button is the only entry, so duplicate clicks
   * collapse into one Host call (the Host additionally reuses the active
   * discussion for the same base version). On success the created
   * conversation is handed to the opener and the discussion workspace is
   * remembered as this detail's evolution source; a failed opener lands in
   * the same visible error state as a failed call — never a silent retry.
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
      const result = await this.remote.continueDiscussion({ id })
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

  /** Abort every in-flight read. */
  dispose(): void {
    this.listAbort?.abort()
    this.detailAbort?.abort()
    this.evolutionAbort?.abort()
    this.listAbort = undefined
    this.detailAbort = undefined
    this.evolutionAbort = undefined
    this.listInFlight = false
  }
}
