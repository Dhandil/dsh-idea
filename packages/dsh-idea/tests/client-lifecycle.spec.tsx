/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the T8 lifecycle surfaces: the two library tabs
 * (lazy, read-only switching; no deleted view), the hover preview card's
 * bounded projection and its row-independent Edit action, the manual-edit
 * editor (seven fields, zero-write cancel, no-change Save disabled,
 * conflict/failure keeps the edits, success refetches showing the appended
 * version), archive/restore with their status-scoped actions, and the
 * detail-only acknowledged permanent delete. The Host face is a scripted
 * IdeaReadFace; no live Host, provider, or model call.
 * @module tests/client-lifecycle.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IdeaReadSurface } from '../src/client/read-state.ts'
import type { IdeaReadFace, IdeaReadState } from '../src/client/read-state.ts'
import { IdeaPreviewCard, IdeaSection } from '../src/client/IdeaSection.tsx'
import { IdeaHoverCard } from '../src/client/hover-card.tsx'
import type { IdeaSectionProps } from '../src/client/slots.ts'
import type { EditableIdeaDraft } from '../src/client/state.ts'
import { zh } from '../src/client/locales.ts'
import type { IdeaDetail, IdeaListRow, IdeaVersionSummary } from '../src/remote-host/types.ts'
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

const row = (overrides: Partial<IdeaListRow> = {}): IdeaListRow => ({
  id: 'idea_1',
  status: 'active',
  currentVersionId: 'idea_ver_1',
  title: 'Saved idea',
  core: 'Core text',
  currentConclusion: 'Conclusion text',
  useWhen: ['use one', 'use two', 'use three', 'use four', 'use five'],
  openQuestionsCount: 2,
  updatedAt: 1_700_000_000_000,
  ...overrides,
})

const detail = (overrides: Partial<IdeaDetail> = {}): IdeaDetail => ({
  id: 'idea_1',
  status: 'active',
  title: 'Saved idea',
  core: 'Core text',
  motivation: 'Why kept',
  currentConclusion: 'Conclusion text',
  possibleValue: 'Value text',
  useWhen: ['use one', 'use two'],
  openQuestions: ['question one'],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  versionId: 'idea_ver_1' as IdeaVersionId,
  source: { sessionId: 'session-9', anchorMessageId: 'msg-9' },
  ...overrides,
})

const version = (overrides: Partial<IdeaVersionSummary> = {}): IdeaVersionSummary => ({
  id: 'idea_ver_1' as IdeaVersionId,
  ordinal: 1,
  reason: 'initial-save',
  title: 'Saved idea',
  createdAt: 1_700_000_000_000,
  ...overrides,
})

/** A scripted face plus the spies; every T8 verb is configurable. The
 * default `list` serves the current view one row and the archived view none. */
function faceWith(overrides: {
  list?: () => Promise<unknown>
  get?: () => Promise<unknown>
  getVersions?: () => Promise<unknown>
  manualEdit?: () => Promise<unknown>
  archive?: () => Promise<unknown>
  restore?: () => Promise<unknown>
  deleteIdea?: () => Promise<unknown>
} = {}) {
  return {
    list: vi.fn(overrides.list ?? (async (request: { view: string }) => request.view === 'archived'
      ? { ok: true as const, value: [] }
      : { ok: true as const, value: [row()] })),
    get: vi.fn(overrides.get ?? (async () => ({ ok: true as const, value: detail() }))),
    getVersions: vi.fn(overrides.getVersions ?? (async () => ({ ok: true as const, value: [version()] }))),
    continueDiscussion: vi.fn(async () => ({
      ok: true as const,
      value: { discussionId: 'idea_dis_1', conversationId: 'session-new', baseVersionId: 'idea_ver_1' },
    })),
    prepareEvolution: vi.fn(async () => ({ ok: true as const, value: {
      proposalId: 'evo_1',
      ideaId: 'idea_1',
      baseVersionId: 'idea_ver_1',
      reason: 'continued-discussion',
      draft: {
        title: 'Proposed title',
        core: 'Proposed core',
        motivation: 'Proposed motivation',
        currentConclusion: 'Proposed conclusion',
        possibleValue: 'Proposed value',
        useWhen: ['when proposing'],
        openQuestions: ['still open?'],
      },
    } })),
    commitEvolution: vi.fn(async () => ({
      ok: true as const,
      value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_2', ordinal: 2, title: 'Proposed title', status: 'active' },
    })),
    manualEdit: vi.fn(overrides.manualEdit ?? (async () => ({
      ok: true as const,
      value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_2', ordinal: 2, title: 'Edited title', status: 'active', committed: true },
    }))),
    archive: vi.fn(overrides.archive ?? (async () => ({
      ok: true as const,
      value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'archived', updatedAt: 1_700_000_000_001 },
    }))),
    restore: vi.fn(overrides.restore ?? (async () => ({
      ok: true as const,
      value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active', updatedAt: 1_700_000_000_002 },
    }))),
    deleteIdea: vi.fn(overrides.deleteIdea ?? (async () => ({ ok: true as const, value: { ideaId: 'idea_1' } }))),
  }
}

function newSurface(face: ReturnType<typeof faceWith>): IdeaReadSurface {
  const surface = new IdeaReadSurface(face as unknown as IdeaReadFace)
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
    selectView: (view: 'current' | 'archived') => { surface.selectView(view) },
    open: (id: string) => { surface.open(id) },
    closeDetail: () => { surface.closeDetail() },
    openEditor: (id: string) => { surface.openEditor(id) },
    continueIdea: (id: string) => { surface.continueDiscussion(id) },
    prepareEvolution: () => { surface.prepareEvolution() },
    editProposalDraft: (patch: Partial<EditableIdeaDraft>) => { surface.editProposalDraft(patch) },
    cancelProposal: () => { surface.cancelProposal() },
    commitProposal: () => { surface.commitProposal() },
    editDraft: (patch: Partial<EditableIdeaDraft>) => { surface.editDraft(patch) },
    cancelEdit: () => { surface.cancelEdit() },
    saveEdit: () => { surface.commitEdit() },
    archiveIdea: () => { surface.archiveIdea() },
    restoreIdea: () => { surface.restoreIdea() },
    requestDelete: () => { surface.requestDelete() },
    cancelDelete: () => { surface.cancelDelete() },
    confirmDelete: () => { surface.confirmDelete() },
    useIdeaRead: useIdeaReadOf(surface.state),
    t,
  } as unknown as IdeaSectionProps
}

/** Render the section, open the one idea's detail, and return the seats. */
async function openDetail(face: ReturnType<typeof faceWith>) {
  const surface = newSurface(face)
  render(<IdeaSection {...sectionProps(surface)} />)
  await flush()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
  await flush()
  return { surface }
}

describe('Ideas section: tabs', () => {
  it('defaults to the current view, lazily loads the archived view, and never reloads a ready view', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    expect(face.list).toHaveBeenCalledTimes(1)
    expect(face.list).toHaveBeenCalledWith({ view: 'current' })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '已归档' })) })
    await flush()
    expect(face.list).toHaveBeenCalledTimes(2)
    expect(face.list).toHaveBeenLastCalledWith({ view: 'archived' })
    expect(screen.getByText(/暂无已归档的 Idea/)).toBeTruthy()

    // Switching back is a read-only state change: the current view is ready.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '当前' })) })
    await flush()
    expect(face.list).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/Saved idea/)).toBeTruthy()
  })

  it('renders no deleted view anywhere', () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    expect(screen.queryByRole('button', { name: '已删除' })).toBeNull()
    expect(screen.queryByText(/已删除/)).toBeNull()
  })
})

describe('Ideas section: hover preview card', () => {
  it('projects the bounded fields with at most three use-when entries', () => {
    const openEditor = vi.fn()
    const { container } = render(<IdeaPreviewCard idea={row()} openEditor={openEditor} t={t} />)

    expect(container.textContent).toContain('Saved idea')
    expect(container.textContent).toContain('Core text')
    expect(container.textContent).toContain('当前结论')
    expect(container.textContent).toContain('Conclusion text')
    expect(container.querySelectorAll('.dsh-idea-preview-line li')).toHaveLength(3)
    expect(container.textContent).not.toContain('use four')
    expect(container.textContent).not.toContain('use five')
    expect(container.textContent).toContain('待解决问题 2 条')
    expect(container.textContent).toContain('更新于')

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(openEditor).toHaveBeenCalledWith('idea_1')
  })

  it('omits the conclusion line when empty and drops the Edit action when archived', () => {
    const openEditor = vi.fn()
    const { container } = render(
      <IdeaPreviewCard
        idea={row({ status: 'archived', currentConclusion: '', openQuestionsCount: 0 })}
        openEditor={openEditor}
        t={t}
      />,
    )
    expect(container.textContent).not.toContain('当前结论')
    expect(container.textContent).toContain('待解决问题 0 条')
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
  })
})

describe('Ideas section: anchored hover card', () => {
  it('opens after the pointer dwell and its quick action is clickable through the portal', async () => {
    const openEditor = vi.fn()
    const { container } = render(
      <IdeaHoverCard
        openDelayMs={0}
        anchor={<button type="button">Row anchor</button>}
        content={<button type="button" onClick={() => openEditor('idea_1')}>编辑</button>}
      />,
    )
    expect(document.querySelector('.dsh-idea-hover-card')).toBeNull()

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Row anchor' }))
    await flush()
    // The card portals to the document body, outside the section's tree.
    const card = document.querySelector('.dsh-idea-hover-card')
    expect(card).not.toBeNull()
    expect(container.contains(card)).toBe(false)

    // The regression that forced the feature-owned card: the primitive's
    // portaled card sat under the settings modal's mask, so its quick action
    // could never receive the press.
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(openEditor).toHaveBeenCalledWith('idea_1')
  })

  it('closes after the pointer leaves the card past the grace window', async () => {
    render(
      <IdeaHoverCard
        openDelayMs={0}
        graceMs={0}
        anchor={<button type="button">Row anchor</button>}
        content={<span>Card content</span>}
      />,
    )
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Row anchor' }))
    await flush()
    expect(document.querySelector('.dsh-idea-hover-card')).not.toBeNull()

    fireEvent.pointerLeave(document.querySelector('.dsh-idea-hover-card')!)
    await flush()
    expect(document.querySelector('.dsh-idea-hover-card')).toBeNull()
  })
})

describe('Ideas section: manual edit', () => {
  it('opens the editor with the seven current fields and disables Save until a change', async () => {
    const face = faceWith()
    await openDetail(face)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑' })) })
    expect(screen.getByRole('heading', { name: '编辑 Idea' })).toBeTruthy()
    expect((screen.getByDisplayValue('Saved idea') as HTMLInputElement).tagName).toBe('INPUT')
    expect(screen.getByDisplayValue('Core text')).toBeTruthy()
    expect(screen.getByDisplayValue('Why kept')).toBeTruthy()
    expect(screen.getByDisplayValue('Conclusion text')).toBeTruthy()
    expect(screen.getByDisplayValue('Value text')).toBeTruthy()
    expect((screen.getByLabelText('适用场景（每行一条）') as HTMLTextAreaElement).value).toBe('use one\nuse two')
    expect((screen.getByLabelText('待解决问题（每行一条）') as HTMLTextAreaElement).value).toBe('question one')

    const save = screen.getByRole('button', { name: '保存为新版本' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
  })

  it('cancel discards the editor with zero Host writes', async () => {
    const face = faceWith()
    await openDetail(face)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑' })) })

    await act(async () => { fireEvent.change(screen.getByDisplayValue('Saved idea'), { target: { value: 'Discarded' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '取消' })) })

    expect(face.manualEdit).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Saved idea' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '编辑 Idea' })).toBeNull()
  })

  it('saves a changed draft as a new version at the opened version and shows the appended history', async () => {
    // The read fixtures flip inside the mutation spy: once manualEdit lands,
    // the refetched detail and history reflect the new current version.
    let currentDetail = detail()
    let currentVersions = [version()]
    const face = faceWith({
      get: async () => ({ ok: true as const, value: currentDetail }),
      getVersions: async () => ({ ok: true as const, value: currentVersions }),
      manualEdit: async () => {
        currentDetail = detail({
          title: 'Edited title',
          currentConclusion: 'Edited conclusion',
          versionId: 'idea_ver_2' as IdeaVersionId,
        })
        currentVersions = [
          version(),
          version({ id: 'idea_ver_2' as IdeaVersionId, ordinal: 2, reason: 'manual-edit', title: 'Edited title' }),
        ]
        return {
          ok: true as const,
          value: {
            ideaId: 'idea_1',
            currentVersionId: 'idea_ver_2' as IdeaVersionId,
            ordinal: 2,
            title: 'Edited title',
            status: 'active' as const,
            committed: true,
          },
        }
      },
    })
    const { surface } = await openDetail(face)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑' })) })
    await act(async () => { fireEvent.change(screen.getByDisplayValue('Saved idea'), { target: { value: 'Edited title' } }) })
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Conclusion text'), { target: { value: 'Edited conclusion' } })
    })

    const save = screen.getByRole('button', { name: '保存为新版本' }) as HTMLButtonElement
    expect(save.disabled).toBe(false)
    const listsBefore = face.list.mock.calls.length
    const getsBefore = face.get.mock.calls.length

    await act(async () => { fireEvent.click(save) })
    await flush()

    expect(face.manualEdit).toHaveBeenCalledTimes(1)
    expect(face.manualEdit).toHaveBeenCalledWith({
      id: 'idea_1',
      expectedCurrentVersionId: 'idea_ver_1',
      draft: {
        title: 'Edited title',
        core: 'Core text',
        motivation: 'Why kept',
        currentConclusion: 'Edited conclusion',
        possibleValue: 'Value text',
        useWhen: ['use one', 'use two'],
        openQuestions: ['question one'],
      },
    })
    // The editor closed, both lists refetched, and the detail was re-opened.
    expect(surface.state.getSnapshot().edit.status).toBe('idle')
    expect(face.list.mock.calls.length).toBe(listsBefore + 2)
    expect(face.get.mock.calls.length).toBe(getsBefore + 1)
    expect(screen.getByRole('heading', { name: 'Edited title' })).toBeTruthy()
    expect(screen.getByText('手动修改')).toBeTruthy()
    expect(screen.getByText('当前版本 v2')).toBeTruthy()
  })

  it('keeps the form and shows the stale copy on a version conflict', async () => {
    const face = faceWith({
      manualEdit: async () => ({ ok: false as const, error: { code: 'idea/version-conflict' } }),
    })
    await openDetail(face)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑' })) })
    await act(async () => { fireEvent.change(screen.getByDisplayValue('Saved idea'), { target: { value: 'Edited title' } }) })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存为新版本' })) })
    await flush()

    expect(screen.getByText(/已在其他地方更新/)).toBeTruthy()
    expect((screen.getByDisplayValue('Edited title') as HTMLInputElement).value).toBe('Edited title')
  })

  it('keeps the form and shows the failure copy on a generic failure', async () => {
    const face = faceWith({
      manualEdit: async () => ({ ok: false as const, error: { code: 'idea/storage-failed' } }),
    })
    await openDetail(face)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑' })) })
    await act(async () => { fireEvent.change(screen.getByDisplayValue('Saved idea'), { target: { value: 'Edited title' } }) })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存为新版本' })) })
    await flush()

    expect(screen.getByText('保存失败，请稍后重试')).toBeTruthy()
    expect((screen.getByDisplayValue('Edited title') as HTMLInputElement).value).toBe('Edited title')
  })
})

describe('Ideas section: archive and restore', () => {
  it('archives at the current version, refetches the lists, and reopens the detail as archived', async () => {
    let currentDetail = detail()
    const face = faceWith({
      get: async () => ({ ok: true as const, value: currentDetail }),
      archive: async () => {
        currentDetail = detail({ status: 'archived' })
        return {
          ok: true as const,
          value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'archived', updatedAt: 1_700_000_000_001 },
        }
      },
    })
    const { surface } = await openDetail(face)
    const listsBefore = face.list.mock.calls.length

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '归档' })) })
    expect(face.archive).toHaveBeenCalledWith({ id: 'idea_1', expectedCurrentVersionId: 'idea_ver_1' })
    await flush()

    // Never optimistic: both lists refetch, the detail re-opens archived.
    expect(face.list.mock.calls.length).toBe(listsBefore + 2)
    expect(surface.state.getSnapshot().detail?.status).toBe('archived')
    expect(screen.queryByRole('button', { name: '归档' })).toBeNull()
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
    expect(screen.getByRole('button', { name: '恢复' })).toBeTruthy()
  })

  it('shows the archive failure copy and stays on the detail for a retry', async () => {
    const face = faceWith({
      archive: async () => ({ ok: false as const, error: { code: 'idea/version-conflict' } }),
    })
    const { surface } = await openDetail(face)
    const getsBefore = face.get.mock.calls.length

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '归档' })) })
    await flush()

    expect(surface.state.getSnapshot().detail?.status).toBe('active')
    expect(screen.getByText('归档失败，请稍后重试')).toBeTruthy()
    // The detail never closed, so the still-valid expected version is kept for the retry.
    expect(face.get.mock.calls.length).toBe(getsBefore)
    expect(screen.getByRole('button', { name: '归档' })).toBeTruthy()
  })

  it('exposes Restore and Delete only on an archived detail and restores at the expected version', async () => {
    let currentDetail = detail({ status: 'archived' })
    const face = faceWith({
      list: async () => ({ ok: true as const, value: [row({ status: 'archived' })] }),
      get: async () => ({ ok: true as const, value: currentDetail }),
      restore: async () => {
        currentDetail = detail()
        return {
          ok: true as const,
          value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active', updatedAt: 1_700_000_000_002 },
        }
      },
    })
    const { surface } = await openDetail(face)

    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull()
    expect(screen.queryByRole('button', { name: '讨论' })).toBeNull()
    expect(screen.queryByRole('button', { name: '归档' })).toBeNull()
    expect(screen.queryByRole('button', { name: '生成演化提案' })).toBeNull()
    expect(document.querySelector('.dsh-idea-row-meta')?.textContent).toContain('已归档')

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '恢复' })) })
    expect(face.restore).toHaveBeenCalledWith({ id: 'idea_1', expectedCurrentVersionId: 'idea_ver_1' })
    await flush()
    expect(surface.state.getSnapshot().detail?.status).toBe('active')
  })
})

describe('Ideas section: permanent delete', () => {
  /** The live delete dialog (the title doubles as its accessible name). */
  const dialogOf = () => screen.getByRole('dialog', { name: '永久删除 Idea？' })

  /** Open the detail and the delete confirmation. */
  async function openDialog(face: ReturnType<typeof faceWith>) {
    const { surface } = await openDetail(face)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '删除' })) })
    return { surface, dialog: dialogOf() }
  }

  it('gates the confirm behind the acknowledgement and cancels with zero writes', async () => {
    const face = faceWith()
    const { dialog } = await openDialog(face)

    expect(dialog.textContent).toContain('已有 Harness 对话不会被删除')
    const confirm = within(dialog).getByRole('button', { name: '永久删除' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    await act(async () => { fireEvent.click(within(dialog).getByRole('checkbox')) })
    expect((within(dialog).getByRole('button', { name: '永久删除' }) as HTMLButtonElement).disabled).toBe(false)

    // The dialog carries two 取消 buttons (header close + footer); either closes.
    await act(async () => { fireEvent.click(within(dialog).getAllByRole('button', { name: '取消' })[0]!) })
    expect(face.deleteIdea).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    // Back on the detail: only the detail's own delete button remains.
    expect(screen.getByRole('button', { name: '删除' })).toBeTruthy()
  })

  it('confirms at the expected version and exits to the list only after the Host settled', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const face = faceWith({ deleteIdea: () => gate.then(() => ({ ok: true as const, value: { ideaId: 'idea_1' } })) })
    const { surface } = await openDialog(face)
    const listsBefore = face.list.mock.calls.length

    await act(async () => { fireEvent.click(within(dialogOf()).getByRole('checkbox')) })
    await act(async () => { fireEvent.click(within(dialogOf()).getByRole('button', { name: '永久删除' })) })
    expect(face.deleteIdea).toHaveBeenCalledWith({ id: 'idea_1', expectedCurrentVersionId: 'idea_ver_1' })
    expect((within(dialogOf()).getByRole('button', { name: '正在删除…' }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => { release?.() })
    await flush()
    // The detail closed and both lists refetched; no deleted view exists.
    expect(surface.state.getSnapshot().detailId).toBeNull()
    expect(surface.state.getSnapshot().deletion.status).toBe('closed')
    expect(face.list.mock.calls.length).toBe(listsBefore + 2)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the confirmation open with the error copy on a failed delete', async () => {
    const face = faceWith({
      deleteIdea: async () => ({ ok: false as const, error: { code: 'idea/storage-failed' } }),
    })
    const { surface } = await openDialog(face)

    await act(async () => { fireEvent.click(within(dialogOf()).getByRole('checkbox')) })
    await act(async () => { fireEvent.click(within(dialogOf()).getByRole('button', { name: '永久删除' })) })
    await flush()

    expect(surface.state.getSnapshot().deletion.status).toBe('error')
    expect(dialogOf()).toBeTruthy()
    // The failure copy is appended to the exact §14 description inside one element.
    expect(screen.getByText(/删除失败，请稍后重试/)).toBeTruthy()
  })
})
