/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { IdeaDiscussionCard } from '../src/client/IdeaDiscussionCard.tsx'
import type { IdeaDiscussionCardResult } from '../src/remote-host/types.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: keyof typeof zh) => zh[key]) as never
const card: IdeaDiscussionCardResult = {
  ideaId: 'idea_1', discussionId: 'idea_dis_1', baseVersionId: 'idea_ver_1',
  baseVersionOrdinal: 1,
  title: 'Saved idea', injection: 'pending',
}
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

describe('continued discussion card', () => {
  it('uses only the Host binding, survives remount, and changes status only after the durable read', async () => {
    let value: IdeaDiscussionCardResult | null = null
    const listeners = new Set<() => void>()
    let kind = 'append'
    const events = {
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
      getSnapshot: () => ({ change: { kind, entries: [{ type: 'event', event: { type: 'user/message' } }] } }),
    }
    const read = vi.fn(async () => ({ ok: true as const, value }))

    const first = render(<IdeaDiscussionCard read={read} events={events} t={t} />)
    await flush()
    expect(screen.queryByLabelText('关联 Idea')).toBeNull()
    value = card
    kind = 'transient'
    await act(async () => { for (const listener of listeners) listener() })
    await flush()
    expect(screen.queryByLabelText('关联 Idea')).toBeNull()
    kind = 'append'
    await act(async () => { for (const listener of listeners) listener() })
    await flush()
    expect(screen.getByLabelText('关联 Idea').textContent).toContain('v1')
    expect(screen.getByLabelText('关联 Idea').textContent).toContain('关联已建立；Idea 上下文尚未注入会话')
    first.unmount()
    expect(listeners.size).toBe(0)

    render(<IdeaDiscussionCard read={read} events={events} t={t} />)
    await flush()
    expect(screen.getAllByLabelText('关联 Idea')).toHaveLength(1)
    expect(screen.getByLabelText('关联 Idea').textContent).toContain('关联已建立；Idea 上下文尚未注入会话')
    value = { ...card, injection: 'delivered' }
    await act(async () => { for (const listener of listeners) listener() })
    await flush()
    expect(screen.getByLabelText('关联 Idea').textContent).toContain('关联已建立；Idea 上下文已注入会话')
    expect(screen.getAllByLabelText('关联 Idea')).toHaveLength(1)
  })
})
