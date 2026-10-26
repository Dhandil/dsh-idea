/** Bounded, in-memory timings. Stage names are static; no content or IDs enter this store. */
export type IdeaPerfStage =
  | 'client.rpc'
  | 'client.new-rpc'
  | 'client.update-rpc'
  | 'client.choice-commit'
  | 'client.pending-commit'
  | 'client.preview-commit'
  | 'client.generate-to-preview-commit'
  /** Compatibility names: React commit, not browser paint. */
  | 'client.pending-render'
  | 'client.preview-render'
  | 'host.session-read'
  | 'host.capture'
  | 'host.route'
  | 'host.target-read'
  | 'host.prompt'
  | 'host.model-first-response'
  | 'host.model-first-text'
  | 'host.model-complete'
  | 'host.parse'
  | 'host.prepare-total'
  | 'host.rpc-handler'

export interface IdeaPerfAggregate { count: number; totalMs: number; maxMs: number }

export class IdeaPerfMetrics {
  private readonly values = new Map<IdeaPerfStage, IdeaPerfAggregate>()

  record(stage: IdeaPerfStage, startedAt: number): void {
    const elapsed = Math.max(0, performance.now() - startedAt)
    if (!Number.isFinite(elapsed)) return
    const current = this.values.get(stage) ?? { count: 0, totalMs: 0, maxMs: 0 }
    this.values.set(stage, {
      count: current.count + 1,
      totalMs: current.totalMs + elapsed,
      maxMs: Math.max(current.maxMs, elapsed),
    })
  }

  /** Aggregate snapshot for an explicit diagnostics reader; no default logging. */
  snapshot(): Readonly<Partial<Record<IdeaPerfStage, IdeaPerfAggregate>>> {
    return Object.fromEntries([...this.values].map(([stage, value]) => [stage, { ...value }]))
  }
}
