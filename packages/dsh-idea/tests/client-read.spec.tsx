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
import type { IdeaDetail, IdeaSummary, IdeaVersionSummary } from '../src/remote-host/types.ts'
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

const summary = (overrides: Partial<IdeaSummary> = {}): IdeaSummary => ({
  id: 'idea_1',
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
  list: () => Promise<unknown> = async () => ({ ok: true as const, value: [summary()] }),
  get: () => Promise<unknown> = async () => ({ ok: true as const, value: detailOf(summary()) }),
  getVersions: () => Promise<unknown> = async () => ({ ok: true as const, value: [versionSummary()] }),
): IdeaReadFace {
  return {
    list: vi.fn(list),
    get: vi.fn(get),
    getVersions: vi.fn(getVersions),
  } as unknown as IdeaReadFace
}

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
    open: (id: string) => { surface.open(id) },
    closeDetail: () => { surface.closeDetail() },
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
  it('loads the list once when mounted', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    expect(face.list).toHaveBeenCalledTimes(1)
    expect(surface.state.getSnapshot().status).toBe('ready')
  })

  it('renders title, core, created time, and the source indicator per row', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()

    const row = screen.getByRole('button', { name: /Saved idea/ })
    expect(row.textContent).toContain('Core text')
    expect(row.textContent).toContain('创建于')
    expect(row.textContent).toContain('来源：会话 session-9')
    expect(screen.getAllByRole('button')).toHaveLength(1)
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
      return { ok: true as const, value: [summary()] }
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
    expect(screen.getByRole('button', { name: /Saved idea/ })).toBeTruthy()
  })

  it('shows a loading state while the list is in flight and swallows re-loads', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const face = faceWith(() => gate.then(() => ({ ok: true as const, value: [summary()] })))
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)

    expect(screen.getByText('加载中…')).toBeTruthy()
    await act(async () => { surface.load() })
    expect(face.list).toHaveBeenCalledTimes(1)

    await act(async () => { release?.() })
    await flush()
    expect(screen.getByRole('button', { name: /Saved idea/ })).toBeTruthy()
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
