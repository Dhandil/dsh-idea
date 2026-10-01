/**
 * T12.3 — Settings → Ideas creation entry: the ＋ 新建 Idea first-class
 * action is visible in Current, Archived, and search states; it opens the
 * in-section create subview backed by the shared `default` route pipeline;
 * a direct-save success switches to Current, clears the search query, and
 * force-reloads the list; an AI proposal is editable and user-confirmed; a
 * failure keeps the text; and the root-scoped surfaces preserve drafts and
 * the same-ID recovery authority across section unmount/remount. The Host
 * face is scripted; no live provider.
 * @module tests/library-create.spec.tsx
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { IdeaSection } from '../src/client/IdeaSection.tsx'
import { IdeaReadSurface } from '../src/client/read-state.ts'
import { IdeaQuickCaptureSurface } from '../src/client/quick-capture-state.ts'
import { IdeaSaveSurface, requiredPresent } from '../src/client/state.ts'
import type { IdeaSectionProps } from '../src/client/slots.ts'

afterEach(cleanup)

const t = ((key: string, params?: Record<string, unknown>): string => {
  const zh: Record<string, string> = {
    'read.nav': 'Ideas',
    'read.search.placeholder': '搜索全部 Idea…',
    'read.tab.current': '当前',
    'read.tab.archived': '已归档',
    'read.loading': '加载中…',
    'read.retry': '重试',
    'read.error': '读取失败',
    'read.empty': '暂无 Idea',
    'read.emptyArchived': '暂无已归档 Idea',
    'read.back': '返回列表',
    'read.updated': '{time}',
    'read.status.archived': '已归档',
    'library.newIdea': '＋ 新建 Idea',
    'library.createBack': '← 新建 Idea',
    'quick.title': '＋ 记录新想法',
    'quick.placeholder': '想到什么就写下来，保存为一条 Idea…',
    'quick.saveDirect': '直接保存',
    'quick.saving': '保存中…',
    'quick.organize': 'AI 整理',
    'quick.organizing': 'AI 整理中…',
    'quick.failed': '整理失败，原文已保留，可直接保存或重试。',
    'quick.commitFailed': '保存失败，原文已保留，可重试。',
    'quick.handoffFailed': '当前无法打开预览，原文已保留，请稍后重试。',
    'dialog.title': '保存 Idea',
    'dialog.sourceQuick': '来源：快捷捕获',
    'dialog.cancel': '取消',
    'dialog.save': '保存',
    'dialog.saving': '保存中…',
    'dialog.close': '关闭',
    'field.title': '标题',
    'field.core': '核心想法',
    'search.title': 'Idea',
    'search.empty': '没有匹配的 Idea',
  }
  return (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))
}) as never

const row = (id: string, status: 'active' | 'archived', title: string) => ({
  id, status, currentVersionId: `${id}_ver`, title, core: 'c',
  currentConclusion: '', useWhen: [], openQuestionsCount: 0, updatedAt: 1,
})

function createRig(over: {
  create?: () => Promise<unknown>
  list?: () => Promise<unknown>
} = {}) {
  const remote = {
    list: over.list ?? vi.fn(async () => ({ ok: true as const, value: [] })),
    search: vi.fn(async () => ({ ok: true as const, value: [] })),
    get: vi.fn(async () => ({ ok: false as const, error: { code: 'idea/not-found' } })),
    getVersions: vi.fn(async () => ({ ok: false as const, error: { code: 'idea/not-found' } })),
    continueDiscussion: vi.fn(),
    relatedFromMessage: vi.fn(),
    prepareQuickCapture: vi.fn(async () => ({
      ok: true as const,
      value: {
        preparationId: 'prep_1' as never,
        draft: {
          title: '新想法标题',
          core: '新想法核心',
          motivation: '为什么要保留',
          currentConclusion: '当前结论',
          possibleValue: '可能的落地价值',
          useWhen: ['讨论产品定位时'],
          openQuestions: ['怎么冷启动？'],
        },
      },
    })),
    create: over.create ?? vi.fn(async () => ({
      ok: true as const,
      value: { ideaId: 'idea_new', currentVersionId: 'idea_ver_new', status: 'active' as const, title: '新想法标题', createdAt: 1 },
    })),
    prepareFromMessage: vi.fn(),
  }
  const readSurface = new IdeaReadSurface(remote as never, vi.fn(), vi.fn(async () => undefined))
  const save = new IdeaSaveSurface(remote as never, { kind: 'default' })
  const quick = new IdeaQuickCaptureSurface(
    remote as never,
    { kind: 'default' },
    {
      onPreview: p => save.openQuickPreview(p),
      onCommit: p => save.commitQuickPreview(p),
    },
  )
  // Mirror the index.ts R3 wiring: the success transition is a root-scoped
  // save-state subscription, independent of the section's React mount.
  let lastLibraryToastSeq = save.state.getSnapshot().toastSeq
  save.state.subscribe(() => {
    const snapshot = save.state.getSnapshot()
    if (snapshot.toastSeq !== lastLibraryToastSeq) {
      lastLibraryToastSeq = snapshot.toastSeq
      readSurface.refreshToCurrent()
    }
  })
  const useOf = (store: { subscribe: (fn: () => void) => () => void; getSnapshot: () => unknown }) =>
    (select: (state: never) => unknown) =>
      useSyncExternalStore(store.subscribe, () => select(store.getSnapshot() as never))
  const props: IdeaSectionProps = {
    hooks: {
      ideaRead: readSurface.state,
      libraryQuick: quick.state,
      librarySave: save.state,
    },
    load: () => { readSurface.load() },
    searchIdeas: (query: string) => { readSurface.searchIdeas(query) },
    selectView: (view: 'current' | 'archived') => { readSurface.selectView(view) },
    open: (id: string) => { readSurface.open(id) },
    closeDetail: () => { readSurface.closeDetail() },
    openEditor: (id: string) => { readSurface.openEditor(id) },
    continueIdea: (id: string) => { readSurface.continueDiscussion(id) },
    prepareEvolution: () => { readSurface.prepareEvolution() },
    editProposalDraft: (patch: never) => { readSurface.editProposalDraft(patch) },
    cancelProposal: () => { readSurface.cancelProposal() },
    commitProposal: () => { readSurface.commitProposal() },
    editDraft: (patch: never) => { readSurface.editDraft(patch) },
    cancelEdit: () => { readSurface.cancelEdit() },
    saveEdit: () => { readSurface.commitEdit() },
    archiveIdea: () => { readSurface.archiveIdea() },
    restoreIdea: () => { readSurface.restoreIdea() },
    requestDelete: () => { readSurface.requestDelete() },
    cancelDelete: () => { readSurface.cancelDelete() },
    confirmDelete: () => { readSurface.confirmDelete() },
    libraryQuick: {
      open: () => { quick.open() },
      hide: () => { quick.hide() },
      close: () => { quick.close() },
      back: () => { quick.hide() },
      setText: (text: string) => { quick.setText(text) },
      saveDirect: () => { quick.saveDirect() },
      organize: () => { quick.organize() },
    },
    librarySave: {
      editDraft: (patch: never) => { save.editDraft(patch) },
      submitQuick: () => { save.submit() },
      cancelQuick: () => { save.cancel() },
    },
    useIdeaRead: useOf(readSurface.state),
    useLibraryQuick: useOf(quick.state),
    useLibrarySave: useOf(save.state),
    t,
  } as unknown as IdeaSectionProps
  return { readSurface, save, quick, remote, props }
}

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

describe('Settings → Ideas creation entry (T12.3)', () => {
  it('shows ＋ 新建 Idea in Current, Archived, and search states', async () => {
    const { props, readSurface } = createRig()
    render(<IdeaSection {...props} />)
    await flush()
    expect(screen.getByText('＋ 新建 Idea')).toBeTruthy()
    act(() => { readSurface.selectView('archived') })
    expect(screen.getByText('＋ 新建 Idea')).toBeTruthy()
    act(() => { readSurface.searchIdeas('关键词') })
    expect(screen.getByText('＋ 新建 Idea')).toBeTruthy()
  })

  it('opens the create subview; back preserves the draft; re-entry restores it', () => {
    const { quick, props } = createRig()
    render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '库里的草稿' } })
    fireEvent.click(screen.getByText('← 新建 Idea'))
    expect(quick.state.getSnapshot().open).toBe(false)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    expect((screen.getByLabelText('想到什么就写下来，保存为一条 Idea…') as HTMLTextAreaElement).value).toBe('库里的草稿')
  })

  it('a direct-save success switches to Current, clears the search, and reloads', async () => {
    const list = vi.fn(async () => ({ ok: true as const, value: [row('idea_new', 'active', '新想法标题')] }))
    const { props, readSurface } = createRig({ list })
    render(<IdeaSection {...props} />)
    await flush()
    // Enter a search state first: the success must clear it.
    act(() => { readSurface.searchIdeas('旧关键词') })
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '新想法原文' } })
    fireEvent.click(screen.getByText('直接保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(readSurface.state.getSnapshot().searchQuery).toBe('')
    expect(readSurface.state.getSnapshot().view).toBe('current')
    expect(readSurface.state.getSnapshot().lists.current.status).toBe('ready')
    expect(readSurface.state.getSnapshot().lists.current.items.some(i => i.id === 'idea_new')).toBe(true)
    // The create subview is gone.
    expect(screen.queryByLabelText('想到什么就写下来，保存为一条 Idea…')).toBeNull()
  })

  it('R1: an AI proposal previews and edits ALL SEVEN fields before the commit', async () => {
    const { props, remote } = createRig()
    render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原始原文' } })
    fireEvent.click(screen.getByText('AI 整理'))
    await flush()

    // Every one of the seven prepared fields is visible and editable.
    expect(screen.getByDisplayValue('新想法标题')).toBeTruthy()
    expect(screen.getByDisplayValue('新想法核心')).toBeTruthy()
    expect(screen.getByDisplayValue('为什么要保留')).toBeTruthy()
    expect(screen.getByDisplayValue('当前结论')).toBeTruthy()
    expect(screen.getByDisplayValue('可能的落地价值')).toBeTruthy()
    expect(screen.getByDisplayValue('讨论产品定位时')).toBeTruthy()
    expect(screen.getByDisplayValue('怎么冷启动？')).toBeTruthy()

    // Edit two of them — including one that the old UI hid (motivation).
    fireEvent.change(screen.getByDisplayValue('新想法标题'), { target: { value: '改过的标题' } })
    fireEvent.change(screen.getByDisplayValue('为什么要保留'), { target: { value: '改过的动机' } })
    fireEvent.click(screen.getByText('保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })

    const call = (remote.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      preparationId: string
      draft: Record<string, string>
    }
    expect(call.preparationId).toBe('prep_1')
    expect(call.draft.title).toBe('改过的标题')
    expect(call.draft.motivation).toBe('改过的动机')
    // Unmodified fields round-trip byte-identically from the proposal.
    expect(call.draft.core).toBe('新想法核心')
    expect(call.draft.currentConclusion).toBe('当前结论')
    expect(call.draft.possibleValue).toBe('可能的落地价值')
    expect(call.draft.useWhen).toEqual(['讨论产品定位时'])
    expect(call.draft.openQuestions).toEqual(['怎么冷启动？'])
  })

  it('R1: requiredPresent still gates on title + core only (D1)', () => {
    expect(requiredPresent({
      title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhenText: '', openQuestionsText: '',
    })).toBe(true)
    expect(requiredPresent({
      title: '', core: 'c', motivation: 'm', currentConclusion: '', possibleValue: '', useWhenText: '', openQuestionsText: '',
    })).toBe(false)
  })

  it('a failed create keeps the text and stays in the create view', async () => {
    const { props } = createRig({
      create: async () => ({ ok: false as const, error: { code: 'idea/storage-failed' } }),
    })
    render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '失败的原文' } })
    fireEvent.click(screen.getByText('直接保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect((screen.getByLabelText('想到什么就写下来，保存为一条 Idea…') as HTMLTextAreaElement).value).toBe('失败的原文')
    expect(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…')).toBeTruthy()
  })

  it('an unresolved recovery survives section unmount and remount', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { props, quick, save, remote } = createRig()
    ;(remote.create as unknown as {
      mockImplementation: (impl: () => Promise<unknown>) => void
    }).mockImplementation(async () => { throw new Error('carrier down') })
    const createMock = remote.create as unknown as {
      mockImplementationOnce: (impl: () => Promise<unknown>) => void
    }
    createMock.mockImplementationOnce(async () => {
      await gate
      throw new Error('carrier down')
    })
    const first = render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文' } })
    fireEvent.click(screen.getByText('直接保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

    // Unmount the section (settings navigation): the root-scoped surfaces
    // keep the draft and the recovery authority.
    first.unmount()
    release()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    console.log('DBG', JSON.stringify(quick.state.getSnapshot()), 'submitting:', save.state.getSnapshot().submitting, 'createCalls:', (remote.create as unknown as { mock: { calls: unknown[] } }).mock.calls.length)
    expect(quick.state.getSnapshot().failure).toBe('commit-failed')
    expect(quick.state.getSnapshot().text).toBe('原文')

    // Remount: reopening the create view restores everything.
    createMock.mockImplementationOnce(async () => ({
      ok: true as const,
      value: { ideaId: 'idea_new', currentVersionId: 'idea_ver_new', status: 'active' as const, title: 't', createdAt: 1 },
    }))
    const second = render(<IdeaSection {...props} />)
    // The create subview resumes automatically (the create session is still
    // open after the unmount window) with the note and the failure visible.
    expect((screen.getByLabelText('想到什么就写下来，保存为一条 Idea…') as HTMLTextAreaElement).value).toBe('原文')
    expect(screen.getByText('保存失败，原文已保留，可重试。')).toBeTruthy()
    fireEvent.click(screen.getByText('直接保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(quick.state.getSnapshot().text).toBe('')
    second.unmount()
  })
})


describe('T12.3 R2/R3 — phase-aware create Back and root-scoped success', () => {
  let gatedRelease!: () => void

  const backRig = () => {
    const rig = createRig()
    ;(rig.remote.prepareQuickCapture as unknown as {
      mockImplementationOnce: (f: (_request: unknown, signal?: AbortSignal) => Promise<unknown>) => void
    }).mockImplementationOnce(async (_request: unknown, signal?: AbortSignal) => {
      await new Promise<void>((resolve) => { gatedRelease = resolve })
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return {
        ok: true as const,
        value: {
          preparationId: 'prep_2' as never,
          draft: {
            title: '迟到的提案', core: '迟到的核心', motivation: '', currentConclusion: '',
            possibleValue: '', useWhen: [], openQuestions: [],
          },
        },
      }
    })
    return rig
  }

  it('R2-B: settings AI prepare → Back cancels it → no late proposal, draft kept', async () => {
    const { props, quick, save } = backRig()
    render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文要保留' } })
    fireEvent.click(screen.getByText('AI 整理'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(quick.state.getSnapshot().preparing).toBe('ai')

    fireEvent.click(screen.getByText('← 新建 Idea'))
    expect(quick.state.getSnapshot()).toMatchObject({ open: false, text: '原文要保留', preparing: 'none' })
    gatedRelease()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(save.state.getSnapshot().modal).toBeNull()

    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    expect((screen.getByLabelText('想到什么就写下来，保存为一条 Idea…') as HTMLTextAreaElement).value).toBe('原文要保留')
  })

  it('R2-C: settings AI proposal → Back cancels the proposal safely and returns to the library', async () => {
    const { props, quick, save } = createRig()
    render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文' } })
    fireEvent.click(screen.getByText('AI 整理'))
    await flush()
    expect(save.state.getSnapshot().modal).not.toBeNull()

    fireEvent.click(screen.getByText('← 新建 Idea'))
    expect(save.state.getSnapshot().modal).toBeNull()
    expect(quick.state.getSnapshot().open).toBe(false)
    // Zero durable writes: the preparation was simply abandoned.
    expect(save.state.getSnapshot().submitting).toBe(false)
    // The library is visible again.
    expect(screen.getByText('＋ 新建 Idea')).toBeTruthy()
  })

  it('R2-D: Back during a direct commit cannot discard the note or the recovery', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { props, quick, remote } = createRig()
    ;(remote.create as unknown as {
      mockImplementation: (f: () => Promise<unknown>) => void
    }).mockImplementation(async () => { throw new Error('carrier down') })
    ;(remote.create as unknown as {
      mockImplementationOnce: (f: () => Promise<unknown>) => void
    }).mockImplementationOnce(async () => {
      await gate
      throw new Error('carrier down')
    })
    render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文' } })
    fireEvent.click(screen.getByText('直接保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

    fireEvent.click(screen.getByText('← 新建 Idea'))
    expect(quick.state.getSnapshot().text).toBe('原文')
    release()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(quick.state.getSnapshot().failure).toBe('commit-failed')
    expect(quick.state.getSnapshot().text).toBe('原文')
  })

  it('R3: the success transition runs while the section is unmounted', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { props, readSurface, remote } = createRig({
      list: async () => ({ ok: true as const, value: [row('idea_new', 'active', '新想法标题')] }),
    })
    ;(remote.create as unknown as {
      mockImplementationOnce: (f: () => Promise<unknown>) => void
    }).mockImplementationOnce(async () => {
      await gate
      return { ok: true as const, value: { ideaId: 'idea_new', currentVersionId: 'idea_ver_new', status: 'active' as const, title: 't', createdAt: 1 } }
    })
    render(<IdeaSection {...props} />)
    fireEvent.click(screen.getByText('＋ 新建 Idea'))
    fireEvent.change(screen.getByLabelText('想到什么就写下来，保存为一条 Idea…'), { target: { value: '原文' } })
    fireEvent.click(screen.getByText('直接保存'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

    cleanup()
    release()
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

    expect(readSurface.state.getSnapshot().searchQuery).toBe('')
    expect(readSurface.state.getSnapshot().view).toBe('current')
    expect(readSurface.state.getSnapshot().lists.current.status).toBe('ready')

    render(<IdeaSection {...props} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    expect(readSurface.state.getSnapshot().lists.current.items.some(i => i.id === 'idea_new')).toBe(true)
  })
})
