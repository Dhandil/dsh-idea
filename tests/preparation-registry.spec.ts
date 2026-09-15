/**
 * The ephemeral preparation registry: opaque ids, detached stored and
 * returned values, explicit unknown/expired failures, deterministic capacity
 * eviction, and lazy TTL sweep on an injectable clock. In-memory only — no
 * storage, no timers, no network.
 * @module tests/preparation-registry.spec
 */

import { describe, expect, it } from 'vitest'
import { IdeaPreparationError } from '../src/preparation/errors.ts'
import { IdeaPreparationRegistry } from '../src/preparation/registry.ts'
import { IdeaPreparationId } from '../src/preparation/types.ts'
import type { PreparedIdeaSource } from '../src/preparation/types.ts'
import { sourceDraft } from './helpers/harness.ts'
import type { SourceDiscussionDraft } from '../src/types.ts'

const entry = (sessionId = 'session-1'): PreparedIdeaSource => ({
  source: sourceDraft({ sessionId }) as SourceDiscussionDraft,
  model: { provider: 'provider', model: 'model' },
  createdAt: Date.now(),
})

const errorCode = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    if (error instanceof IdeaPreparationError) return error.code
    throw error
  }
  throw new Error('expected the registry to reject')
}

describe('register and resolve', () => {
  it('mints a fresh opaque id per entry', () => {
    const registry = new IdeaPreparationRegistry()
    const first = registry.register(entry())
    const second = registry.register(entry())
    expect(first).toMatch(/^prep_/)
    expect(second).toMatch(/^prep_/)
    expect(first).not.toBe(second)
  })

  it('resolves the exact captured source behind an id', () => {
    const registry = new IdeaPreparationRegistry()
    const stored = entry('session-9')
    const id = registry.register(stored)
    const resolved = registry.resolve(id)
    expect(resolved.source.sessionId).toBe('session-9')
    expect(resolved.model).toEqual(stored.model)
    expect(resolved.createdAt).toBe(stored.createdAt)
  })

  it('keeps registry state detached from callers and inputs', () => {
    const registry = new IdeaPreparationRegistry()
    const stored = entry('session-1')
    const id = registry.register(stored)

    // Mutating the registered input must not reach the stored entry.
    ;(stored.source.capturedContext as unknown[]).push({ role: 'user', text: 'injected' })
    stored.model.provider = 'mutated-provider'

    const resolved = registry.resolve(id)
    expect(resolved.source.capturedContext).toHaveLength(2)
    expect(resolved.model.provider).toBe('provider')

    // Mutating a resolved copy must not reach the stored entry either.
    resolved.source.sessionId = 'mutated'
    ;(resolved.source.capturedContext as unknown[]).push('injected')
    expect(registry.resolve(id).source.sessionId).toBe('session-1')
    expect(registry.resolve(id).source.capturedContext).toHaveLength(2)
  })

  it('rejects unknown ids explicitly', () => {
    const registry = new IdeaPreparationRegistry()
    expect(errorCode(() => registry.resolve(IdeaPreparationId('prep_absent')))).toBe('preparation-not-found')
  })
})

describe('ttl expiry', () => {
  it('rejects an id whose ttl has elapsed, using lazy sweeps only', () => {
    let now = 1_000
    const registry = new IdeaPreparationRegistry({ ttlMs: 30 * 60 * 1000, now: () => now })
    const id = registry.register({ ...entry(), createdAt: now })

    now += 30 * 60 * 1000 - 1
    expect(() => registry.resolve(id)).not.toThrow()

    now += 1
    expect(errorCode(() => registry.resolve(id))).toBe('preparation-not-found')
    expect(errorCode(() => registry.resolve(id))).toBe('preparation-not-found')
  })
})

describe('capacity eviction', () => {
  it('evicts the oldest entry deterministically beyond the capacity', () => {
    const registry = new IdeaPreparationRegistry({ capacity: 2 })
    const first = registry.register(entry('session-1'))
    const second = registry.register(entry('session-2'))
    const third = registry.register(entry('session-3'))

    expect(errorCode(() => registry.resolve(first))).toBe('preparation-not-found')
    expect(registry.resolve(second).source.sessionId).toBe('session-2')
    expect(registry.resolve(third).source.sessionId).toBe('session-3')
  })

  it('sweeps expired entries before evicting live ones', () => {
    let now = 1_000
    const registry = new IdeaPreparationRegistry({ capacity: 2, ttlMs: 1_000, now: () => now })
    const first = registry.register({ ...entry('session-1'), createdAt: now })
    now = 1_900
    const second = registry.register({ ...entry('session-2'), createdAt: now })

    // The first entry expires; registering a third must sweep the expired
    // one instead of evicting the live second.
    now = 2_500
    const third = registry.register({ ...entry('session-3'), createdAt: now })
    expect(registry.resolve(second).source.sessionId).toBe('session-2')
    expect(registry.resolve(third).source.sessionId).toBe('session-3')
    expect(errorCode(() => registry.resolve(first))).toBe('preparation-not-found')
  })
})
