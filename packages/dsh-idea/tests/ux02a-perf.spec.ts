import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { extractModelText } from '../src/preparation/pipeline.ts'
import { IdeaPerfMetrics } from '../src/perf/metrics.ts'
import { draft, sourceDraft, storedBytes } from './helpers/harness.ts'
import { textStream } from './helpers/preparation.ts'
import { cleanupUpdates, noNetwork, updateHarness, updateRequest } from './helpers/update.ts'

beforeEach(noNetwork)
afterEach(cleanupUpdates)

describe('UX-02A content-free preparation observation', () => {
  it('keeps bounded detached numeric aggregates without content, IDs or logging', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(50)
    const log = vi.spyOn(console, 'log')
    const metrics = new IdeaPerfMetrics()
    metrics.record('client.choice-commit', 10)
    metrics.record('client.choice-commit', 20)
    metrics.record('host.model-first-text', Number.NaN)
    expect(metrics.snapshot()).toEqual({ 'client.choice-commit': { count: 2, totalMs: 70, maxMs: 40 } })
    const snapshot = metrics.snapshot()
    snapshot['client.choice-commit']!.count = 99
    expect(metrics.snapshot()['client.choice-commit']!.count).toBe(2)
    expect(log).not.toHaveBeenCalled()
    now.mockRestore()
  })

  it('distinguishes first arbitrary chunk, first nonempty text delta, and completed stream', async () => {
    const events: string[] = []
    const llm = { async *stream() {
      events.push('reasoning'); yield { type: 'block-start', index: 1, blockType: 'reasoning' }
      yield { type: 'reasoning-delta', index: 1, text: 'private reasoning' }
      yield { type: 'block-end', index: 1, block: { type: 'reasoning', text: 'private reasoning' } }
      events.push('empty'); yield { type: 'text-delta', index: 0, text: '' }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      events.push('text'); yield* textStream('visible output').slice(1)
    } }
    const result = await extractModelText(llm as never, {} as never, 'private-session', undefined, {
      onFirstResponse: () => events.push('first-chunk'),
      onFirstText: () => events.push('first-text'),
      onComplete: () => events.push('complete'),
    })
    expect(result).toBe('visible output')
    expect(events).toEqual(['reasoning', 'first-chunk', 'empty', 'text', 'first-text', 'complete'])
  })

  it('recognizes completed text blocks without deltas, once, and does not count finish as text', async () => {
    for (const hasText of [true, false]) {
      const first = vi.fn(), text = vi.fn(), complete = vi.fn()
      const chunks: StreamChunk[] = hasText
        ? [{ type: 'block-start', index: 0, blockType: 'text' },
          { type: 'block-end', index: 0, block: { type: 'text', text: 'assembled' } }, { type: 'finish', reason: { kind: 'stop' } }]
        : [{ type: 'finish', reason: { kind: 'stop' } }]
      const llm = { async *stream() { yield* chunks } }
      await extractModelText(llm as never, {} as never, 'private-session', undefined,
        { onFirstResponse: first, onFirstText: text, onComplete: complete })
      expect(first).toHaveBeenCalledTimes(1); expect(text).toHaveBeenCalledTimes(hasText ? 1 : 0)
      expect(complete).toHaveBeenCalledTimes(1)
    }
  })

  for (const mode of ['new', 'update'] as const) {
    it(`${mode}: one model call, zero preparation writes, separate complete Host stages and no sensitive values`, async () => {
      const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
      const before = await storedBytes(env.root, initial.idea.ideaId)
      env.llm.enqueueChunks(textStream(JSON.stringify(draft())))
      if (mode === 'new') await env.remote.prepareFromMessage({ sessionId: 'ordinary-session', messageId: 'answer' })
      else await env.remote.prepareUpdateFromMessage(updateRequest(initial))
      const own = mode === 'new' ? env.ctx.ideaPreparations.performance : env.updates.performance
      const other = mode === 'new' ? env.updates.performance : env.ctx.ideaPreparations.performance
      const metrics = own.snapshot()
      for (const stage of ['host.session-read', 'host.capture', 'host.route', 'host.prompt',
        'host.model-first-response', 'host.model-first-text', 'host.model-complete', 'host.parse',
        'host.prepare-total', 'host.rpc-handler'] as const) {
        expect(metrics[stage]?.count).toBe(1)
        expect(metrics[stage]?.totalMs).toBeGreaterThanOrEqual(0)
      }
      expect(metrics['host.target-read']?.count).toBe(mode === 'update' ? 2 : undefined)
      expect(other.snapshot()).toEqual({})
      expect(env.llm.calls).toHaveLength(1)
      expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(before)
      for (const value of Object.values(metrics)) expect(Object.values(value!)).toEqual(expect.arrayContaining([expect.any(Number)]))
      for (const secret of ['ordinary-session', 'answer', initial.idea.ideaId, draft().core]) expect(JSON.stringify(metrics)).not.toContain(secret)
    })

    it(`${mode}: cancellation before text cannot report a completed model or fabricate a text response`, async () => {
      const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
      const controller = new AbortController()
      env.llm.enqueueScript(async function* () {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        controller.abort()
        yield { type: 'text-delta', index: 0, text: 'late private output' }
      })
      await expect(mode === 'new'
        ? env.remote.prepareFromMessage({ sessionId: 'ordinary-session', messageId: 'answer' }, controller.signal)
        : env.remote.prepareUpdateFromMessage(updateRequest(initial), controller.signal)).rejects.toBeTruthy()
      const metrics = (mode === 'new' ? env.ctx.ideaPreparations.performance : env.updates.performance).snapshot()
      expect(metrics['host.model-first-response']?.count).toBe(1)
      expect(metrics['host.model-first-text']).toBeUndefined()
      expect(metrics['host.model-complete']).toBeUndefined()
      expect(metrics['host.prepare-total']?.count).toBe(1)
      expect(metrics['host.rpc-handler']?.count).toBe(1)
      expect(env.llm.calls).toHaveLength(1)
    })
  }
})
