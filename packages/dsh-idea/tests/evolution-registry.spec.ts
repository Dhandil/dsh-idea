/**
 * The ephemeral evolution registry: opaque ids minted by the registry and
 * stamped onto the stored proposal, detached stored and returned values,
 * explicit unknown/expired failures, deterministic capacity eviction, lazy
 * TTL sweep on an injectable clock, and consume-after-success semantics. In
 * memory only — no storage, no timers, no network.
 * @module tests/evolution-registry.spec
 */

import { describe, expect, it } from 'vitest'
import { IdeaEvolutionError } from '../src/evolution/errors.ts'
import { IdeaEvolutionRegistry } from '../src/evolution/registry.ts'
import type { PreparedEvolution } from '../src/evolution/types.ts'
import { EvolutionProposalId, IdeaId, IdeaVersionId } from '../src/types.ts'
import { draft } from './helpers/harness.ts'

const entry = (ideaId = 'idea_1', at = Date.now()): PreparedEvolution => ({
  proposal: {
    ideaId: IdeaId(ideaId),
    baseVersionId: IdeaVersionId('idea_ver_1'),
    draft: draft(),
    reason: 'continued-discussion',
    createdAt: at,
  },
  source: {
    sessionId: 'conversation-1',
    startSeq: 2,
    endSeq: 5,
    capturedContext: [
      { role: 'user', text: 'The title undersells the provenance angle.' },
      { role: 'assistant', text: 'Agreed.' },
    ],
  },
})

const errorCode = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    if (error instanceof IdeaEvolutionError) return error.code
    throw error
  }
  throw new Error('expected the registry to reject')
}

describe('register and resolve', () => {
  it('mints a fresh opaque id per entry and stamps it onto the stored proposal', () => {
    const registry = new IdeaEvolutionRegistry()
    const first = registry.register(entry())
    const second = registry.register(entry())
    expect(first).toMatch(/^evo_/)
    expect(second).toMatch(/^evo_/)
    expect(first).not.toBe(second)
    expect(registry.resolve(first).proposal.proposalId).toBe(first)
    expect(registry.resolve(second).proposal.proposalId).toBe(second)
  })

  it('resolves the exact proposal and capture behind an id', () => {
    const registry = new IdeaEvolutionRegistry()
    const id = registry.register(entry('idea_9'))
    const resolved = registry.resolve(id)
    expect(resolved.proposal.ideaId).toBe('idea_9')
    expect(resolved.proposal.baseVersionId).toBe('idea_ver_1')
    expect(resolved.proposal.reason).toBe('continued-discussion')
    expect(resolved.source.sessionId).toBe('conversation-1')
    expect(resolved.source.capturedContext).toHaveLength(2)
  })

  it('keeps registry state detached from callers and inputs', () => {
    const registry = new IdeaEvolutionRegistry()
    const registered = entry('idea_1')
    const id = registry.register(registered)

    // Mutating the registered input must not reach the stored entry.
    ;(registered.source.capturedContext as unknown[]).push({ role: 'user', text: 'injected' })
    registered.proposal.baseVersionId = IdeaVersionId('idea_ver_mutated')

    const resolved = registry.resolve(id)
    expect(resolved.source.capturedContext).toHaveLength(2)
    expect(resolved.proposal.baseVersionId).toBe('idea_ver_1')

    // Mutating a resolved copy must not reach the stored entry either.
    resolved.proposal.ideaId = IdeaId('mutated')
    ;(resolved.source.capturedContext as unknown[]).push({ role: 'user', text: 'injected' })
    expect(registry.resolve(id).proposal.ideaId).toBe('idea_1')
    expect(registry.resolve(id).source.capturedContext).toHaveLength(2)
  })

  it('rejects unknown ids explicitly', () => {
    const registry = new IdeaEvolutionRegistry()
    expect(errorCode(() => registry.resolve(EvolutionProposalId('evo_absent')))).toBe('proposal-not-found')
  })
})

describe('consume', () => {
  it('removes the entry so a duplicate resolve is proposal-not-found', () => {
    const registry = new IdeaEvolutionRegistry()
    const id = registry.register(entry())
    const consumed = registry.consume(id)
    expect(consumed.proposal.proposalId).toBe(id)
    expect(errorCode(() => registry.resolve(id))).toBe('proposal-not-found')
    expect(errorCode(() => registry.consume(id))).toBe('proposal-not-found')
  })
})

describe('ttl expiry', () => {
  it('rejects an id whose ttl has elapsed, using lazy sweeps only', () => {
    let now = 1_000
    const registry = new IdeaEvolutionRegistry({ ttlMs: 30 * 60 * 1000, now: () => now })
    const id = registry.register(entry('idea_1', now))

    now += 30 * 60 * 1000 - 1
    expect(() => registry.resolve(id)).not.toThrow()

    now += 1
    expect(errorCode(() => registry.resolve(id))).toBe('proposal-not-found')
  })
})

describe('capacity eviction', () => {
  it('evicts the oldest entry deterministically beyond the capacity', () => {
    const registry = new IdeaEvolutionRegistry({ capacity: 2 })
    const first = registry.register(entry('idea_1'))
    const second = registry.register(entry('idea_2'))
    const third = registry.register(entry('idea_3'))

    expect(errorCode(() => registry.resolve(first))).toBe('proposal-not-found')
    expect(registry.resolve(second).proposal.ideaId).toBe('idea_2')
    expect(registry.resolve(third).proposal.ideaId).toBe('idea_3')
  })

  it('sweeps expired entries before evicting live ones', () => {
    let now = 1_000
    const registry = new IdeaEvolutionRegistry({ capacity: 2, ttlMs: 1_000, now: () => now })
    const first = registry.register(entry('idea_1', now))
    now = 1_900
    const second = registry.register(entry('idea_2', now))

    // The first entry expires; registering a third must sweep the expired
    // one instead of evicting the live second.
    now = 2_500
    const third = registry.register(entry('idea_3', now))
    expect(registry.resolve(second).proposal.ideaId).toBe('idea_2')
    expect(registry.resolve(third).proposal.ideaId).toBe('idea_3')
    expect(errorCode(() => registry.resolve(first))).toBe('proposal-not-found')
  })
})
