/**
 * Host-owned bounded capture of one continued discussion's whole visible
 * conversation. The capture is deterministic: only human `user/message`
 * events and assistant messages are admitted, only `type: 'text'` blocks
 * are kept, the most recent messages win the frozen 12-message /
 * 12,000-character budget, and an oversized message is deterministically
 * truncated instead of dropped. A discussion with no usable text fails —
 * there is nothing to evolve from.
 * @module @dsh-external/dsh-idea/src/evolution/context
 */

import type { SurfaceEvent } from '@deepseek-ai/dsh-session'
import { IDEA_CAPTURE_LIMITS, normalizeCapturedText, truncateToBudget, visibleText } from '../preparation/context.ts'
import { IdeaPreparationError } from '../preparation/errors.ts'
import type { CapturedMessage } from '../types.ts'

interface Candidate {
  role: 'user' | 'assistant'
  seq: number
  text: string
}

/** The normalized discussion a successful capture yields. */
export interface CollectedDiscussion {
  /** Durable seq of the first captured message event. */
  startSeq: number
  /** Durable seq of the last captured message event. */
  endSeq: number
  /** Captured messages in chronological order. */
  messages: CapturedMessage[]
  /** Total normalized characters across {@link messages}. */
  characterCount: number
}

/**
 * Capture the bounded visible conversation of one continued discussion.
 * @param events - The discussion conversation's surface events, in
 * model-history order.
 * @returns the normalized, budgeted capture, chronological.
 * @throws `IdeaPreparationError` with code `source-unavailable` when the
 * conversation carries no usable visible text yet.
 */
export function collectDiscussionFromSurface(events: readonly SurfaceEvent[]): CollectedDiscussion {
  const collected: Candidate[] = []
  let remaining = IDEA_CAPTURE_LIMITS.maxCharacters

  // The most recent messages win the budget: walk backward, stop when either
  // bound is exhausted, then restore chronological order.
  for (let index = events.length - 1; index >= 0 && collected.length < IDEA_CAPTURE_LIMITS.maxMessages; index -= 1) {
    const event = events[index]
    if (event === undefined) continue

    let candidate: Candidate | undefined
    if (event.type === 'assistant/message') {
      candidate = { role: 'assistant', seq: event.seq, text: visibleText(event.data.message.content) }
    } else if (event.type === 'user/message' && event.data.source.kind === 'user') {
      candidate = { role: 'user', seq: event.seq, text: visibleText(event.data.content) }
    }
    if (candidate === undefined) continue

    let text = normalizeCapturedText(candidate.text)
    if (text.length === 0) continue
    if (text.length > remaining) {
      if (remaining < IDEA_CAPTURE_LIMITS.minTruncatable) break
      text = truncateToBudget(text, remaining)
    }
    collected.push({ ...candidate, text })
    remaining -= text.length
  }

  if (collected.length === 0) {
    throw new IdeaPreparationError(
      'source-unavailable',
      'the discussion conversation carries no usable visible text yet',
    )
  }

  const chronological = [...collected].reverse()
  let characterCount = 0
  const messages = chronological.map(message => {
    characterCount += message.text.length
    return { role: message.role, text: message.text }
  })
  return {
    startSeq: chronological[0]!.seq,
    endSeq: collected[0]!.seq,
    messages,
    characterCount,
  }
}
