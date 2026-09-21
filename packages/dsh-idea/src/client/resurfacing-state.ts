/**
 * The per-Conversation resurfacing controller (§4): the plugin-owned runtime
 * that turns eligible completed-turn triggers into at most one lightweight
 * suggestion above the composer. The controller is ephemeral by design —
 * trigger identity, composer revision, the pending pool, and the
 * surfaced/referenced/dismissed ids all live here, never in the Idea
 * aggregate. The one-suggestion surface budget is the exception: it is the
 * Host's durable `resurfacing_budgets` record, never runtime state. The
 * controller loads that record before any evaluation may begin and fails
 * closed while the read is pending or failed; a completed turn arriving
 * during the read is retained as the minimum trigger state and evaluated
 * only once the budget is known free. Consumption happens after the Final
 * Delivery Gate through an atomic Host claim — CLAIMED publishes the
 * suggestion, ALREADY_CONSUMED and any claim failure stay silent, and the
 * UI never surfaces before the durable claim lands. Triggers come only from
 * the Session's incremental event feed (an appended durable `turn/end`
 * completed event); replays, prepended history, and live transient chunks
 * never trigger. Resurfacing is not context injection: until the user
 * explicitly chooses Reference nothing is written, attached, or sent —
 * and the triggering Assistant reply is never altered.
 * @module @dsh-external/dsh-idea/client/resurfacing-state
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ideaReferenceDescriptor, parseIdeaReferenceText } from '../reference/uri.ts'
import type { IdeaReferenceDescriptor } from '../reference/types.ts'
import { detectResurfacingOpportunity } from '../resurfacing/detector.ts'
import {
  RESURFACING_CONTEXT_TEXT_LIMIT,
  RESURFACING_FEATURE_ENABLED,
  RESURFACING_RECENT_CONTEXT_LIMIT,
  RESURFACING_REPLY_TEXT_LIMIT,
  RESURFACING_TURN_TEXT_LIMIT,
} from '../resurfacing/types.ts'
import type { ResurfacingSignal } from '../resurfacing/types.ts'
import type {
  IdeaResurfacingBudgetClaimResult,
  IdeaResurfacingBudgetReadResult,
  IdeaResurfacingCandidate,
  IdeaResurfacingEvaluateResult,
  IdeaResurfacingJudgeResult,
} from '../remote-host/types.ts'

/** The client's view of one Host resurfacing verdict. */
export interface ResurfaceSuggestion {
  ideaId: string
  evaluatedVersionId: string
  title: string
  core: string
  possibleValue: string
  useWhen: readonly string[]
  currentConclusion: string
  /** The canonical pinned reference descriptor, Host-owned. */
  reference: IdeaReferenceDescriptor
  /** The Judge's positive reason (observability only). */
  judgeReason: string
}

/** The strip's UI state: zero or one suggestion, plus the detail toggle. */
export interface ResurfaceUiState {
  suggestion: ResurfaceSuggestion | null
  detailOpen: boolean
  /** Why the last suggestion disappeared (observability only). */
  lastExpireReason: string | null
}

/** Minimal structural face of the Host remote the controller talks to. */
export interface ResurfacingRemoteFace {
  evaluateResurfacing(request: {
    sessionId: string
    currentTurn: string
    recentContext: readonly { role: 'user' | 'assistant'; text: string }[]
  }): Promise<
    | { ok: true; value: IdeaResurfacingEvaluateResult }
    | { ok: false; error: { code: string } }
  >
  judgeResurfacing(request: {
    sessionId: string
    currentTurn: string
    recentContext: readonly { role: 'user' | 'assistant'; text: string }[]
    assistantReply: string
    signals: readonly ResurfacingSignal[]
    candidates: readonly { ideaId: string; evaluatedVersionId: string }[]
  }, signal?: AbortSignal): Promise<
    | { ok: true; value: IdeaResurfacingJudgeResult }
    | { ok: false; error: { code: string } }
  >
  getResurfacingBudget(request: {
    sessionId: string
  }): Promise<
    | { ok: true; value: IdeaResurfacingBudgetReadResult }
    | { ok: false; error: { code: string } }
  >
  claimResurfacingBudget(request: {
    sessionId: string
  }): Promise<
    | { ok: true; value: IdeaResurfacingBudgetClaimResult }
    | { ok: false; error: { code: string } }
  >
}

/** Defensive structural view of one durable/live session event. */
interface ControllerEvent {
  readonly type: string
  readonly seq: number
  readonly data: {
    turn?: unknown
    reason?: { kind?: unknown }
    source?: { kind?: unknown }
    content?: unknown
    message?: { content?: unknown }
  }
}

type ControllerEntry = { type: 'event' | 'transient'; event: ControllerEvent }

/** Minimal structural face of the incremental event window feed. */
export interface ResurfacingEventWindowFace {
  getSnapshot(): {
    entries: readonly ControllerEntry[]
    change:
      | { kind: 'replace' | 'prepend' | 'append'; entries: readonly ControllerEntry[] }
      | { kind: 'settle-assistant' }
    revision: number
  }
  subscribe(fn: () => void): () => void
}

/** Minimal structural face of the composer state (draft revision + chips). */
export interface ResurfacingInputFace {
  getSnapshot(): {
    draftRev: number
    occurrences: readonly { source: string; ref: string }[]
  }
}

/** Minimal structural face of the Save Idea surface (explicit flow evidence). */
export interface ResurfacingSaveFace {
  getSnapshot(): {
    preparingMessageId: string | null
    modal: unknown
    submitting: boolean
  }
}

interface Trigger {
  turn: number
  turnEndSeq: number
  userSeq: number
  draftRev: number
}

interface PendingPool {
  trigger: Trigger
  signals: readonly ResurfacingSignal[]
  candidates: readonly IdeaResurfacingCandidate[]
}

const IDLE: ResurfaceUiState = {
  suggestion: null,
  detailOpen: false,
  lastExpireReason: null,
}

/** Text of one message's content blocks (bounded at the caller). */
function visibleTextOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (typeof block !== 'object' || block === null) return ''
      const record = block as { type?: unknown; text?: unknown }
      return record.type === 'text' && typeof record.text === 'string' ? record.text : ''
    })
    .join('\n')
}

interface TurnContext {
  userSeq: number
  currentTurn: string
  recentContext: { role: 'user' | 'assistant'; text: string }[]
  assistantReply: string
}

/**
 * The bounded visible context of one completed turn: the triggering user
 * message, its Assistant reply when already settled (empty while the reply
 * is still streaming), and up to six prior visible messages in
 * chronological order. Pure and defensive over the feed.
 */
export function extractTurnContext(
  entries: readonly ControllerEntry[],
  turnEndSeq: number,
): TurnContext | undefined {
  let turnEndIndex = -1
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry !== undefined && entry.type === 'event' && entry.event.seq === turnEndSeq) {
      turnEndIndex = index
      break
    }
  }
  if (turnEndIndex < 0) return undefined

  let userSeq = -1
  let currentTurn = ''
  let assistantReply = ''
  const older: { role: 'user' | 'assistant'; text: string }[] = []
  let remaining = RESURFACING_CONTEXT_TEXT_LIMIT

  for (let index = turnEndIndex - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry === undefined || entry.type !== 'event') continue
    const event = entry.event
    if (assistantReply.length === 0 && userSeq < 0 && event.type === 'assistant/message') {
      assistantReply = visibleTextOf(event.data.message?.content).slice(0, RESURFACING_REPLY_TEXT_LIMIT)
      continue
    }
    if (userSeq < 0 && event.type === 'user/message' && event.data.source?.kind === 'user') {
      userSeq = event.seq
      currentTurn = visibleTextOf(event.data.content).slice(0, RESURFACING_TURN_TEXT_LIMIT)
      continue
    }
    if (userSeq < 0) continue
    if (older.length >= RESURFACING_RECENT_CONTEXT_LIMIT || remaining <= 0) break
    if (event.type === 'user/message' && event.data.source?.kind === 'user') {
      const text = visibleTextOf(event.data.content).slice(0, remaining)
      if (text.length > 0) {
        older.push({ role: 'user', text })
        remaining -= text.length
      }
    } else if (event.type === 'assistant/message') {
      const text = visibleTextOf(event.data.message?.content).slice(0, remaining)
      if (text.length > 0) {
        older.push({ role: 'assistant', text })
        remaining -= text.length
      }
    }
  }

  if (userSeq < 0 || currentTurn.length === 0) return undefined
  // We walked backward, so `older` is newest-first; restore chronology.
  const recentContext = [...older].reverse()
  return { userSeq, currentTurn, recentContext, assistantReply }
}

/** Whether any human user message newer than `seq` exists in the window. */
function hasNewerUserMessage(entries: readonly ControllerEntry[], seq: number): boolean {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry === undefined || entry.type !== 'event') continue
    const event = entry.event
    if (event.seq <= seq) return false
    if (event.type === 'user/message' && event.data.source?.kind === 'user') return true
  }
  return false
}

/** Canonical idea ids currently attached in the composer (identity only). */
function ideaPinsOf(occurrences: readonly { source: string; ref: string }[]): Set<string> {
  const pins = new Set<string>()
  for (const occurrence of occurrences) {
    if (occurrence.source !== 'idea') continue
    try {
      for (const parsed of parseIdeaReferenceText(occurrence.ref)) {
        pins.add(parsed.pin.ideaId)
      }
    } catch {
      // A malformed chip still counts as explicit presence through its
      // source identity, but contributes no matchable pin.
    }
  }
  return pins
}

/**
 * One Conversation's resurfacing controller. One instance per open Session;
 * disposal unsubscribes the event feed and drops all ephemeral state.
 */
export class IdeaResurfacingController {
  /** Observable strip state; the dock component selects slices of it. */
  readonly state: SnapshotStore<ResurfaceUiState> = createSnapshotStore<ResurfaceUiState>({ ...IDLE })

  private readonly sessionId: string
  private readonly remote: ResurfacingRemoteFace
  private readonly events: ResurfacingEventWindowFace
  private readonly input: ResurfacingInputFace
  private readonly save: ResurfacingSaveFace
  private readonly appendReference: (descriptor: IdeaReferenceDescriptor) => boolean

  private epoch = 0
  private unsubscribe: (() => void) | undefined
  private lastHandledTurnEndSeq = -1
  private trigger: Trigger | undefined
  private pending: PendingPool | undefined
  private evaluating = false
  private judging = false
  private readonly abort = new AbortController()

  /** Ephemeral per-conversation identity sets (§15); the one-surface budget
   * is not among them — it is the Host's durable record. */
  private readonly surfacedIds = new Set<string>()
  private readonly referencedIds = new Set<string>()
  private readonly dismissedIds = new Set<string>()
  /**
   * The durable one-surface budget state, loaded from the Host before any
   * evaluation may begin. `loading` and `failed` block evaluation (fail
   * closed); `consumed` suppresses evaluation for this controller's whole
   * lifetime; `free` is normal T10 behavior. `free` never means "assume
   * absent": it is only ever set from a successful Host read, and the Host
   * claim re-gates every surface attempt.
   */
  private budgetState: 'loading' | 'free' | 'consumed' | 'failed' = 'loading'
  /** The latest completed turn admitted while the budget read was pending
   * (§9): retained as the minimum trigger state, evaluated only once the
   * budget resolves free; dropped on consumed/failed and on user-moved-on. */
  private retainedTurn: { turnEndSeq: number; turn: number } | undefined

  constructor(deps: {
    sessionId: string
    remote: ResurfacingRemoteFace
    events: ResurfacingEventWindowFace
    input: ResurfacingInputFace
    save: ResurfacingSaveFace
    appendReference: (descriptor: IdeaReferenceDescriptor) => boolean
  }) {
    this.sessionId = deps.sessionId
    this.remote = deps.remote
    this.events = deps.events
    this.input = deps.input
    this.save = deps.save
    this.appendReference = deps.appendReference
    this.unsubscribe = this.events.subscribe(() => { this.handleWindowChange() })
    void this.loadBudget(this.epoch)
  }

  /**
   * Load the conversation's durable budget fact before any evaluation may
   * begin (§6). Resolution is epoch-guarded: a disposed controller never
   * mutates state. The read is authoritative — a transport failure is
   * `failed` (never `free`), a consumed record disables resurfacing for
   * this controller's lifetime, and a free record releases any turn
   * retained while the read was pending.
   */
  private async loadBudget(epoch: number): Promise<void> {
    let result: Awaited<ReturnType<ResurfacingRemoteFace['getResurfacingBudget']>> | undefined
    try {
      result = await this.remote.getResurfacingBudget({ sessionId: this.sessionId })
    } catch {
      result = undefined
    }
    if (epoch !== this.epoch) return
    if (result === undefined || !result.ok) {
      // Fail closed: an unknown budget is never a fresh budget.
      this.budgetState = 'failed'
      this.retainedTurn = undefined
      return
    }
    if (result.value.consumed) {
      this.budgetState = 'consumed'
      this.retainedTurn = undefined
      return
    }
    this.budgetState = 'free'
    const retained = this.retainedTurn
    this.retainedTurn = undefined
    if (retained !== undefined) {
      void this.beginEvaluation(retained.turnEndSeq, retained.turn)
    }
  }

  /** Unsubscribe the feed and drop all ephemeral state; the strip empties. */
  dispose(): void {
    this.epoch += 1
    this.abort.abort()
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.trigger = undefined
    this.pending = undefined
    this.retainedTurn = undefined
    this.evaluating = false
    this.judging = false
    this.state.update((draft) => {
      draft.suggestion = null
      draft.detailOpen = false
    })
  }

  /** Toggle the read-only detail expansion; never attaches or mutates. */
  toggleDetail(): void {
    this.state.update((draft) => {
      draft.detailOpen = !draft.detailOpen
    })
  }

  /**
   * Reference through the accepted T9 attach path. Only a successful append
   * marks REFERENCED and closes the strip; a failed admission keeps the
   * strip open (the composer notice is the seam's own) and never fakes a
   * close.
   */
  reference(): void {
    const suggestion = this.state.getSnapshot().suggestion
    if (suggestion === null) return
    if (this.appendReference(suggestion.reference)) {
      this.referencedIds.add(suggestion.ideaId)
      this.state.update((draft) => {
        draft.suggestion = null
        draft.detailOpen = false
        draft.lastExpireReason = 'REFERENCED'
      })
    }
  }

  /** Dismiss this opportunity in this conversation; the Idea is untouched. */
  dismiss(): void {
    const suggestion = this.state.getSnapshot().suggestion
    if (suggestion === null) return
    this.dismissedIds.add(suggestion.ideaId)
    this.state.update((draft) => {
      draft.suggestion = null
      draft.detailOpen = false
      draft.lastExpireReason = 'DISMISSED'
    })
  }

  private handleWindowChange(): void {
    if (this.unsubscribe === undefined) return
    const window = this.events.getSnapshot()
    const change = window.change
    if (change.kind === 'replace' || change.kind === 'prepend') {
      // Replayed history and backfilled pages are never opportunities.
      return
    }
    if (change.kind === 'settle-assistant') {
      this.tryProceedToJudge()
      return
    }
    for (const entry of change.entries) {
      if (entry.type !== 'event') continue
      const event = entry.event
      if (event.type === 'user/message' && event.data.source?.kind === 'user') {
        this.onUserMovedOn(event.seq)
        continue
      }
      if (
        event.type === 'turn/end'
        && event.data.reason?.kind === 'completed'
        && typeof event.data.turn === 'number'
      ) {
        this.onCompletedTurn(event.seq, event.data.turn)
      }
    }
  }

  /**
   * A new user message: a visible suggestion expires (USER_CONTINUED, the
   * budget stays consumed); a trigger or pending pool from an older turn is
   * invalidated (TRIGGER_TURN_NO_LONGER_CURRENT).
   */
  private onUserMovedOn(userSeq: number): void {
    if (this.budgetState === 'loading') {
      // Any user message appended after the retained turn/end is a newer
      // turn: existing T10 semantics invalidate the trigger immediately,
      // even before the budget read resolves.
      this.retainedTurn = undefined
      return
    }
    const snapshot = this.state.getSnapshot()
    if (snapshot.suggestion !== null) {
      // §13.4: the user continued; the budget stays consumed either way.
      this.state.update((draft) => {
        draft.suggestion = null
        draft.detailOpen = false
        draft.lastExpireReason = 'USER_CONTINUED'
      })
      return
    }
    const anchorSeq = this.pending?.trigger.userSeq ?? this.trigger?.userSeq
    if (anchorSeq !== undefined && userSeq > anchorSeq) {
      this.trigger = undefined
      this.pending = undefined
      this.state.update((draft) => {
        draft.lastExpireReason = 'TRIGGER_TURN_NO_LONGER_CURRENT'
      })
    }
  }

  private onCompletedTurn(turnEndSeq: number, turn: number): void {
    if (turnEndSeq <= this.lastHandledTurnEndSeq) return
    this.lastHandledTurnEndSeq = turnEndSeq
    if (this.budgetState === 'loading') {
      // §9: retain only the minimum trigger state; the durable read gates
      // any evaluation, so nothing runs until the budget is known.
      this.retainedTurn = { turnEndSeq, turn }
      return
    }
    void this.beginEvaluation(turnEndSeq, turn)
  }

  /** The deterministic gate → detector → evaluate pipeline (§5–§8). */
  private async beginEvaluation(turnEndSeq: number, turn: number): Promise<void> {
    const epoch = this.epoch
    if (!RESURFACING_FEATURE_ENABLED) return
    if (this.state.getSnapshot().suggestion !== null) return
    if (this.budgetState !== 'free') return
    if (this.evaluating || this.judging) return
    if (this.trigger !== undefined || this.pending !== undefined) return

    // CURRENT_TURN_IDEA_ACTIVE: explicit Idea chips in the composer, or an
    // explicitly running Save Idea flow, mean the turn already operates on
    // Ideas — no proactive reminder on top (§5).
    const input = this.input.getSnapshot()
    if (input.occurrences.some(occurrence => occurrence.source === 'idea')) return
    const save = this.save.getSnapshot()
    if (save.modal !== null || save.preparingMessageId !== null || save.submitting) return

    const context = extractTurnContext(this.events.getSnapshot().entries, turnEndSeq)
    if (context === undefined) return

    const detection = detectResurfacingOpportunity({
      currentTurn: context.currentTurn,
      recentContext: context.recentContext,
    })
    if (!detection.admitted) return

    this.trigger = {
      turn,
      turnEndSeq,
      userSeq: context.userSeq,
      draftRev: input.draftRev,
    }
    this.evaluating = true
    const signals = detection.signals

    let result: Awaited<ReturnType<ResurfacingRemoteFace['evaluateResurfacing']>> | undefined
    try {
      result = await this.remote.evaluateResurfacing({
        sessionId: this.sessionId,
        currentTurn: context.currentTurn.slice(0, RESURFACING_TURN_TEXT_LIMIT),
        recentContext: context.recentContext,
      })
    } catch {
      result = undefined
    }
    const stale = epoch !== this.epoch
      || this.trigger === undefined
      || this.trigger.turnEndSeq !== turnEndSeq
    this.evaluating = false
    if (stale) return
    if (result === undefined || !result.ok) {
      this.trigger = undefined
      return
    }
    if (result.value.stop !== undefined || result.value.candidates.length === 0) {
      this.trigger = undefined
      return
    }

    // Client-side deterministic runtime suppression (§8): canonical identity
    // only — composer chips, and this conversation's referenced / surfaced /
    // dismissed sets.
    const pins = ideaPinsOf(this.input.getSnapshot().occurrences)
    const candidates = result.value.candidates
      .filter(candidate => !pins.has(candidate.ideaId))
      .filter(candidate => !this.referencedIds.has(candidate.ideaId))
      .filter(candidate => !this.surfacedIds.has(candidate.ideaId))
      .filter(candidate => !this.dismissedIds.has(candidate.ideaId))
      .slice(0, 3)
    if (candidates.length === 0) {
      this.trigger = undefined
      return
    }
    this.pending = { trigger: this.trigger, signals, candidates }
    this.tryProceedToJudge()
  }

  /**
   * Settlement → Revalidation → Judge → Final Delivery Gate (§9–§12).
   * Called on every feed change while an evaluation is pending; runs only
   * once the triggering Assistant reply is settled.
   */
  private tryProceedToJudge(): void {
    const pending = this.pending
    if (pending === undefined || this.judging) return
    const epoch = this.epoch

    // Revalidation (§10): the trigger turn is still current — no newer user
    // message, no composer edit since the trigger.
    if (hasNewerUserMessage(this.events.getSnapshot().entries, pending.trigger.userSeq)) {
      this.expire('TRIGGER_TURN_NO_LONGER_CURRENT')
      return
    }
    if (this.input.getSnapshot().draftRev !== pending.trigger.draftRev) {
      this.expire('COMPOSER_CHANGED_SINCE_TRIGGER')
      return
    }
    const context = extractTurnContext(this.events.getSnapshot().entries, pending.trigger.turnEndSeq)
    if (context === undefined || context.assistantReply.length === 0) {
      // The triggering reply is not settled yet; wait for the next change.
      return
    }

    this.judging = true
    void this.runJudge(pending, context, epoch)
  }

  private async runJudge(pending: PendingPool, context: TurnContext, epoch: number): Promise<void> {
    let result: Awaited<ReturnType<ResurfacingRemoteFace['judgeResurfacing']>> | undefined
    try {
      result = await this.remote.judgeResurfacing({
        sessionId: this.sessionId,
        currentTurn: context.currentTurn.slice(0, RESURFACING_TURN_TEXT_LIMIT),
        recentContext: context.recentContext,
        assistantReply: context.assistantReply,
        signals: pending.signals,
        candidates: pending.candidates.map(candidate => ({
          ideaId: candidate.ideaId,
          evaluatedVersionId: candidate.evaluatedVersionId,
        })),
      }, this.abort.signal)
    } catch {
      result = undefined
    }
    if (epoch !== this.epoch) return
    this.judging = false
    this.trigger = undefined
    this.pending = undefined

    const judgment = result !== undefined && result.ok ? result.value : undefined
    if (
      judgment === undefined
      || judgment.outcome !== 'surface'
      || judgment.ideaId === undefined
      || judgment.reason === undefined
    ) {
      // Fail closed: any negative verdict, absence, or error is silence.
      return
    }

    // Final Delivery Gate (§12): every stale/race check runs again; a
    // correct-but-late suggestion is invalid.
    if (hasNewerUserMessage(this.events.getSnapshot().entries, pending.trigger.userSeq)) return
    if (this.input.getSnapshot().draftRev !== pending.trigger.draftRev) return
    if (this.state.getSnapshot().suggestion !== null) return
    if (this.budgetState !== 'free') return
    if (
      this.referencedIds.has(judgment.ideaId)
      || this.dismissedIds.has(judgment.ideaId)
      || this.surfacedIds.has(judgment.ideaId)
    ) {
      return
    }
    const evaluated = pending.candidates.find(candidate => candidate.ideaId === judgment.ideaId)
    if (evaluated === undefined) return

    // Durable claim before any UI surface: the gate has passed, so the
    // budget is consumed on the Host first. The judging flag stays held (no
    // await crossed since it was cleared) so no new evaluation can begin
    // inside the claim window.
    this.judging = true
    let claim: Awaited<ReturnType<ResurfacingRemoteFace['claimResurfacingBudget']>> | undefined
    try {
      // Deliberately not abortable: a short Host call whose abort would not
      // un-consume a budget the Host may already have committed.
      claim = await this.remote.claimResurfacingBudget({ sessionId: this.sessionId })
    } catch {
      claim = undefined
    }
    this.judging = false
    if (epoch !== this.epoch) return
    if (claim === undefined || !claim.ok) {
      // Ambiguous failure: silence now, no immediate retry. The budget
      // state is deliberately left unchanged — the Host's durable record
      // re-gates any future opportunity, so no duplicate surface is
      // possible, and a later recreation discovers the durable fact if the
      // claim landed.
      return
    }
    // The durable fact is decided either way; local suppression is for life.
    this.budgetState = 'consumed'
    if (claim.value.outcome !== 'CLAIMED') {
      // ALREADY_CONSUMED: another client won the budget; silence.
      return
    }

    // Re-check the cheap gate conditions across the claim await. A
    // correct-but-late suggestion is invalid even though the budget is now
    // durably consumed — claim-without-surface is the allowed safe loss,
    // never surface-without-claim.
    if (this.state.getSnapshot().suggestion !== null) return
    if (hasNewerUserMessage(this.events.getSnapshot().entries, pending.trigger.userSeq)) return
    if (this.input.getSnapshot().draftRev !== pending.trigger.draftRev) return
    if (
      this.referencedIds.has(judgment.ideaId)
      || this.dismissedIds.has(judgment.ideaId)
      || this.surfacedIds.has(judgment.ideaId)
    ) {
      return
    }

    const suggestion: ResurfaceSuggestion = {
      ideaId: evaluated.ideaId,
      evaluatedVersionId: evaluated.evaluatedVersionId,
      title: evaluated.title,
      core: evaluated.core,
      possibleValue: evaluated.possibleValue,
      useWhen: evaluated.useWhen,
      currentConclusion: evaluated.currentConclusion,
      reference: ideaReferenceDescriptor(evaluated.ideaId, evaluated.evaluatedVersionId, evaluated.title),
      judgeReason: judgment.reason,
    }
    this.surfacedIds.add(suggestion.ideaId)
    this.state.update((draft) => {
      draft.suggestion = suggestion
      draft.lastExpireReason = null
    })
  }

  private expire(reason: string): void {
    this.trigger = undefined
    this.pending = undefined
    this.state.update((draft) => {
      draft.lastExpireReason = reason
    })
  }
}
