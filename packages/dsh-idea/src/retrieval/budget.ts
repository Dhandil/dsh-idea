/**
 * Deterministic bounded-projection machinery shared by the payload-budgeted
 * projections (Related candidates, referenced-Idea recall): per-field budget
 * ladders walked from lowest to highest preservation priority, list drop
 * thresholds, and text clipping. The walker checks the serialized size after
 * every degradation step, so the output is deterministic for a given input.
 * @module @dsh-external/dsh-idea/src/retrieval/budget
 */

import { IDEA_CAPTURE_LIMITS, truncateToBudget } from '../preparation/context.ts'

/** Below this field budget a list field is dropped instead of clipped. */
export const LIST_DROP_BUDGET = 40

/**
 * Descending per-field content budgets one degradable tier walks through:
 * a tier starts whole and, once degradation reaches it, is capped down this
 * ladder rung by rung until it is dropped entirely.
 */
export const IDEA_FIELD_BUDGET_LADDER: readonly number[] = [4_000, 2_000, 1_000, 500, 250, 120, 60, 0]

/**
 * Degradable content fields from lowest preservation priority to highest
 * (identity and title sit above every tier and never drop). Payload pressure
 * must exhaust a lower tier completely — every rung down to zero — before
 * the next higher tier gives up anything. This is the shared preservation
 * priority of the existing Idea usefulness semantics.
 */
export const IDEA_FIELD_DEGRADATION_ORDER = [
  'possibleValue',
  'motivation',
  'openQuestions',
  'useWhen',
  'currentConclusion',
  'core',
] as const

/** Clip one text to its budget, dropping it entirely below the readable bound. */
export function boundedText(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget < IDEA_CAPTURE_LIMITS.minTruncatable) return ''
  return truncateToBudget(text, budget)
}

/** Clip one list to its budget, dropping the whole field below the drop bound. */
export function boundedList(items: readonly string[], budget: number): readonly string[] {
  if (budget < LIST_DROP_BUDGET) return []
  const bounded = items.map(item => boundedText(item, budget)).filter(item => item.length > 0)
  return bounded.length > 0 ? bounded : []
}

/**
 * Project records within a serialized-size budget by degrading per-field
 * budgets along the caller's ladder: `project` renders every record under
 * the current budgets, the size is checked, and while over budget the
 * lowest-priority field not yet fully degraded steps one rung down its
 * ladder. When every tier has reached zero the last projection is returned
 * rather than nothing — the caller's own guarantee (identity survives above
 * every tier) decides whether that state is representable.
 */
export function projectWithinBudget<F extends string, P>(input: {
  /** Lowest-to-highest preservation priority; each field owns the ladder. */
  order: readonly F[]
  /** Per-field budget ladder, descending, ending at 0. */
  ladder: readonly number[]
  /** Render every record once under the given per-field budgets. */
  project: (budgetOf: (field: F) => number) => P[]
  /** Serialized-size bound the projection must fit. */
  limit: number
}): P[] {
  const { order, ladder, project, limit } = input
  const budgets = new Map<F, number>(order.map(field => [field, Number.POSITIVE_INFINITY]))
  for (;;) {
    const budgetOf = (field: F) => budgets.get(field)!
    const projection = project(budgetOf)
    if (JSON.stringify(projection).length <= limit) return projection
    let stepped = false
    for (const field of order) {
      const current = budgets.get(field)!
      if (current === 0) continue
      const rung = ladder.indexOf(current)
      budgets.set(field, rung >= 0 ? (ladder[rung + 1] ?? 0) : ladder[0]!)
      stepped = true
      break
    }
    if (!stepped) return projection
  }
}
