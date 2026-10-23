/** E6-only fixture synchronization. No product hooks or private worker access. */
import type { Context } from '@deepseek-ai/cordis'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashVector } from './semantic.ts'

export function e6Trace() {
  const start = performance.now()
  return (stage: string, detail: Record<string, number | boolean> = {}) => {
    if (process.env.DSH_IDEA_E6_TRACE !== '1') return
    if (!process.env.DSH_IDEA_LOGS) throw new Error('E6 tracing requires isolated DSH_IDEA_LOGS')
    appendFileSync(join(process.env.DSH_IDEA_LOGS, 'e6-fixed.jsonl'), JSON.stringify({
      stage, startedAt: Math.round(performance.timeOrigin + start),
      ms: Math.round((performance.now() - start) * 1000) / 1000, ...detail,
    }) + '\n')
  }
}

/** One 4s work deadline inside the unchanged Vitest 5s total; cleanup keeps 1s. */
export class E6WorkBudget {
  readonly controller = new AbortController()
  private readonly deadline: number
  constructor(ms = 4000, private readonly now = () => performance.now()) {
    if (!(ms > 0 && ms <= 4000)) throw new Error('invalid E6 work budget')
    this.deadline = this.now() + ms
  }
  async within<T>(phase: string, promise: Promise<T>): Promise<T> {
    const remaining = this.deadline - this.now()
    if (remaining <= 0) { this.controller.abort(); throw new Error(`E6 work budget exhausted: ${phase}`) }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          this.controller.abort()
          reject(new Error(`E6 work budget exhausted: ${phase}`))
        }, remaining)
      })])
    } finally { clearTimeout(timer) }
  }
}

/** Public put publication follows both durability and KvTable memory publish. */
export function publishedEmbeddings(ctx: Context, onPublished = () => {}) {
  const seen = new Set<string>()
  const waiting = new Map<string, { promise: Promise<void>; resolve(): void; reject(error: Error): void }>()
  const stop = ctx.on('domain/changed', change => {
    if (change.domain !== 'idea_semantic' || change.table !== 'embeddings' || change.operation !== 'put') return
    seen.add(change.key)
    waiting.get(change.key)?.resolve()
    waiting.delete(change.key)
    onPublished()
  })
  return {
    wait(key: string): Promise<void> {
      if (seen.has(key)) return Promise.resolve()
      const existing = waiting.get(key)
      if (existing) return existing.promise
      let resolve!: () => void, reject!: (error: Error) => void
      const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
      waiting.set(key, { promise, resolve, reject })
      return promise
    },
    dispose() {
      stop()
      for (const entry of waiting.values()) entry.reject(new Error('E6 publication observer disposed'))
      waiting.clear()
    },
  }
}

/** Handshake the actual expected Query; unrelated index requests cannot open it. */
export function embeddingQueryGate(query: string, trace: ReturnType<typeof e6Trace> = () => {}) {
  let enter!: () => void, release!: () => void, released = false
  const entered = new Promise<void>(resolve => { enter = resolve })
  const blocked = new Promise<void>(resolve => { release = resolve })
  const queryRequests: string[][] = []
  return {
    entered, queryRequests,
    get released() { return released },
    release() { if (!released) { released = true; release() } },
    async handle(body: { input?: unknown }) {
      const inputs = Array.isArray(body.input) ? body.input as string[] : []
      if (inputs.includes(query)) {
        queryRequests.push(inputs)
        trace('query-gate-entered', { queryCalls: queryRequests.length })
        enter()
        await blocked
        trace('query-gate-released')
      }
      return { status: 200, payload: { data: inputs.map((input, index) => ({ index, embedding: hashVector(input, 4) })) } }
    },
    waitForQuery(pending: Promise<unknown>) {
      return Promise.race([entered, pending.then(() => { throw new Error('E6 query completed before entering its gate') })])
    },
  }
}
