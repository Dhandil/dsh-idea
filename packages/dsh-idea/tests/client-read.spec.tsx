/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the read-only Ideas settings section: list
 * rendering (title, core, created time, source indicator), detail opening
 * with full fields and source linkage, and the empty/error states. The Host
 * face is a scripted IdeaReadFace; no live Host, provider, or model call.
 * @module tests/client-read.spec
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IdeaReadSurface } from '../src/client/read-state.ts'
import type { IdeaReadFace, IdeaReadState } from '../src/client/read-state.ts'
import { IdeaSection } from '../src/client/IdeaSection.tsx'
import type { IdeaSectionProps } from '../src/client/slots.ts'
import type { EditableIdeaDraft } from '../src/client/state.ts'
import { zh } from '../src/client/locales.ts'
import type { IdeaDetail, IdeaListRow, IdeaSummary, IdeaVersionSummary } from '../src/remote-host/types.ts'
import type { IdeaVersionId } from '../src/types.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  for (const dispose of pendings.splice(0)) dispose()
})

/** Surfaces to dispose after each test (aborts in-flight reads). */
const pendings: Array<() => void> = []

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

/** The fake `t` seat: zh interpolation, exactly the placeholders we use. */
const t = ((key: string, params?: Record<string, unknown>): string =>
  (zh as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))) as never

/** One lightweight library row, exactly what `idea.list` projects. */
const row = (overrides: Partial<IdeaListRow> = {}): IdeaListRow => ({
  id: 'idea_1',
  status: 'active',
  currentVersionId: 'idea_ver_1',
  title: 'Saved idea',
  core: 'Core text',
  currentConclusion: 'Conclusion text',
  useWhen: ['use one', 'use two'],
  openQuestionsCount: 1,
  updatedAt: 1_700_000_000_000,
  ...overrides,
})

const summary = (overrides: Partial<IdeaSummary> = {}): IdeaSummary => ({
  id: 'idea_1',
  status: 'active',
  title: 'Saved idea',
  core: 'Core text',
  motivation: 'Why kept',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  source: { sessionId: 'session-9', anchorMessageId: 'msg-9' },
  ...overrides,
})

const detailOf = (summary: IdeaSummary, overrides: Partial<IdeaDetail> = {}): IdeaDetail => ({
  ...summary,
  currentConclusion: 'Conclusion text',
  possibleValue: 'Value text',
  useWhen: ['use one', 'use two'],
  openQuestions: ['question one'],
  versionId: 'idea_ver_1' as IdeaVersionId,
  ...overrides,
})

const versionSummary = (overrides: Partial<IdeaVersionSummary> = {}): IdeaVersionSummary => ({
  id: 'idea_ver_1' as IdeaVersionId,
  ordinal: 1,
  reason: 'initial-save',
  title: 'Saved idea',
  createdAt: 1_700_000_000_000,
  ...overrides,
})

/** A scripted read face plus the spies. */
function faceWith(
  list: () => Promise<unknown> = async () => ({ ok: true as const, value: [row()] }),
  get: () => Promise<unknown> = async () => ({ ok: true as const, value: detailOf(summary()) }),
  getVersions: () => Promise<unknown> = async () => ({ ok: true as const, value: [versionSummary()] }),
  search: () => Promise<unknown> = async () => ({ ok: true as const, value: [searchRow()] }),
): IdeaReadFace {
  return {
    list: vi.fn(list),
    get: vi.fn(get),
    getVersions: vi.fn(getVersions),
    search: vi.fn(search),
  } as unknown as IdeaReadFace
}

/** One search row, exactly what `idea.search` projects. */
const searchRow = (overrides: Partial<Record<string, unknown>> & { id?: string } = {}): Record<string, unknown> => ({
  id: 'idea_1',
  status: 'active',
  currentVersionId: 'idea_ver_1',
  title: 'Saved idea',
  core: 'Core text',
  currentConclusion: 'Conclusion text',
  useWhen: ['use one'],
  openQuestionsCount: 1,
  updatedAt: 1_700_000_000_000,
  reference: {
    ideaId: 'idea_1',
    versionId: 'idea_ver_1',
    label: 'Saved idea',
    mention: '@[Saved idea](dsh-idea:abc)',
  },
  ...overrides,
})

function newSurface(face: IdeaReadFace): IdeaReadSurface {
  const surface = new IdeaReadSurface(face)
  pendings.push(() => surface.dispose())
  return surface
}

/** The framework-synthesized selector hook over the surface's store. */
const useIdeaReadOf = (store: SnapshotStore<IdeaReadState>) =>
  (select: (state: IdeaReadState) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))

function sectionProps(surface: IdeaReadSurface): IdeaSectionProps {
  return {
    load: () => { surface.load() },
    searchIdeas: (query: string) => { surface.searchIdeas(query) },
    selectView: (view: 'current' | 'archived') => { surface.selectView(view) },
    open: (id: string) => { surface.open(id) },
    closeDetail: () => { surface.closeDetail() },
    archiveIdea: () => { surface.archiveIdea() },
    continueIdea: (id: string) => { surface.continueDiscussion(id) },
    prepareEvolution: () => { surface.prepareEvolution() },
    editProposalDraft: (patch: Partial<EditableIdeaDraft>) => { surface.editProposalDraft(patch) },
    cancelProposal: () => { surface.cancelProposal() },
    commitProposal: () => { surface.commitProposal() },
    useIdeaRead: useIdeaReadOf(surface.state),
    t,
  } as unknown as IdeaSectionProps
}

describe('Ideas section: list', () => {
  it('loads the current view once when mounted', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    expect(face.list).toHaveBeenCalledTimes(1)
    expect(face.list).toHaveBeenCalledWith({ view: 'current' })
    expect(surface.state.getSnapshot().lists.current.status).toBe('ready')
  })

  it('renders the two lifecycle tabs with no deleted view', () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByRole('button', { name: '当前' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '已归档' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '已删除' })).toBeNull()
  })

  it('renders title, one-line core, and the updated time per row — nothing more', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    const rows = document.querySelectorAll('.dsh-idea-row')
    expect(rows).toHaveLength(1)
    const text = rows[0]!.textContent ?? ''
    expect(text).toContain('Saved idea')
    expect(text).toContain('Core text')
    expect(text).toContain('更新于')
    expect(text).not.toContain('创建于')
    expect(text).not.toContain('来源')
    expect(text).not.toContain('Conclusion text')
  })

  it('shows the empty state when nothing is saved', async () => {
    const face = faceWith(async () => ({ ok: true as const, value: [] }))
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    expect(screen.getByText(/还没有保存的 Idea/)).toBeTruthy()
  })

  it('shows the error state and reloads on retry', async () => {
    let failing = true
    const face = faceWith(async () => {
      if (failing) return { ok: false as const, error: { code: 'idea/storage-failed' } }
      return { ok: true as const, value: [row()] }
    })
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    expect(screen.getByText('Idea 列表加载失败')).toBeTruthy()
    expect(face.list).toHaveBeenCalledTimes(1)

    failing = false
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试' })) })
    await flush()
    expect(face.list).toHaveBeenCalledTimes(2)
    expect(document.querySelectorAll('.dsh-idea-row')).toHaveLength(1)
  })

  it('shows a loading state while the list is in flight and swallows re-loads', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const face = faceWith(() => gate.then(() => ({ ok: true as const, value: [row()] })))
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)

    expect(screen.getByText('加载中…')).toBeTruthy()
    await act(async () => { surface.load() })
    expect(face.list).toHaveBeenCalledTimes(1)

    await act(async () => { release?.() })
    await flush()
    expect(document.querySelectorAll('.dsh-idea-row')).toHaveLength(1)
  })
})

describe('Ideas section: detail', () => {
  it('opens the full read-only detail with the source conversation linkage', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(face.get).toHaveBeenCalledWith({ id: 'idea_1' })
    expect(surface.state.getSnapshot().detail?.versionId).toBe('idea_ver_1')
    expect(screen.getByRole('heading', { name: 'Saved idea' })).toBeTruthy()
    expect(screen.getByText('Conclusion text')).toBeTruthy()
    expect(screen.getByText('Value text')).toBeTruthy()
    expect(screen.getByText('use one')).toBeTruthy()
    expect(screen.getByText('use two')).toBeTruthy()
    expect(screen.getByText('question one')).toBeTruthy()
    const source = document.querySelector('.dsh-idea-source')
    expect(source?.textContent).toContain('会话 session-9')
    expect(source?.textContent).toContain('消息 msg-9')
  })

  it('renders the source line without a message anchor when none was captured', async () => {
    const bare = summary({ source: { sessionId: 'session-bare' } })
    const face = faceWith(
      async () => ({ ok: true as const, value: [bare] }),
      async () => ({ ok: true as const, value: detailOf(bare) }),
    )
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    const source = document.querySelector('.dsh-idea-source')
    expect(source?.textContent).toContain('会话 session-bare')
    expect(source?.textContent).not.toContain('消息')
  })

  it('skips empty optional fields and empty lists', async () => {
    const sparse = detailOf(summary(), { currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [] })
    const face = faceWith(async () => ({ ok: true as const, value: [summary()] }), async () => ({ ok: true as const, value: sparse }))
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(screen.getByText('核心想法')).toBeTruthy()
    expect(screen.queryByText('当前结论')).toBeNull()
    expect(screen.queryByText('可能价值')).toBeNull()
    expect(screen.queryByText('适用场景')).toBeNull()
    expect(screen.queryByText('待解决问题')).toBeNull()
  })

  it('returns to the list from the detail', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(surface.state.getSnapshot().detail).not.toBeNull()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '返回列表' })) })
    expect(surface.state.getSnapshot().detailId).toBeNull()
    expect(screen.getByRole('button', { name: /Saved idea/ })).toBeTruthy()
  })

  it('shows the not-found copy for an unknown idea', async () => {
    const face = faceWith(undefined, async () => ({ ok: false as const, error: { code: 'idea/not-found' } }))
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(screen.getByText('该 Idea 不存在或已不可用')).toBeTruthy()
  })

  it('shows generic failure copy when the read throws', async () => {
    const face = faceWith(undefined, async () => { throw new Error('carrier offline') })
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(screen.getByText('该 Idea 加载失败')).toBeTruthy()
  })

  it('abandons an in-flight detail read when another idea is opened', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const other = detailOf(summary({ id: 'idea_2', title: 'Second idea' }), { versionId: 'idea_ver_2' as IdeaVersionId })
    const face = faceWith(
      async () => ({ ok: true as const, value: [summary(), summary({ id: 'idea_2', title: 'Second idea' })] }),
      (async () => {
        await gate
        return { ok: true as const, value: other }
      }) as () => Promise<unknown>,
    )
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    // The first open replaces the list with the detail's loading view, so the
    // second open goes through the controller directly.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await act(async () => { surface.open('idea_2') })
    await act(async () => { release?.() })
    await flush()

    expect(surface.state.getSnapshot().detailId).toBe('idea_2')
    expect(surface.state.getSnapshot().detail?.id).toBe('idea_2')
    expect(screen.getByRole('heading', { name: 'Second idea' })).toBeTruthy()
  })
})

describe('Ideas section: version history', () => {
  const historyFace = () => faceWith(
    async () => ({ ok: true as const, value: [summary()] }),
    async () => ({ ok: true as const, value: detailOf(summary(), { versionId: 'idea_ver_2' as IdeaVersionId }) }),
    async () => ({
      ok: true as const,
      value: [
        versionSummary(),
        versionSummary({ id: 'idea_ver_2' as IdeaVersionId, ordinal: 2, reason: 'manual-edit', title: 'Edited idea' }),
      ],
    }),
  )

  it('renders the current version and the labeled history rows', async () => {
    const face = historyFace()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()

    expect(face.getVersions).toHaveBeenCalledWith({ id: 'idea_1' })
    expect(screen.getByText('版本历史')).toBeTruthy()
    expect(screen.getByText('当前版本 v2')).toBeTruthy()
    expect(screen.getByText('v1')).toBeTruthy()
    expect(screen.getByText('初次保存')).toBeTruthy()
    expect(screen.getByText('v2')).toBeTruthy()
    expect(screen.getByText('手动修改')).toBeTruthy()
    expect(screen.getByText('Edited idea')).toBeTruthy()
  })

  it('hides the history block on failure, keeps the detail, and reloads on reopen', async () => {
    let failing = true
    const face = faceWith(
      async () => ({ ok: true as const, value: [summary()] }),
      async () => ({ ok: true as const, value: detailOf(summary()) }),
      async () => {
        if (failing) return { ok: false as const, error: { code: 'idea/version-not-found' } }
        return { ok: true as const, value: [versionSummary()] }
      },
    )
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    // The detail stays fully usable; only the history block is hidden.
    expect(screen.getByRole('heading', { name: 'Saved idea' })).toBeTruthy()
    expect(screen.queryByText('版本历史')).toBeNull()

    failing = false
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '返回列表' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(face.getVersions).toHaveBeenCalledTimes(2)
    expect(screen.getByText('版本历史')).toBeTruthy()
    expect(screen.getByText('当前版本 v1')).toBeTruthy()
    expect(screen.getByText('初次保存')).toBeTruthy()
  })
})

describe('Ideas section: search', () => {
  const searchInput = (): HTMLInputElement =>
    screen.getByLabelText('搜索全部 Idea…') as HTMLInputElement

  it('keeps the T8 tabbed views on a blank query', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.change(searchInput(), { target: { value: '   ' } }) })
    await flush()

    expect(face.search).not.toHaveBeenCalled()
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(surface.state.getSnapshot().lists.current.items).toHaveLength(1)
  })

  it('runs one mixed all-scope search per typed query and hides the tabs', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.change(searchInput(), { target: { value: '向量' } }) })
    await flush()

    expect(face.search).toHaveBeenCalledTimes(1)
    expect(face.search).toHaveBeenCalledWith({ query: '向量', scope: 'all' }, expect.any(AbortSignal))
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(surface.state.getSnapshot().search.status).toBe('ready')
    expect(surface.state.getSnapshot().lists.current.items).toHaveLength(1)
  })

  it('marks each row 当前 or 已归档', async () => {
    const face = faceWith(undefined, undefined, undefined, async () => ({
      ok: true as const,
      value: [
        searchRow({ id: 'idea_1', status: 'active' }),
        searchRow({ id: 'idea_2', status: 'archived', title: 'Old idea' }),
      ],
    }))
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.change(searchInput(), { target: { value: 'idea' } }) })
    await flush()

    const rows = document.querySelectorAll('.dsh-idea-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('当前')
    expect(rows[0]!.textContent).not.toContain('已归档')
    expect(rows[1]!.textContent).toContain('已归档')
    expect(rows[1]!.textContent).not.toContain('当前')
  })

  it('clicks a search row through to the existing detail', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.change(searchInput(), { target: { value: 'idea' } }) })
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()

    expect(face.get).toHaveBeenCalledWith({ id: 'idea_1' })
    expect(surface.state.getSnapshot().detailId).toBe('idea_1')
  })

  it('clearing restores the prior tab and its cached list without refetching', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '已归档' })) })
    await flush()
    const listCalls = (face.list as ReturnType<typeof vi.fn>).mock.calls.length
    expect(listCalls).toBe(2)

    await act(async () => { fireEvent.change(searchInput(), { target: { value: 'idea' } }) })
    await flush()
    await act(async () => { fireEvent.change(searchInput(), { target: { value: '' } }) })
    await flush()

    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(surface.state.getSnapshot().view).toBe('archived')
    // The archived tab's cached list returns untouched; no extra fetches.
    expect((face.list as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it('re-runs the live search after a confirmed mutation so the mixed list is never stale', async () => {
    const fullFace = faceWith()
    const face = fullFace as IdeaReadFace & { archive: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn> }
    face.archive = vi.fn(async () => ({
      ok: true as const,
      value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'archived' as const, updatedAt: 2 },
    }))
    const surface = newSurface(fullFace)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.change(searchInput(), { target: { value: 'idea' } }) })
    await flush()
    expect(face.search).toHaveBeenCalledTimes(1)

    // Open the detail from the search row and archive it there.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '归档' })) })
    await flush()

    expect(face.archive).toHaveBeenCalledTimes(1)
    expect(face.search).toHaveBeenCalledTimes(2)
    expect(face.search).toHaveBeenLastCalledWith({ query: 'idea', scope: 'all' }, expect.any(AbortSignal))
  })

  it('ignores a superseded query completion', async () => {
    let resolveOld: ((value: unknown) => void) | undefined
    let call = 0
    const face = faceWith(undefined, undefined, undefined, () => {
      call += 1
      if (call === 1) {
        return new Promise((resolve) => { resolveOld = resolve })
      }
      return Promise.resolve({ ok: true as const, value: [searchRow({ id: 'idea_new', title: 'New result' })] })
    })
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    await act(async () => { fireEvent.change(searchInput(), { target: { value: 'old' } }) })
    await act(async () => { fireEvent.change(searchInput(), { target: { value: 'new' } }) })
    await flush()
    expect(surface.state.getSnapshot().search.items.map(item => item.id)).toEqual(['idea_new'])

    // The 'old' flight lands late: its result must never apply.
    await act(async () => { resolveOld?.({ ok: true as const, value: [searchRow({ id: 'idea_old', title: 'Old result' })] }) })
    await flush()
    expect(surface.state.getSnapshot().search.items.map(item => item.id)).toEqual(['idea_new'])
  })
})
