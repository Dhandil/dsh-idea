/**
 * The ephemeral, Host-owned evolution registry. A successful preparation
 * stores the approved-pending proposal plus the bounded discussion capture
 * behind one opaque id. Entries live in memory only — never `storageDomain`
 * — under a bounded capacity and a finite TTL with lazy expiry (no
 * background timer); a restart losing pending proposals is acceptable by
 * design, and a consumed proposal can never commit twice.
 * @module @dsh-external/dsh-idea/src/evolution/registry
 */

import { randomUUID } from 'node:crypto'
import { IdeaEvolutionError } from './errors.ts'
import { EvolutionProposalId } from '../types.ts'
import type { IdeaEvolutionProposal, ResolvedEvolution } from './types.ts'
import type { PreparedEvolution } from './types.ts'

/** Default V1 registry policy. */
export const IDEA_EVOLUTION_LIMITS = {
  /** Most simultaneously held proposals; the oldest is evicted beyond this. */
  capacity: 64,
  /** How long a proposal stays resolvable. */
  ttlMs: 30 * 60 * 1000,
} as const

export interface IdeaEvolutionRegistryOptions {
  capacity?: number
  ttlMs?: number
  /** Injectable monotonic clock for deterministic tests. */
  now?: () => number
}

interface RegistryEntry {
  id: EvolutionProposalId
  stored: IdeaEvolutionProposal
  source: PreparedEvolution['source']
}

export class IdeaEvolutionRegistry {
  private readonly capacity: number
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly entries = new Map<EvolutionProposalId, RegistryEntry>()

  constructor(options: IdeaEvolutionRegistryOptions = {}) {
    this.capacity = options.capacity ?? IDEA_EVOLUTION_LIMITS.capacity
    this.ttlMs = options.ttlMs ?? IDEA_EVOLUTION_LIMITS.ttlMs
    this.now = options.now ?? Date.now
  }

  /**
   * Store one proposal and mint its opaque id; the minted id is stamped
   * onto the stored proposal. Expired entries are swept first; beyond the
   * capacity the oldest entry is evicted.
   * @param entry - The proposal and its discussion capture to hold.
   * @returns the newly minted opaque proposal id.
   */
  register(entry: PreparedEvolution): EvolutionProposalId {
    this.sweep()
    const id = EvolutionProposalId(`evo_${randomUUID()}`)
    this.entries.set(id, {
      id,
      stored: structuredClone({ ...entry.proposal, proposalId: id }),
      source: structuredClone(entry.source),
    })
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
    return id
  }

  /**
   * Host-only resolve of one proposal. The returned value is detached:
   * mutating it cannot alter the registry-held canonical entry.
   * @param id - The opaque id returned by {@link register}.
   * @returns a detached copy of the stored proposal and capture.
   * @throws `IdeaEvolutionError` with code `proposal-not-found` when the id
   * is unknown or its TTL has elapsed.
   */
  resolve(id: EvolutionProposalId): ResolvedEvolution {
    this.sweep()
    const entry = this.entries.get(id)
    if (entry === undefined) {
      throw new IdeaEvolutionError('proposal-not-found', `proposal '${id}' is unknown or expired`)
    }
    return {
      proposal: structuredClone(entry.stored),
      source: structuredClone(entry.source),
    }
  }

  /**
   * Consume one proposal after its successful commit: the entry is removed,
   * so a duplicate commit resolves to `proposal-not-found` and can never
   * create a second version from the same proposal.
   */
  consume(id: EvolutionProposalId): ResolvedEvolution {
    const stored = this.resolve(id)
    this.entries.delete(id)
    return stored
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
