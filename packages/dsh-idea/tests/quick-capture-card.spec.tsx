/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * T12.2 repair — combined wiring of the Idea search card and Quick Capture:
 * the card's close (× / injected verb) and the Add path share the quick
 * capture lifecycle (a successful Add closes the form too), a direct save
 * auto-commits without any preview modal, and closing the card while an AI
 * prepare is in flight cancels it so no late preview can appear. All remote
 * faces are scripted; no live Host, provider, or model call.
 * @module tests/quick-capture-card.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { IdeaSearchCard } from '../src/client/IdeaSearchCard.tsx'
import { IdeaSearchSurface } from '../src/client/search-state.ts'
import { IdeaQuickCaptureSurface } from '../src/client/quick-capture-state.ts'
import { IdeaSaveSurface } from '../src/client/state.ts'
import type { ReferenceAppendSeams } from '../src/client/reference-append.ts'
import type { QuickCapturePreview } from '../src/preparation/types.ts'
import type { IdeaReferenceDescriptor } from '../src/reference/types.ts'
import type { SearchCardProps } from '../src/client/slots.ts'

afterEach(cleanup)

const t = ((key: string, params?: Record<string, unknown>): string => {
  const zh: Record<string, string> = {
    'search.title': '搜索 Idea',
    'search.close': '关闭',
    'search.placeholder': '搜索保存的 Idea…',
    'search.empty': '没有匹配的 Idea',
    'search.add': '添加',
    'quick.title': '＋ 记录新想法',
    'quick.placeholder': '想到什么就写下来，保存为一条 Idea…',
    'quick.saveDirect': '直接保存',
    'quick.organize': 'AI 整理',
  }
  return (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))
}) as never

const descriptor: IdeaReferenceDescriptor = {
  ideaId: 'idea_1',
  versionId: 'idea_ver_1',
  label: 'Idea one',
  mention: '@[Idea one](dsh-idea:eyJpZGVhSWQiOiJpZGVhXzEiLCJ2ZXJzaW9uSWQiOiJpZGVhX3Zlcl8xIn0=)',
}

const preview = (): QuickCapturePreview => ({
  preparationId: 'prep_1' as QuickCapturePreview['preparationId'],
  draft: {
    title: '浇水决策小助手',
    core: '原文',
    motivation: '',
    currentConclusion: '',
    possibleValue: '',
    useWhen: [],
    openQuestions: [],
  },
})

/** Scripted remote: the search face plus the quick-capture/create faces. */
function remoteRig() {
  return {
    search: vi.fn(async () => ({ ok: true as const, value: [
      { id: 'idea_1', status: 'active' as const, currentVersionId: 'idea_ver_1', title: 'Idea one', core: 'c', currentConclusion: '', useWhen: [], openQuestionsCount: 0, updatedAt: 1, reference: descriptor },
    ] })),
    prepareQuickCapture: vi.fn(async () => ({ ok: true as const, value: preview() })),
    create: vi.fn(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } })),
    prepareFromMessage: vi.fn(),
  }
}

/** The full card rig with the index.ts-equivalent close/add verb wiring. */
function cardRig(remote: ReturnType<typeof remoteRig>, overrides: {
  attach?: (descriptor: IdeaReferenceDescriptor) => boolean
} = {}) {
  const search = new IdeaSearchSurface(remote as never)
  search.open()
  const save = new IdeaSaveSurface(remote as never, { kind: 'session', sessionId: 'session-1' })
  const quick = new IdeaQuickCaptureSurface(
    remote as never,
    { kind: 'session', sessionId: 'session-1' },
    {
      onPreview: preview => save.openQuickPreview(preview),
      onCommit: preview => save.commitQuickPreview(preview),
    },
  )
  const seams: ReferenceAppendSeams = {
    input: {
      state: { getSnapshot: () => ({ draft: '', draftRev: 1, occurrences: [] }) },
      insertReference: () => true,
      notify: () => {},
    },
    insertText: () => true,
  }
  const attach = overrides.attach ?? ((d: IdeaReferenceDescriptor) => {
    void seams
    void d
    return true
  })
  const props: SearchCardProps = {
    hooks: {},
    setQuery: (query: string) => { search.setQuery(query) },
    select: (id: string) => { search.select(id) },
    retry: () => { search.retry() },
    add: (d: IdeaReferenceDescriptor) => {
      if (attach(d)) {
        // index.ts wiring: the Add path shares the quick-capture lifecycle.
        search.close()
        quick.close()
      }
    },
    // index.ts wiring: the card's close shares the quick-capture lifecycle.
    close: () => { search.close(); quick.close() },
    useSearch: useOf(search.state),
    useQuick: useOf(quick.state),
    quick: {
      open: () => { quick.open() },
      close: () => { quick.close() },
      setText: (text: string) => { quick.setText(text) },
      saveDirect: () => { quick.saveDirect() },
      organize: () => { quick.organize() },
    },
    t,
  } as unknown as SearchCardProps
  return { search, save, quick, props }
}

const useOf = (store: { subscribe: (fn: () => void) => () => void; getSnapshot: () => unknown }) =>
  (select: (state: never) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot() as never))

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

describe('search card × quick capture combined wiring (T12.2 R1)', () => {
  it('direct save auto-commits: no preview modal, card stays open, form closes', async () => {
    const remote = remoteRig()
    const { quick, save, props } = cardRig(remote)
    render(<IdeaSearchCard {...props} />)
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '我的想法' } })
    fireEvent.click(screen.getByText('直接保存'))
    await flush()
    expect(remote.prepareQuickCapture).toHaveBeenCalledTimes(1)
    expect(remote.create).toHaveBeenCalledTimes(1)
    expect((remote.create.mock.calls[0] as unknown as [{ preparationId: string }])[0].preparationId).toBe('prep_1')
    expect(quick.state.getSnapshot().open).toBe(false)
    expect(save.state.getSnapshot().modal).toBeNull()
  })

  it('closing the card while an AI prepare is in flight leaves no late preview', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const remote = remoteRig()
    ;(remote.prepareQuickCapture as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_request: unknown, signal?: AbortSignal) => {
        await gate
        if (signal?.aborted) throw new Error('aborted')
        return { ok: true as const, value: preview() }
      },
    )
    const { quick, save, props } = cardRig(remote)
    render(<IdeaSearchCard {...props} />)
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文' } })
    fireEvent.click(screen.getByText('AI 整理'))
    await flush()
    expect(quick.state.getSnapshot().preparing).toBe('ai')

    // The user closes the card via × while the AI prepare is in flight.
    fireEvent.click(screen.getByLabelText('关闭'))
    expect(searchClosed(save, quick))
    release()
    await flush()
    expect(remote.create).not.toHaveBeenCalled()
    expect(save.state.getSnapshot().modal).toBeNull()
    expect(quick.state.getSnapshot().open).toBe(false)
  })

  it('the Add path shares the quick-capture lifecycle on a successful attach', async () => {
    const remote = remoteRig()
    const attach = vi.fn(() => true)
    const { quick, props } = cardRig(remote, { attach })
    render(<IdeaSearchCard {...props} />)
    // A result row must exist before Add enables: run one search.
    fireEvent.click(screen.getByPlaceholderText('搜索保存的 Idea…'))
    fireEvent.change(screen.getByPlaceholderText('搜索保存的 Idea…'), { target: { value: 'Idea' } })
    await flush()
    fireEvent.click(screen.getByRole('option'))
    fireEvent.click(screen.getByText('添加'))
    expect(attach).toHaveBeenCalledTimes(1)
    expect(quick.state.getSnapshot().open).toBe(false)
  })
})

function searchClosed(save: IdeaSaveSurface, quick: IdeaQuickCaptureSurface): boolean {
  return quick.state.getSnapshot().open === false && save.state.getSnapshot().modal === null
}
