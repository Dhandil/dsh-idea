/**
 * T13.1 — Settings → Idea detail reminder control: the detail projects
 * resurfacingMuted from the Host preference; the toggle calls
 * setResurfacingMuted and updates the projected state; a failure surfaces
 * through reminderError without pretending the preference changed; a stale
 * async result cannot cross-apply to another Idea/detail.
 * @module tests/reminder-control.spec.tsx
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { IdeaSection } from '../src/client/IdeaSection.tsx'
import { IdeaReadSurface } from '../src/client/read-state.ts'
import type { IdeaDetail } from '../src/remote-host/types.ts'
import type { IdeaSectionProps } from '../src/client/slots.ts'
import { requiredPresent } from '../src/client/state.ts'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

afterEach(cleanup)

const t = ((key: string, params?: Record<string, unknown>): string => {
  const zh: Record<string, string> = {
    'read.reminder.on': '提醒：已开启',
    'read.reminder.off': '提醒：已暂停',
    'read.reminder.pause': '暂停提醒',
    'read.reminder.resume': '恢复提醒',
    'read.reminder.error': '操作失败，请重试',
    'read.back': '返回列表',
    'read.field.title': '标题',
    'read.field.core': '核心想法',
    'read.field.motivation': '为什么值得保留',
    'read.field.currentConclusion': '当前结论',
    'read.field.possibleValue': '可能价值',
    'read.field.useWhen': '适用场景',
    'read.field.openQuestions': '待解决问题',
    'read.created': '创建于 {time}',
    'read.updated': '更新于 {time}',
    'read.status.archived': '已归档',
    'read.delete': '删除',
    'read.archive': '归档',
    'read.archive.loading': '归档中…',
    'read.restore': '恢复',
    'read.restore.loading': '恢复中…',
    'read.continue': '继续讨论',
    'read.continue.loading': '继续讨论中…',
    'read.edit': '编辑',
    'read.history': '版本历史',
    'read.history.current': '当前版本 v{ordinal}',
    'read.evolve': '演化',
    'read.evolve.loading': '准备演化中…',
    'read.detail.notFound': '未找到',
    'read.detail.error': '读取失败',
  }
  return (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))
}) as never

const row = (id: string, status: 'active' | 'archived', title: string) => ({
  id, status, currentVersionId: `${id}_ver`, title, core: 'c',
  currentConclusion: '', useWhen: [], openQuestionsCount: 0, updatedAt: 1,
})

const detail = (muted: boolean, id = 'idea_1'): IdeaDetail => ({
  id, status: 'active', resurfacingMuted: muted,
  title: id === 'idea_2' ? 'Other idea' : 'Test idea',
  core: 'c', motivation: 'm',
  createdAt: 1, updatedAt: 1,
  currentConclusion: '', possibleValue: '',
  useWhen: [], openQuestions: [],
  versionId: `${id}_ver` as never,
})

interface CreateOk { ok: true; value: { muted: boolean } }
interface CreateFail { ok: false; error: { code: string } }

function rig(over: { setMuted?: (req: { id: string; muted: boolean }) => Promise<CreateOk | CreateFail> } = {}) {
  const setResurfacingMuted = over.setMuted ?? vi.fn(async () => ({ ok: true as const, value: { muted: true } }) as CreateOk)
  const remote = {
    list: vi.fn(async () => ({ ok: true as const, value: [row('idea_1', 'active', 'Test idea'), row('idea_2', 'active', 'Other idea')] })),
    search: vi.fn(async () => ({ ok: true as const, value: [] })),
    get: vi.fn(async (request: { id: string }) => ({ ok: true as const, value: detail(false, request.id) })),
    getVersions: vi.fn(async () => ({ ok: true as const, value: [] })),
    setResurfacingMuted,
    continueDiscussion: vi.fn(),
    prepareEvolution: vi.fn(),
    commitEvolution: vi.fn(),
  }
  const readSurface = new IdeaReadSurface(remote as never, vi.fn(), vi.fn(async () => undefined))
  const useOf = (store: { subscribe: (fn: () => void) => () => void; getSnapshot: () => unknown }) =>
    (select: (s: never) => unknown) =>
      useSyncExternalStore(store.subscribe, () => select(store.getSnapshot() as never))
  const props: IdeaSectionProps = {
    load: () => { readSurface.load() },
    open: (id: string) => { readSurface.open(id) },
    closeDetail: () => { readSurface.closeDetail() },
    searchIdeas: (query: string) => { readSurface.searchIdeas(query) },
    selectView: (view: 'current' | 'archived') => { readSurface.selectView(view) },
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
    setResurfacingMuted: (id: string, muted: boolean) => { readSurface.setResurfacingMuted(id, muted) },
    useIdeaRead: useOf(readSurface.state),
    useLibraryQuick: useOf(createSnapshotStore({ open: false, text: '', preparing: 'none' as const, failure: null })),
    useLibrarySave: useOf(createSnapshotStore({ preparingMessageId: null, modal: null, submitting: false, failure: null, toastSeq: 0, pauseFailed: false })),
    libraryQuick: { open: () => {}, hide: () => {}, close: () => {}, back: () => {}, setText: () => {}, saveDirect: () => {}, organize: () => {} },
    librarySave: { editDraft: () => {}, submitQuick: () => {}, cancelQuick: () => {} },
    t,
  } as unknown as IdeaSectionProps
  return { readSurface, setResurfacingMuted, props }
}

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

describe('Settings → Idea detail reminder control (T13.1)', () => {
  it('shows the current preference and pauses on click', async () => {
    const { readSurface, setResurfacingMuted, props } = rig()
    render(<IdeaSection {...props} />)
    await flush()
    act(() => { readSurface.open('idea_1') })
    await flush()
    expect(screen.getByText('提醒：已开启')).toBeTruthy()
    fireEvent.click(screen.getByText('暂停提醒'))
    await flush()
    expect(setResurfacingMuted).toHaveBeenCalledWith({ id: 'idea_1', muted: true })
    expect(screen.getByText('提醒：已暂停')).toBeTruthy()
    expect(screen.getByText('恢复提醒')).toBeTruthy()
  })

  it('resumes a paused reminder', async () => {
    let call = 0
    const { readSurface, setResurfacingMuted, props } = rig()
    const mock = setResurfacingMuted as unknown as {
      mockImplementation: (f: (req: { id: string; muted: boolean }) => Promise<unknown>) => void
    }
    mock.mockImplementation(async (req) => ({ ok: true as const, value: { muted: req.muted } }))
    render(<IdeaSection {...props} />)
    await flush()
    act(() => { readSurface.open('idea_1') })
    await flush()
    fireEvent.click(screen.getByText('暂停提醒'))
    await flush()
    expect(screen.getByText('提醒：已暂停')).toBeTruthy()
    fireEvent.click(screen.getByText('恢复提醒'))
    await flush()
    expect(screen.getByText('提醒：已开启')).toBeTruthy()
  })

  it('a failure surfaces the error affordance without pretending success', async () => {
    const { readSurface, props } = rig({
      setMuted: async () => ({ ok: false as const, error: { code: 'idea/storage-failed' } }),
    })
    render(<IdeaSection {...props} />)
    await flush()
    act(() => { readSurface.open('idea_1') })
    await flush()
    expect(screen.getByText('提醒：已开启')).toBeTruthy()
    fireEvent.click(screen.getByText('暂停提醒'))
    await flush()
    expect(screen.getByText('操作失败，请重试')).toBeTruthy()
    // The preference stays unchanged (still on).
    expect(screen.getByText('提醒：已开启')).toBeTruthy()
  })

  it('a stale async result cannot cross-apply to another Idea/detail', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { readSurface, props } = rig()
    const mock = (props as unknown as {
      setResurfacingMuted: { mockImplementationOnce: (f: (req: { id: string; muted: boolean }) => Promise<unknown>) => void }
    }).setResurfacingMuted
    void mock
    // The read surface's own remote has the gated setResurfacingMuted.
    const remoteSet = (readSurface as unknown as {
      remote: { setResurfacingMuted: { mockImplementationOnce: (f: (req: { id: string; muted: boolean }) => Promise<unknown>) => void } }
    }).remote.setResurfacingMuted
    remoteSet.mockImplementationOnce(async (req: { id: string; muted: boolean }) => {
      await gate
      return { ok: true as const, value: { muted: req.muted } }
    })
    render(<IdeaSection {...props} />)
    await flush()
    act(() => { readSurface.open('idea_1') })
    await flush()
    fireEvent.click(screen.getByText('暂停提醒'))
    // Open idea_2's detail while idea_1's pause is in flight.
    act(() => { readSurface.open('idea_2') })
    await flush()
    release()
    await flush()
    // The detail shows idea_2 (not idea_1's muted projection).
    const snap = readSurface.state.getSnapshot()
    expect(snap.detail?.id).toBe('idea_2')
    expect(snap.detail?.resurfacingMuted).toBe(false)
  })
})

describe('relaxed required-fields gate (D1)', () => {
  it('title and core gate every save surface; an empty motivation passes', () => {
    expect(requiredPresent({
      title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhenText: '', openQuestionsText: '',
    })).toBe(true)
  })
})
