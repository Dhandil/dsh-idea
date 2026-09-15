/**
 * Host-owned bounded capture of the visible discussion behind one assistant
 * anchor message. The capture is deterministic: the anchor is the finalized
 * `assistant/message` whose id exactly matches the request, capture walks
 * backward only (never past the anchor), admits only human `user/message`
 * events and assistant messages, keeps `type: 'text'` blocks alone, and
 * never exceeds the frozen 12-message / 12,000-character budget — an
 * oversized message is deterministically truncated instead of dropped.
 * @module @dsh-external/dsh-idea/src/preparation/context
 */

import type { SurfaceEvent } from '@deepseek-ai/dsh-session'
import { IdeaPreparationError } from './errors.ts'
import type { CapturedMessage } from '../types.ts'

/** Frozen Save-context policy of T2. Tighter than the durable bounds of T1. */
export const IDEA_CAPTURE_LIMITS = {
  /** Most visible messages one capture may hold. */
  maxMessages: 12,
  /** Most normalized characters one capture may hold in total. */
  maxCharacters: 12_000,
} as const

const TRUNCATION_MARKER = '\n…[truncated]…\n'
/** Below this budget a message cannot retain head+tail around the marker. */
const MIN_TRUNCATABLE = TRUNCATION_MARKER.length + 2

/**
 * One deterministic normalization for captured text: CRLF/CR become `\n`,
 * outer whitespace is trimmed, and pathological blank-line runs collapse to
 * one blank line. Ordinary prose and code are preserved verbatim.
 */
export function normalizeCapturedText(text: string): string {
  const unified = text.replace(/\r\n?/g, '\n').trim()
  return unified.replace(/\n{3,}/g, '\n\n')
}

/** The normalized discussion a successful capture yields. */
export interface CapturedDiscussion {
  anchorMessageId: string
  /** Durable seq of the first captured message event (chronologically first). */
  startSeq: number
  /** Durable seq of the last captured message event (the anchor). */
  endSeq: number
  /** Captured messages in chronological order. */
  messages: CapturedMessage[]
  /** Total normalized characters across {@link messages}. */
  characterCount: number
}

/** Deterministic prefix/marker/suffix truncation within one character budget. */
function truncateToBudget(text: string, budget: number): string {
  const available = budget - TRUNCATION_MARKER.length
  const head = Math.ceil(available / 2)
  const tail = available - head
  return text.slice(0, head) + TRUNCATION_MARKER + text.slice(text.length - tail)
}

/** Join only the `type: 'text'` blocks; every other block kind is ignored. */
function visibleText(content: ReadonlyArray<{ readonly type: string; readonly text?: string }>): string {
  let joined = ''
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      joined += block.text
    }
  }
  return joined
}

interface Candidate {
  role: 'user' | 'assistant'
  seq: number
  text: string
}

/**
 * Capture the bounded visible discussion for one Save Idea preparation.
 * @param events - The current Session surface events, in model-history order.
 * @param anchorMessageId - The finalized assistant message id to anchor on.
 * @returns the normalized, budgeted capture including the anchor.
 * @throws `IdeaPreparationError` with code `source-not-found` when no
 * `assistant/message` with the requested id exists, and `source-unavailable`
 * when the anchor carries no usable visible text.
 */
export function captureDiscussionFromSurface(
  events: readonly SurfaceEvent[],
  anchorMessageId: string,
): CapturedDiscussion {
  let anchorIndex = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event !== undefined && event.type === 'assistant/message' && event.data.message.id === anchorMessageId) {
      anchorIndex = index
      break
    }
  }
  if (anchorIndex < 0) {
    throw new IdeaPreparationError(
      'source-not-found',
      `no finalized assistant message '${anchorMessageId}' exists on the current session surface`,
    )
  }

  const captured: Candidate[] = []
  let remaining = IDEA_CAPTURE_LIMITS.maxCharacters

  for (let index = anchorIndex; index >= 0 && captured.length < IDEA_CAPTURE_LIMITS.maxMessages; index -= 1) {
    const event = events[index]
    if (event === undefined) continue
    const isAnchor = index === anchorIndex

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
      // The anchor never disappears because it is large; earlier messages do
      // not survive a budget that cannot retain meaningful text.
      if (!isAnchor && remaining < MIN_TRUNCATABLE) break
      text = truncateToBudget(text, remaining)
    }
    captured.push({ ...candidate, text })
    remaining -= text.length
  }

  if (captured.length === 0) {
    throw new IdeaPreparationError(
      'source-unavailable',
      `assistant message '${anchorMessageId}' carries no usable visible text`,
    )
  }

  const chronological = [...captured].reverse()
  let characterCount = 0
  const messages = chronological.map((message) => {
    characterCount += message.text.length
    return { role: message.role, text: message.text }
  })
  return {
    anchorMessageId,
    startSeq: chronological[0]!.seq,
    endSeq: captured[0]!.seq,
    messages,
    characterCount,
  }
}
