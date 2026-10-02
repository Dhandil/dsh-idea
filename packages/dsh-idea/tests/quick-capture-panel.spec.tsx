/**
 * T12.3 — the Idea panel's information architecture (conversation side):
 * the panel title is 「Idea」, the footer carries 记录新想法 (left, opens the
 * in-panel capture subview) and 添加到对话 (right, the reference-attach
 * primary), the capture subview replaces the search body and exposes
 * ← back, back preserves the search query and the unsaved draft, a full
 * panel close clears an idle draft, an unresolved pendingUnclear survives
 * close/reopen, and the original Add-reference behavior does not regress.
 * The quick/save surfaces are real; the Host face is scripted.
 * @module tests/quick-capture-panel.spec
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { IdeaSearchCard } from '../src/client/IdeaSearchCard.tsx'
import '../src/client/styles.ts'
import { IdeaSearchSurface } from '../src/client/search-state.ts'
import { IdeaQuickCaptureSurface } from '../src/client/quick-capture-state.ts'
import { IdeaSaveSurface } from '../src/client/state.ts'
import type { SearchCardProps } from '../src/client/slots.ts'

afterEach(cleanup)

const t = ((key: string): string => {
  const zh: Record<string, string> = {
    'search.title': 'Idea',
    'search.close': '关闭',
    'search.placeholder': '搜索保存的 Idea…',
    'search.empty': '没有匹配的 Idea',
    'search.add': '添加到对话',
    'quick.title': '＋ 记录新想法',
    'quick.back': '← 记录新想法',
    'quick.placeholder': '想到什么就写下来，保存为一条 Idea…',
    'quick.saveDirect': '直接保存',
    'quick.organize': 'AI 整理',
    'quick.failed': '整理失败，原文已保留，可直接保存或重试。',
    'quick.commitFailed': '保存失败，原文已保留，可重试。',
    'quick.handoffFailed': '当前无法打开预览，原文已保留，请稍后重试。',
    'read.loading': '加载中…',
    'read.retry': '重试',
  }
  return zh[key] ?? key
}) as never

const useOf = (store: { subscribe: (fn: () => void) => () => void; getSnapshot: () => unknown }) =>
  (select: (state: never) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot() as never))

function panelRig(over: {
  prepare?: () => Promise<unknown>
  create?: () => Promise<unknown>
  attach?: (descriptor: unknown) => boolean
} = {}) {
  const remote = {
    search: vi.fn(async () => ({
      ok: true as const,
      value: [{
        id: 'idea_1', status: 'active' as const, currentVersionId: 'idea_ver_1',
        title: 'Existing idea', core: 'c', currentConclusion: '', useWhen: [],
        openQuestionsCount: 0, updatedAt: 1,
        reference: {
          ideaId: 'idea_1', versionId: 'idea_ver_1', label: 'Existing idea',
          mention: '@[Existing idea](dsh-idea:e30)',
        },
      }],
    })),
    prepareQuickCapture: over.prepare ?? vi.fn(async (_request: unknown, signal?: AbortSignal) => ({
      ok: true as const,
      value: {
        preparationId: 'prep_1' as never,
        draft: { title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [] },
      },
    })),
    create: over.create ?? vi.fn(async () => ({
      ok: true as const,
      value: { ideaId: 'idea_2', currentVersionId: 'idea_ver_2', status: 'active' as const, title: 't', createdAt: 1 },
    })),
    prepareFromMessage: vi.fn(),
  }
  const search = new IdeaSearchSurface(remote as never)
  search.open()
  const save = new IdeaSaveSurface(remote as never, { kind: 'session', sessionId: 'session-1' })
  const attach = over.attach ?? vi.fn(() => true)
  const quick = new IdeaQuickCaptureSurface(
    remote as never,
    { kind: 'session', sessionId: 'session-1' },
    {
      onPreview: p => save.openQuickPreview(p),
      onCommit: p => save.commitQuickPreview(p),
    },
  )
  const props: SearchCardProps = {
    hooks: {},
    setQuery: (query: string) => { search.setQuery(query) },
    select: (id: string) => { search.select(id) },
    retry: () => { search.retry() },
    add: (descriptor: { ideaId: string }) => {
      if (attach(descriptor)) { search.close(); quick.close() }
    },
    close: () => { search.close(); quick.close() },
    back: () => { quick.hide() },
    useSearch: useOf(search.state),
    useQuick: useOf(quick.state),
    quick: {
      open: () => { quick.open() },
      hide: () => { quick.hide() },
      close: () => { quick.close() },
      setText: (text: string) => { quick.setText(text) },
      saveDirect: () => { quick.saveDirect() },
      organize: () => { quick.organize() },
    },
    t,
  } as unknown as SearchCardProps
  return { search, save, quick, attach, props }
}

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

describe('Idea panel information architecture (T12.3)', () => {
  it('renders the Idea title and the left/right footer actions in list mode', () => {
    const { props } = panelRig()
    render(<IdeaSearchCard {...props} />)
    expect(screen.getByText('Idea')).toBeTruthy()
    expect(screen.getByPlaceholderText('搜索保存的 Idea…')).toBeTruthy()
    expect(screen.getByText('＋ 记录新想法')).toBeTruthy()
    expect(screen.getByText('添加到对话')).toBeTruthy()
    // Add is disabled before a selection.
    expect((screen.getByText('添加到对话') as HTMLButtonElement).disabled).toBe(true)
  })

  it('the capture subview replaces the search body and back restores the list', () => {
    const { quick, props } = panelRig()
    render(<IdeaSearchCard {...props} />)
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    // Capture mode: textarea visible; search input/results/Add are not.
    expect(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…')).toBeTruthy()
    expect(screen.queryByPlaceholderText('搜索保存的 Idea…')).toBeNull()
    expect(screen.queryByText('添加到对话')).toBeNull()
    expect(screen.getByText('← 记录新想法')).toBeTruthy()
    // Back returns to list mode.
    fireEvent.click(screen.getByText('← 记录新想法'))
    expect(quick.state.getSnapshot().open).toBe(false)
    expect(screen.getByPlaceholderText('搜索保存的 Idea…')).toBeTruthy()
  })

  it('back preserves the search query and the capture draft; full close clears the idle draft', () => {
    const { search, quick, props } = panelRig()
    render(<IdeaSearchCard {...props} />)
    fireEvent.change(screen.getByPlaceholderText('搜索保存的 Idea…'), { target: { value: '关键词' } })
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '未保存的草稿' } })
    fireEvent.click(screen.getByText('← 记录新想法'))
    expect(search.state.getSnapshot().query).toBe('关键词')
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    expect((screen.getByLabelText('想到什么就写下来，保存为一条 Idea…') as HTMLTextAreaElement).value).toBe('未保存的草稿')

    // A full panel close clears the idle draft...
    fireEvent.click(screen.getByLabelText('关闭'))
    expect(quick.state.getSnapshot()).toMatchObject({ open: false, text: '' })
    renderAgain(props)
    expect(screen.queryByLabelText('想到什么就写下来，保存为一条 Idea…')).toBeNull()
  })

  it('an unresolved pendingUnclear survives the panel close and reopen (R7–R10)', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { search, save, quick, props } = panelRig({
      create: async () => {
        await gate
        throw new Error('carrier down')
      },
    })
    render(<IdeaSearchCard {...props} />)
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文' } })
    fireEvent.click(screen.getByText('直接保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    release()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(quick.state.getSnapshot().failure).toBe('commit-failed')

    // The panel closes; the note and the recovery survive.
    fireEvent.click(screen.getByLabelText('关闭'))
    expect(quick.state.getSnapshot().open).toBe(false)
    expect(quick.state.getSnapshot().text).toBe('原文')

    // Reopening restores the form with the note and the failure copy.
    act(() => { search.open() })
    renderAgain(props)
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    expect((screen.getByLabelText('想到什么就写下来，保存为一条 Idea…') as HTMLTextAreaElement).value).toBe('原文')
    expect(screen.getByText('保存失败，原文已保留，可重试。')).toBeTruthy()
    void save
  })

  it('T12.3 R2: Back during an AI prepare cancels it — no late proposal modal', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let gatedSignal: AbortSignal | undefined
    const { save, quick, props } = panelRig({
      prepare: async (_request: unknown, signal?: AbortSignal) => {
        gatedSignal = signal
        await gate
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        return {
          ok: true as const,
          value: {
            preparationId: 'prep_late' as never,
            draft: { title: '迟到的提案', core: '迟到的核心', motivation: '', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [] },
          },
        }
      },
    })
    render(<IdeaSearchCard {...props} />)
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文' } })
    fireEvent.click(screen.getByText('AI 整理'))
    expect(quick.state.getSnapshot().preparing).toBe('ai')

    // Back during the AI prepare: the subview returns to the list with the
    // note preserved, and the prepare is cancelled.
    fireEvent.click(screen.getByText('← 记录新想法'))
    expect(quick.state.getSnapshot()).toMatchObject({ open: false, text: '原文', preparing: 'none' })
    release()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

    // No late proposal modal may appear after the panel left capture mode.
    expect(gatedSignal?.aborted).toBe(true)
    expect(save.state.getSnapshot().modal).toBeNull()
    // The list is usable again.
    expect(screen.getByPlaceholderText('搜索保存的 Idea…')).toBeTruthy()
  })

  it('T12.3 R4: the footer layout is phase-scoped — list spreads, capture right-aligns', () => {
    const { props } = panelRig()
    render(<IdeaSearchCard {...props} />)

    // List mode: the footer carries the -list modifier, whose frozen rule
    // spreads the secondary and primary actions to opposite edges.
    const listFoot = document.querySelector('footer.dsh-idea-search-foot') as HTMLElement
    expect(listFoot.className).toContain('dsh-idea-search-foot-list')
    expect(listFoot.className).not.toContain('dsh-idea-search-foot-capture')

    // The injected stylesheet actually implements the frozen layouts (not
    // just class names): space-between for the list, flex-end for capture.
    const css = document.querySelector('style[data-plugin-css]')?.textContent ?? ''
    expect(css).toMatch(/\.dsh-idea-search-foot-list\s*{[^}]*justify-content:\s*space-between/)
    expect(css).toMatch(/\.dsh-idea-search-foot-capture\s*{[^}]*justify-content:\s*flex-end/)

    // Capture mode switches the footer to the right-aligned modifier.
    fireEvent.click(screen.getByText('＋ 记录新想法'))
    const captureFoot = document.querySelector('footer.dsh-idea-search-foot') as HTMLElement
    expect(captureFoot.className).toContain('dsh-idea-search-foot-capture')
    expect(captureFoot.className).not.toContain('dsh-idea-search-foot-list')
    // Both capture actions stay grouped in this footer.
    expect(captureFoot.textContent).toContain('AI 整理')
    expect(captureFoot.textContent).toContain('直接保存')
  })

  it('the Add path still attaches the pinned reference and closes the panel', async () => {
    const { attach, props } = panelRig()
    render(<IdeaSearchCard {...props} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    fireEvent.change(screen.getByPlaceholderText('搜索保存的 Idea…'), { target: { value: 'Existing' } })
    await flush()
    fireEvent.click(screen.getByRole('option'))
    fireEvent.click(screen.getByText('添加到对话'))
    expect(attach).toHaveBeenCalledTimes(1)
  })
})

function renderAgain(props: SearchCardProps): void {
  cleanup()
  render(<IdeaSearchCard {...props} />)
}
