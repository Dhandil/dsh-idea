/**
 * Bounded capture over scripted Session surfaces: anchor resolution by exact
 * id, backward-only walk with human-visible text only, both frozen bounds,
 * deterministic oversized truncation, and exact seq bookkeeping. Pure
 * functions — no services, no LLM, no network.
 * @module tests/preparation-context.spec
 */

import { describe, expect, it } from 'vitest'
import { captureDiscussionFromSurface, IDEA_CAPTURE_LIMITS, normalizeCapturedText } from '../src/preparation/context.ts'
import { IdeaPreparationError } from '../src/preparation/errors.ts'
import { assistantEvent, systemEvent, toolResultEvent, userEvent } from './helpers/preparation.ts'
import type { SurfaceEvent } from './helpers/preparation.ts'

const errorCode = (run: () => unknown): string => {
  try {
    run()
  } catch (error) {
    if (error instanceof IdeaPreparationError) return error.code
    throw error
  }
  throw new Error('expected the capture to reject')
}

describe('anchor resolution', () => {
  it('finds the assistant anchor by exact messageId among several', () => {
    const events = [
      userEvent('u1', 'earlier question', 1),
      assistantEvent('a1', 'earlier answer', 2),
      assistantEvent('a2', 'the clicked answer', 3),
    ]
    const captured = captureDiscussionFromSurface(events, 'a2')
    expect(captured.anchorMessageId).toBe('a2')
    expect(captured.endSeq).toBe(3)
    expect(captured.messages.at(-1)).toEqual({ role: 'assistant', text: 'the clicked answer' })
  })

  it('rejects an empty surface with source-not-found', () => {
    expect(errorCode(() => captureDiscussionFromSurface([], 'a1'))).toBe('source-not-found')
  })

  it('rejects a surface without the requested anchor with source-not-found', () => {
    const events = [userEvent('u1', 'q', 1), assistantEvent('a1', 'answer', 2)]
    expect(errorCode(() => captureDiscussionFromSurface(events, 'a-missing'))).toBe('source-not-found')
  })

  it('always includes the anchor itself', () => {
    const events = [assistantEvent('a1', 'only the anchor', 7)]
    const captured = captureDiscussionFromSurface(events, 'a1')
    expect(captured.messages).toEqual([{ role: 'assistant', text: 'only the anchor' }])
    expect(captured.startSeq).toBe(7)
    expect(captured.endSeq).toBe(7)
  })

  it('rejects an anchor without usable visible text with source-unavailable', () => {
    const events = [userEvent('u1', '  \n  ', 1), assistantEvent('a1', '   ', 2)]
    expect(errorCode(() => captureDiscussionFromSurface(events, 'a1'))).toBe('source-unavailable')
  })
})

describe('visible text selection', () => {
  it('captures prior human user and assistant text in chronological order', () => {
    const events = [
      userEvent('u1', 'first question', 1),
      assistantEvent('a1', 'first answer', 2),
      userEvent('u2', 'second question', 3),
      assistantEvent('a2', 'second answer', 4),
    ]
    const captured = captureDiscussionFromSurface(events, 'a2')
    expect(captured.messages).toEqual([
      { role: 'user', text: 'first question' },
      { role: 'assistant', text: 'first answer' },
      { role: 'user', text: 'second question' },
      { role: 'assistant', text: 'second answer' },
    ])
    expect(captured.startSeq).toBe(1)
    expect(captured.endSeq).toBe(4)
    expect(captured.characterCount).toBe(
      'first question'.length + 'first answer'.length + 'second question'.length + 'second answer'.length,
    )
  })

  it('never captures events after the anchor', () => {
    const events = [
      userEvent('u1', 'before', 1),
      assistantEvent('a1', 'anchor', 2),
      userEvent('u2', 'LATER-MARKER', 3),
      assistantEvent('a2', 'LATER-ANSWER', 4),
    ]
    const captured = captureDiscussionFromSurface(events, 'a1')
    const joined = JSON.stringify(captured.messages)
    expect(joined).not.toContain('LATER-MARKER')
    expect(joined).not.toContain('LATER-ANSWER')
    expect(captured.endSeq).toBe(2)
  })

  it('excludes system messages, tool results, and plugin-authored user context', () => {
    const events = [
      systemEvent('SYSTEM-PROMPT-MARKER', 1),
      userEvent('u1', 'real question', 2),
      assistantEvent('a1', 'anchor answer', 3),
      userEvent('u0', 'PLUGIN-INJECTED-MARKER', 0, 'plugin'),
      toolResultEvent('TOOL-RESULT-MARKER', 5),
    ]
    const captured = captureDiscussionFromSurface(events, 'a1')
    const joined = JSON.stringify(captured.messages)
    expect(joined).not.toContain('SYSTEM-PROMPT-MARKER')
    expect(joined).not.toContain('PLUGIN-INJECTED-MARKER')
    expect(joined).not.toContain('TOOL-RESULT-MARKER')
    expect(captured.messages).toEqual([
      { role: 'user', text: 'real question' },
      { role: 'assistant', text: 'anchor answer' },
    ])
  })

  it('skips empty and whitespace-only messages without consuming bounds', () => {
    const events = [
      userEvent('u0', '   ', 0),
      userEvent('u1', 'kept', 1),
      assistantEvent('a1', '\n\n', 2),
      assistantEvent('a2', 'anchor', 3),
    ]
    const captured = captureDiscussionFromSurface(events, 'a2')
    expect(captured.messages).toEqual([
      { role: 'user', text: 'kept' },
      { role: 'assistant', text: 'anchor' },
    ])
    expect(captured.startSeq).toBe(1)
  })
})

describe('frozen bounds', () => {
  it('caps the capture at twelve visible messages', () => {
    const events: SurfaceEvent[] = []
    for (let index = 0; index < 15; index += 1) {
      events.push(userEvent(`u${index}`, `question ${index}`, index + 1))
      events.push(assistantEvent(`a${index}`, `answer ${index}`, index + 100))
    }
    const anchorSeq = 200
    events.push(assistantEvent('anchor', 'anchor answer', anchorSeq))
    const captured = captureDiscussionFromSurface(events, 'anchor')
    expect(captured.messages).toHaveLength(IDEA_CAPTURE_LIMITS.maxMessages)
    expect(captured.messages.at(-1)).toEqual({ role: 'assistant', text: 'anchor answer' })
    // The eleven events immediately before the anchor survived, not the oldest.
    expect(captured.messages[0]).toEqual({ role: 'assistant', text: 'answer 9' })
    expect(JSON.stringify(captured.messages)).not.toContain('question 0')
    expect(captured.endSeq).toBe(anchorSeq)
  })

  it('caps the capture at 12,000 normalized characters exactly', () => {
    const big = 'x'.repeat(3_000)
    const events = [
      userEvent('u1', big, 1),
      userEvent('u2', big, 2),
      userEvent('u3', big, 3),
      userEvent('u4', big, 4),
      assistantEvent('anchor', 'y'.repeat(500), 5),
    ]
    const captured = captureDiscussionFromSurface(events, 'anchor')
    expect(captured.characterCount).toBe(IDEA_CAPTURE_LIMITS.maxCharacters)
    expect(captured.messages).toHaveLength(5)
    // The message that crossed the budget was truncated, not dropped.
    expect(captured.messages[0]?.text).toContain('…[truncated]…')
  })

  it('truncates an oversized anchor deterministically instead of dropping it', () => {
    const huge = 'a'.repeat(4_000) + 'b'.repeat(4_000) + 'c'.repeat(22_000)
    const events = [assistantEvent('anchor', huge, 1)]
    const captured = captureDiscussionFromSurface(events, 'anchor')
    expect(captured.messages).toHaveLength(1)
    const text = captured.messages[0]!.text
    expect(captured.characterCount).toBe(IDEA_CAPTURE_LIMITS.maxCharacters)
    expect(text.length).toBe(IDEA_CAPTURE_LIMITS.maxCharacters)
    expect(text).toContain('\n…[truncated]…\n')
    // Useful beginning and ending text are both retained.
    expect(text.startsWith('aaaa')).toBe(true)
    expect(text.endsWith('cccc')).toBe(true)
    expect(captured.startSeq).toBe(1)
    expect(captured.endSeq).toBe(1)
  })
})

describe('normalization', () => {
  it('canonicalizes newlines, trims, and collapses blank-line runs', () => {
    expect(normalizeCapturedText('  \r\nhello\rworld\n\n\n\n\nagain  ')).toBe('hello\nworld\n\nagain')
  })

  it('preserves ordinary prose and code text', () => {
    const source = 'const x = 1;\n\nif (x) {\n  console.log(x)\n}'
    expect(normalizeCapturedText(source)).toBe(source)
  })
})
