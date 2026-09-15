/**
 * The ephemeral, Host-owned preparation registry. A successful preparation
 * stores the canonical captured source snapshot behind one opaque id so a
 * later commit can trust Host provenance instead of a browser echo. Entries
 * live in memory only — never `storageDomain` — under a bounded capacity and
 * a finite TTL with lazy expiry/eviction (no background timer); a restart
 * losing pending previews is acceptable by design.
 * @module @dsh-external/dsh-idea/src/preparation/registry
 */

import { randomUUID } from 'node:crypto'
import { IdeaPreparationError } from './errors.ts'
import { IdeaPreparationId } from './types.ts'
import type { PreparedIdeaSource } from './types.ts'

/** Default V1 registry policy. */
export const IDEA_PREPARATION_LIMITS = {
  /** Most simultaneously held preparations; the oldest is evicted beyond this. */
  capacity: 64,
  /** How long a preparation stays resolvable. */
  ttlMs: 30 * 60 * 1000,
} as const

export interface IdeaPreparationRegistryOptions {
  capacity?: number
  ttlMs?: number
  /** Injectable monotonic clock for deterministic tests. */
  now?: () => number
}

interface RegistryEntry {
  id: IdeaPreparationId
  stored: PreparedIdeaSource
}

export class IdeaPreparationRegistry {
  private readonly capacity: number
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly entries = new Map<IdeaPreparationId, RegistryEntry>()

  constructor(options: IdeaPreparationRegistryOptions = {}) {
    this.capacity = options.capacity ?? IDEA_PREPARATION_LIMITS.capacity
    this.ttlMs = options.ttlMs ?? IDEA_PREPARATION_LIMITS.ttlMs
    this.now = options.now ?? Date.now
  }

  /**
   * Store one preparation and mint its opaque id. Expired entries are swept
   * first; beyond the capacity the oldest entry is evicted.
   * @param entry - The canonical source snapshot and model route to hold.
   * @returns the newly minted opaque preparation id.
   */
  register(entry: PreparedIdeaSource): IdeaPreparationId {
    this.sweep()
    const id = IdeaPreparationId(`prep_${randomUUID()}`)
    this.entries.set(id, { id, stored: structuredClone(entry) })
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
    return id
  }

  /**
   * Host-only resolve of one preparation. The returned value is detached:
   * mutating it cannot alter the registry-held canonical snapshot.
   * @param id - The opaque id returned by {@link register}.
   * @returns a detached copy of the stored preparation.
   * @throws `IdeaPreparationError` with code `preparation-not-found` when the
   * id is unknown or its TTL has elapsed.
   */
  resolve(id: IdeaPreparationId): PreparedIdeaSource {
    this.sweep()
    const entry = this.entries.get(id)
    if (entry === undefined) {
      throw new IdeaPreparationError('preparation-not-found', `preparation '${id}' is unknown or expired`)
    }
    return structuredClone(entry.stored)
  }

  /** Lazy expiry sweep; no background timer exists. */
  private sweep(): void {
    const now = this.now()
    for (const [id, entry] of this.entries) {
      if (now - entry.stored.createdAt >= this.ttlMs) {
        this.entries.delete(id)
      }
    }
  }
}
