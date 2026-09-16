/**
 * Per-Session interaction state for the Related Ideas surface, deliberately
 * separate from the Save Idea lifecycle: one explicit query per click, one
 * result overlay, zero persistence. A duplicate click while pending is
 * folded, disposing the surface aborts the in-flight request, and a stale
 * completion from an older request never overwrites newer state. The Host
 * owns every canonical Idea datum; this layer renders only what the wire
 * carried.
 * @module @dsh-external/dsh-idea/client/related-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { IdeaRelatedMatch, IdeaRelatedResult } from '../remote-host/types.ts'

/** The Related Ideas overlay's lifecycle. */
export type RelatedIdeasStatus = 'idle' | 'loading' | 'ready' | 'error'

/** The full interaction state of one Session's Related Ideas surface. */
export interface RelatedIdeasUiState {
  /** The message whose query is in flight, if any. */
  loadingMessageId: MessageId | null
  /** The message the shown results were judged from. */
  anchorMessageId: MessageId | null
  /** The canonical matches of the last completed query. */
  items: readonly IdeaRelatedMatch[]
  status: RelatedIdeasStatus
  /** The wire error code of the last failure, if any. */
  errorCode: string | null
}

const CLOSED: RelatedIdeasUiState = {
  loadingMessageId: null,
  anchorMessageId: null,
  items: [],
  status: 'idle',
  errorCode: null,
}

/** Minimal structural face of the Host the surface talks to. */
export interface IdeaRelatedFace {
  relatedFromMessage(
    request: { sessionId: string; messageId: string },
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: IdeaRelatedResult }
    | { ok: false; error: { code: string } }
  >
}

/**
 * One Session's Related Ideas surface: the explicit query lifecycle behind
 * the `idea-related` assistant action and its overlay. Queries are read-only
 * — nothing here persists or mutates the conversation.
 */
export class RelatedIdeasSurface {
  /** Observable interaction state; slot components select slices of it. */
  readonly state: SnapshotStore<RelatedIdeasUiState> = createSnapshotStore<RelatedIdeasUiState>({ ...CLOSED })

  private abort: AbortController | undefined
  private inFlight = false
  /** Bumped on every reset so a stale completion cannot write state. */
  private epoch = 0

  constructor(
    private readonly remote: IdeaRelatedFace,
    private readonly sessionId: string,
  ) {}

  /** Start the one query for a message; repeats while pending are no-ops. */
  findRelated(messageId: MessageId): void {
    if (this.inFlight) return
    this.inFlight = true
    const epoch = this.epoch
    const controller = new AbortController()
    this.abort = controller
    this.state.update((draft) => {
      draft.status = 'loading'
      draft.loadingMessageId = messageId
      draft.anchorMessageId = messageId
      draft.items = []
      draft.errorCode = null
    })
    void this.runFind(messageId, controller, epoch)
  }

  private async runFind(messageId: MessageId, controller: AbortController, epoch: number): Promise<void> {
    let result: Awaited<ReturnType<IdeaRelatedFace['relatedFromMessage']>> | undefined
    try {
      result = await this.remote.relatedFromMessage(
        { sessionId: this.sessionId, messageId },
        controller.signal,
      )
    } catch {
      // A thrown carrier error is a failed query, not a crash.
      result = undefined
    }
    // Cancellation or a surface reset underneath: never write state.
    if (epoch !== this.epoch) return
    if (controller.signal.aborted) return

    this.inFlight = false
    this.abort = undefined
    const items = result !== undefined && result.ok ? result.value.items : []
    if (result !== undefined && result.ok) {
      this.state.update((draft) => {
        draft.status = 'ready'
        draft.loadingMessageId = null
        draft.items = items
      })
      return
    }
    this.state.update((draft) => {
      draft.status = 'error'
      draft.loadingMessageId = null
      draft.errorCode = result !== undefined && !result.ok ? result.error.code : 'idea/model-failed'
    })
  }

  /** Close the overlay, aborting any in-flight query, and reset state. */
  close(): void {
    this.reset()
  }

  /** Abort any in-flight query and reset to the closed state. */
  dispose(): void {
    this.reset()
  }

  private reset(): void {
    this.epoch += 1
    this.inFlight = false
    this.abort?.abort()
    this.abort = undefined
    this.state.update((draft) => {
      draft.status = 'idle'
      draft.loadingMessageId = null
      draft.anchorMessageId = null
      draft.items = []
      draft.errorCode = null
    })
  }
}
