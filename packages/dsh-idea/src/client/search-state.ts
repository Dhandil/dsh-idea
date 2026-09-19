/**
 * Per-Session interaction state for the conversation Idea search card: one
 * open card, one query text, at most one in-flight search, and one selected
 * row. A blank query lists the current library by recency; every non-blank
 * query is one explicit Host search ranked Host-side. Stale completions from
 * an older query never overwrite newer state, disposing the surface aborts
 * the in-flight request, and closing resets everything with zero side
 * effects — the draft, the conversation, and the model are untouched.
 * @module @dsh-external/dsh-idea/client/search-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { IdeaReferenceDescriptor, IdeaSearchResult } from '../remote-host/types.ts'

/** The search card's query lifecycle. */
export type IdeaSearchStatus = 'loading' | 'ready' | 'error'

/** The full interaction state of one Session's search card. */
export interface IdeaSearchUiState {
  /** Whether the card is open. */
  open: boolean
  /** The query text as typed; blank means the recency list. */
  query: string
  /** The lifecycle of the latest query. */
  status: IdeaSearchStatus
  /** The rows of the latest completed query, Host-ranked. */
  items: readonly IdeaSearchResult[]
  /** The single selected row's idea id, if any. */
  selectedId: string | null
  /** The wire error code of the last failure, if any. */
  errorCode: string | null
}

const CLOSED: IdeaSearchUiState = {
  open: false,
  query: '',
  status: 'loading',
  items: [],
  selectedId: null,
  errorCode: null,
}

/** Minimal structural face of the Host the surface talks to. */
export interface IdeaSearchFace {
  search(
    request: { query: string; scope: 'current' | 'all' },
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: readonly IdeaSearchResult[] }
    | { ok: false; error: { code: string } }
  >
}

/** The selected row's canonical reference descriptor, if any. */
export function selectedReference(state: IdeaSearchUiState): IdeaReferenceDescriptor | null {
  if (state.selectedId === null) return null
  return state.items.find(item => item.id === state.selectedId)?.reference ?? null
}

/**
 * One Session's Idea search card surface. Read-only: searches never write
 * durable state, and attaching a reference happens outside this class.
 */
export class IdeaSearchSurface {
  /** Observable interaction state; slot components select slices of it. */
  readonly state: SnapshotStore<IdeaSearchUiState> = createSnapshotStore<IdeaSearchUiState>({ ...CLOSED })

  private abort: AbortController | undefined
  /** Bumped on every reset so a stale completion cannot write state. */
  private epoch = 0

  constructor(private readonly remote: IdeaSearchFace) {}

  /** Open the card on the blank-query recency list; repeats are no-ops. */
  open(): void {
    if (this.state.getSnapshot().open) return
    this.state.update((draft) => {
      draft.open = true
      draft.query = ''
      draft.status = 'loading'
      draft.items = []
      draft.selectedId = null
      draft.errorCode = null
    })
    this.runSearch('')
  }

  /** Run one search for the query; a newer query supersedes an older one. */
  setQuery(query: string): void {
    this.state.update((draft) => {
      draft.query = query
      draft.status = 'loading'
      draft.selectedId = null
      draft.errorCode = null
    })
    this.runSearch(query)
  }

  /** Re-run the current query after a failure. */
  retry(): void {
    this.runSearch(this.state.getSnapshot().query)
  }

  /** Select exactly one row; clicking the selected row keeps it selected. */
  select(id: string): void {
    this.state.update((draft) => {
      draft.selectedId = id
    })
  }

  /** Close the card, aborting any in-flight search, with zero side effects. */
  close(): void {
    this.reset()
  }

  /** Abort any in-flight search and reset to the closed state. */
  dispose(): void {
    this.reset()
  }

  private runSearch(query: string): void {
    const epoch = this.epoch
    const controller = new AbortController()
    this.abort?.abort()
    this.abort = controller
    void this.runSearchAsync(query, controller, epoch)
  }

  private async runSearchAsync(query: string, controller: AbortController, epoch: number): Promise<void> {
    let result: Awaited<ReturnType<IdeaSearchFace['search']>> | undefined
    try {
      result = await this.remote.search(
        { query, scope: 'current' },
        controller.signal,
      )
    } catch {
      // A thrown carrier error is a failed search, not a crash.
      result = undefined
    }
    // Superseded, closed, or disposed underneath: never write state.
    if (epoch !== this.epoch) return
    if (controller.signal.aborted) return

    this.abort = undefined
    // The card may have been closed and reopened while this query ran; only
    // the latest query's completion may land, and only on an open card.
    const snapshot = this.state.getSnapshot()
    if (!snapshot.open || snapshot.query !== query) return

    if (result !== undefined && result.ok) {
      this.state.update((draft) => {
        draft.status = 'ready'
        draft.items = result.ok ? result.value : []
      })
      return
    }
    this.state.update((draft) => {
      draft.status = 'error'
      draft.errorCode = result !== undefined && !result.ok ? result.error.code : 'idea/search-failed'
    })
  }

  private reset(): void {
    this.epoch += 1
    this.abort?.abort()
    this.abort = undefined
    this.state.update((draft) => {
      draft.open = false
      draft.query = ''
      draft.status = 'loading'
      draft.items = []
      draft.selectedId = null
      draft.errorCode = null
    })
  }
}
