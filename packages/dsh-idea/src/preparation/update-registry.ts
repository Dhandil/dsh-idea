/** Bounded in-memory preparation flights, update tickets and commit receipts. */
import { randomUUID } from 'node:crypto'
import { checkCancelled } from './pipeline.ts'
import { IdeaUpdateError } from './update-types.ts'
import type { IdeaPrepareUpdateRequest, IdeaUpdateId, IdeaUpdatePreview, IdeaUpdateResult, PreparedUpdate } from './update-types.ts'

export const IDEA_UPDATE_LIMITS = { capacity: 64, ttlMs: 30 * 60 * 1000 } as const
export interface IdeaUpdateRegistryOptions { capacity?: number; ttlMs?: number; now?: () => number }
type State = 'preparing' | 'prepared' | 'failed' | 'committing' | 'committed' | 'rejected' | 'uncertain'
interface Slot {
  fingerprint: string
  createdAt: number
  state: State
  prepare: Promise<IdeaUpdatePreview>
  id?: IdeaUpdateId
  prepared?: PreparedUpdate
  payload?: string
  commit?: Promise<IdeaUpdateResult>
}

/** A joining caller can stop waiting without canceling another caller's flight. */
async function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkCancelled(signal)
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    const abort = () => { try { checkCancelled(signal) } catch (error) { reject(error) } }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export class IdeaUpdateRegistry {
  private readonly requests = new Map<string, Slot>()
  private readonly tickets = new Map<IdeaUpdateId, Slot>()
  private readonly capacity: number
  private readonly ttlMs: number
  private readonly now: () => number
  private disposed = false

  constructor(options: IdeaUpdateRegistryOptions = {}) {
    this.capacity = options.capacity ?? IDEA_UPDATE_LIMITS.capacity
    this.ttlMs = options.ttlMs ?? IDEA_UPDATE_LIMITS.ttlMs
    this.now = options.now ?? Date.now
    if (!Number.isSafeInteger(this.capacity) || this.capacity < 1 || !Number.isFinite(this.ttlMs) || this.ttlMs <= 0) {
      throw Error('invalid update registry limits')
    }
  }

  prepare(request: IdeaPrepareUpdateRequest, work: () => Promise<PreparedUpdate>, signal?: AbortSignal): Promise<IdeaUpdatePreview> {
    this.assertOpen(); checkCancelled(signal); this.sweep()
    const fingerprint = JSON.stringify([request.sessionId, request.messageId, request.ideaId, request.expectedCurrentVersionId])
    const existing = this.requests.get(request.requestKey)
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new IdeaUpdateError('update-request-conflict', 'the update request key has a different binding')
      return waitFor(existing.prepare, signal).then(value => structuredClone(value))
    }
    this.reserve()
    const slot: Slot = {
      fingerprint, createdAt: this.now(), state: 'preparing',
      prepare: Promise.resolve().then(async () => {
        this.assertOpen(); checkCancelled(signal)
        const prepared = await work()
        this.assertOpen(); checkCancelled(signal)
        if (this.now() - slot.createdAt >= this.ttlMs) throw this.expired()
        slot.prepared = structuredClone(prepared)
        slot.id = `upd_${randomUUID()}` as IdeaUpdateId
        slot.state = 'prepared'
        this.tickets.set(slot.id, slot)
        return { updateId: slot.id, targetSummary: structuredClone(prepared.target), draft: structuredClone(prepared.draft), sourceStats: structuredClone(prepared.sourceStats) }
      }).catch((error: unknown) => { slot.state = 'failed'; throw error }),
    }
    this.requests.set(request.requestKey, slot)
    return waitFor(slot.prepare, signal).then(value => structuredClone(value))
  }

  commit(
    id: IdeaUpdateId, payload: string,
    work: (prepared: PreparedUpdate) => Promise<IdeaUpdateResult>,
    knownNotWritten: (error: unknown) => boolean,
  ): Promise<IdeaUpdateResult> {
    this.assertOpen(); this.sweep()
    const slot = this.tickets.get(id)
    if (!slot?.prepared) throw this.expired()
    if (slot.payload !== undefined && slot.payload !== payload) throw new IdeaUpdateError('update-payload-conflict', 'the update ticket is bound to a different approved draft')
    if (slot.state === 'uncertain') throw new IdeaUpdateError('update-result-uncertain', 'the update result must be checked before any further write')
    if (slot.state === 'committing' || slot.state === 'committed') return slot.commit!.then(value => structuredClone(value))
    slot.payload = payload
    slot.state = 'committing'
    const prepared = structuredClone(slot.prepared)
    slot.commit = Promise.resolve().then(() => work(prepared)).then(result => {
      slot.state = 'committed'
      return structuredClone(result)
    }).catch((error: unknown) => {
      if (knownNotWritten(error)) { slot.state = 'rejected'; throw error }
      slot.state = 'uncertain'
      throw new IdeaUpdateError('update-result-uncertain', 'the update result is unconfirmed; do not submit a fresh write', { cause: error })
    })
    return slot.commit.then(value => structuredClone(value))
  }

  dispose(): void { this.disposed = true; this.requests.clear(); this.tickets.clear() }
  private assertOpen(): void { if (this.disposed) throw this.expired() }
  private expired(): IdeaUpdateError { return new IdeaUpdateError('update-not-found', 'the update ticket is unknown, expired or no longer available') }
  private active(slot: Slot): boolean { return slot.state === 'preparing' || slot.state === 'committing' }
  private drop(key: string, slot: Slot): void { this.requests.delete(key); if (slot.id) this.tickets.delete(slot.id) }
  private sweep(): void {
    for (const [key, slot] of this.requests) if (!this.active(slot) && this.now() - slot.createdAt >= this.ttlMs) this.drop(key, slot)
  }
  private reserve(): void {
    if (this.requests.size < this.capacity) return
    for (const [key, slot] of this.requests) {
      if (!this.active(slot)) { this.drop(key, slot); return }
    }
    throw new IdeaUpdateError('update-capacity', 'all update slots are currently active')
  }
}
