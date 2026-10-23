import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { E6WorkBudget, embeddingQueryGate, publishedEmbeddings } from './helpers/e6.ts'
import { fakeEmbeddingServer } from './helpers/semantic.ts'

describe('E6 fixture synchronization and failure cleanup', () => {
  it('waits for the target public put, ignoring other keys/tables/domains/deletes and retaining early publication', async () => {
    const ctx = new Context()
    const publication = publishedEmbeddings(ctx)
    let ready = false
    const pending = publication.wait('target').then(() => { ready = true })
    const event = { domain: 'idea_semantic', table: 'embeddings', key: 'target', operation: 'put' as const, value: {} }
    try {
      ctx.emit('domain/changed', { ...event, key: 'another' })
      ctx.emit('domain/changed', { ...event, table: 'another' })
      ctx.emit('domain/changed', { ...event, domain: 'another' })
      ctx.emit('domain/changed', { domain: event.domain, table: event.table, key: event.key, operation: 'deleted' })
      await Promise.resolve()
      expect(ready).toBe(false)
      ctx.emit('domain/changed', event)
      await pending
      expect(ready).toBe(true)
      ctx.emit('domain/changed', { ...event, key: 'early' })
      await publication.wait('early')
    } finally { publication.dispose(); await ctx.fiber.dispose() }
  })

  it('ignores extra index requests and parks only the exact Query until explicit release', async () => {
    const gate = embeddingQueryGate('user: controlled-query')
    let entered = false, settled = false
    void gate.entered.then(() => { entered = true })
    try {
      await gate.handle({ input: ['Title: index one'] })
      await gate.handle({ input: ['Title: index two', 'user: different-query'] })
      expect(entered).toBe(false)
      const pending = gate.handle({ input: ['user: controlled-query'] }).then(result => { settled = true; return result })
      await gate.entered
      expect(entered).toBe(true)
      expect(settled).toBe(false)
      expect(gate.queryRequests).toEqual([['user: controlled-query']])
      gate.release()
      expect((await pending).status).toBe(200)
      expect(settled).toBe(true)
      gate.release() // finally/repeated cleanup remains idempotent
    } finally { gate.release() }
  })

  it('fails immediately if retrieval completes without entering the expected Query gate', async () => {
    const gate = embeddingQueryGate('user: controlled-query')
    await expect(gate.waitForQuery(Promise.resolve({ candidates: [] }))).rejects.toThrow('completed before entering')
    expect(gate.queryRequests).toHaveLength(0)
    gate.release()
  })

  it('shares one work deadline across phases and aborts without extending the 5s test limit', async () => {
    let now = 0
    const budget = new E6WorkBudget(20, () => now)
    await budget.within('first-phase', Promise.resolve())
    now = 21
    await expect(budget.within('next-phase', Promise.resolve())).rejects.toThrow('budget exhausted: next-phase')
    expect(budget.controller.signal.aborted).toBe(true)
    expect(() => new E6WorkBudget(5000)).toThrow('invalid E6 work budget')
  })

  for (const fault of ['assertion', 'budget'] as const) {
    it(`releases a real loopback HTTP Query gate and closes its server after an injected ${fault} failure`, async () => {
      const server = await fakeEmbeddingServer()
      const gate = embeddingQueryGate('user: controlled-query')
      const controller = new AbortController()
      const readyBudget = new E6WorkBudget()
      let pending: Promise<Response> | undefined
      let closed = false
      server.setHandler(gate.handle)
      try {
        await expect((async () => {
          pending = fetch(`${server.url}/embeddings`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: ['user: controlled-query'] }), signal: controller.signal,
          })
          await readyBudget.within('fixture-gate', gate.waitForQuery(pending))
          expect(gate.released).toBe(false)
          if (fault === 'assertion') throw new Error('controlled assertion failure')
          await new E6WorkBudget(20).within('controlled-wait', new Promise<never>(() => {}))
        })()).rejects.toThrow(fault === 'assertion' ? 'controlled assertion failure' : 'budget exhausted: controlled-wait')
      } finally {
        gate.release()
        controller.abort()
        await pending?.catch(() => {})
        await server.close()
        closed = true
      }
      expect(gate.released).toBe(true)
      expect(closed).toBe(true)
      expect(gate.queryRequests).toHaveLength(1)
    })
  }
})
