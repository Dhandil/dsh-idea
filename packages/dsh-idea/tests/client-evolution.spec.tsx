/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the detail page's evolution flow: the 生成演化提案
 * entry appears only after a discussion exists, preparing shows a disabled
 * loading state and fails visibly, the proposal preview renders an editable
 * draft over the base-version line, editing updates the fields, cancel
 * discards with zero Host writes, approving submits the reviewed draft at
 * the current version and re-opens the refreshed detail, and a failed
 * commit keeps the draft on screen for retry. The Host face is a scripted
 * IdeaReadFace; no live Host, provider, or model call.
 * @module tests/client-evolution.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IdeaReadSurface } from '../src/client/read-state.ts'
import type { IdeaDetail, IdeaEvolutionProposalPreview, IdeaListRow, IdeaSummary, IdeaVersionSummary } from '../src/remote-host/types.ts'
import type { IdeaReadFace, IdeaReadState } from '../src/client/read-state.ts'
import { IdeaSection } from '../src/client/IdeaSection.tsx'
import type { IdeaSectionProps } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'
import type { EditableIdeaDraft } from '../src/client/state.ts'
import type { IdeaDraft, IdeaVersionId } from '../src/types.ts'

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

const row = (): IdeaListRow => ({
  id: 'idea_1',
  status: 'active',
  currentVersionId: 'idea_ver_1',
  title: 'Saved idea',
  core: 'Core text',
  currentConclusion: '',
  useWhen: [],
  openQuestionsCount: 0,
  updatedAt: 1_700_000_000_000,
})

const summary = (): IdeaSummary => ({
  id: 'idea_1',
  status: 'active',
  title: 'Saved idea',
  core: 'Core text',
  motivation: 'Why kept',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
})

const detail = (): IdeaDetail => ({
  ...summary(),
  currentConclusion: '',
  possibleValue: '',
  useWhen: [],
  openQuestions: [],
  versionId: 'idea_ver_1' as IdeaVersionId,
})

const versions = (): IdeaVersionSummary[] => [{
  id: 'idea_ver_1' as IdeaVersionId,
  ordinal: 1,
  reason: 'initial-save',
  title: 'Saved idea',
  createdAt: 1_700_000_000_000,
}]

const proposalDraft = (): IdeaDraft => ({
  title: 'Proposed title',
  core: 'Proposed core',
  motivation: 'Proposed motivation',
  currentConclusion: 'Proposed conclusion',
  possibleValue: 'Proposed value',
  useWhen: ['when proposing'],
  openQuestions: ['still open?'],
})

const previewOf = (): { ok: true; value: IdeaEvolutionProposalPreview } => ({
  ok: true,
  value: {
    proposalId: 'evo_1',
    ideaId: 'idea_1',
    baseVersionId: 'idea_ver_1',
    reason: 'continued-discussion',
    draft: proposalDraft(),
  },
})

/** A scripted face; every evolution verb is a spy the tests configure. */
function faceWith(overrides: {
  prepareEvolution?: () => Promise<unknown>
  commitEvolution?: () => Promise<unknown>
} = {}) {
  return {
    list: vi.fn(async () => ({ ok: true as const, value: [row()] })),
    get: vi.fn(async () => ({ ok: true as const, value: detail() })),
    getVersions: vi.fn(async () => ({ ok: true as const, value: versions() })),
    continueDiscussion: vi.fn(async () => ({
      ok: true as const,
      value: { discussionId: 'idea_dis_1', conversationId: 'session-new', baseVersionId: 'idea_ver_1' },
    })),
    prepareEvolution: vi.fn(overrides.prepareEvolution ?? (async () => previewOf())),
    commitEvolution: vi.fn(overrides.commitEvolution ?? (async () => ({
      ok: true as const,
      value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_2', ordinal: 2, title: 'Proposed title', status: 'active' },
    }))),
  }
}

function newSurface(face: ReturnType<typeof faceWith>) {
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

/** Render, open the detail, continue the discussion, and return the seats. */
async function openDiscussedDetail(face: ReturnType<typeof faceWith>) {
  const surface = newSurface(face)
  render(<IdeaSection {...sectionProps(surface)} />)
  await flush()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
  await flush()
  return { surface }
}

/** Continue, then prepare, ending in the open proposal preview. */
async function openProposalPreview(face: ReturnType<typeof faceWith>) {
  const seats = await openDiscussedDetail(face)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
  await flush()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成演化提案' })) })
  await flush()
  return seats
}

describe('Ideas section: evolution entry', () => {
  it('hides the evolution entry until a discussion exists, then shows it', async () => {
    const face = faceWith()
    const { surface } = await openDiscussedDetail(face)
    expect(screen.queryByRole('button', { name: '生成演化提案' })).toBeNull()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()

    expect(surface.state.getSnapshot().discussionId).toBe('idea_dis_1')
    expect(screen.getByRole('button', { name: '生成演化提案' })).toBeTruthy()
  })

  it('shows a disabled preparing state, then the proposal preview on success', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const face = faceWith({ prepareEvolution: () => gate.then(() => previewOf()) })
    const { surface } = await openDiscussedDetail(face)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成演化提案' })) })
    const loading = screen.getByRole('button', { name: '正在生成提案…' }) as HTMLButtonElement
    expect(loading.disabled).toBe(true)
    expect(surface.state.getSnapshot().evolutionStatus).toBe('preparing')

    await act(async () => { release?.() })
    await flush()

    expect(face.prepareEvolution).toHaveBeenCalledWith({ discussionId: 'idea_dis_1' }, expect.any(AbortSignal))
    expect(surface.state.getSnapshot().evolutionStatus).toBe('reviewing')
    expect(screen.getByText('演化提案')).toBeTruthy()
    expect(screen.getByText('基于当前版本 v1')).toBeTruthy()
    expect((screen.getByDisplayValue('Proposed title') as HTMLInputElement).tagName).toBe('INPUT')
    expect(screen.getByDisplayValue('Proposed core')).toBeTruthy()
    expect(screen.getByRole('button', { name: '保存为新版本' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
  })

  it('shows the failure copy on a failed prepare and retries on a new click', async () => {
    let failing = true
    const face = faceWith({
      prepareEvolution: async () => {
        if (failing) return { ok: false as const, error: { code: 'idea/model-failed' } }
        return previewOf()
      },
    })
    const { surface } = await openDiscussedDetail(face)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成演化提案' })) })
    await flush()
    expect(surface.state.getSnapshot().evolutionStatus).toBe('error')
    expect(screen.getByText('生成演化提案失败，请稍后重试')).toBeTruthy()

    failing = false
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成演化提案' })) })
    await flush()
    expect(face.prepareEvolution).toHaveBeenCalledTimes(2)
    expect(screen.getByText('演化提案')).toBeTruthy()
  })
})

describe('Ideas section: proposal review', () => {
  it('applies field edits to the reviewed draft', async () => {
    const face = faceWith()
    const { surface } = await openProposalPreview(face)

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Proposed title'), { target: { value: 'Edited title' } })
    })

    expect(surface.state.getSnapshot().proposal?.draft.title).toBe('Edited title')
    expect((screen.getByDisplayValue('Edited title') as HTMLInputElement).value).toBe('Edited title')
  })

  it('cancel discards the proposal with zero Host writes', async () => {
    const face = faceWith()
    const { surface } = await openProposalPreview(face)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '取消' })) })
    await flush()

    expect(face.commitEvolution).not.toHaveBeenCalled()
    expect(surface.state.getSnapshot().proposal).toBeNull()
    expect(surface.state.getSnapshot().evolutionStatus).toBe('idle')
    expect(screen.getByRole('button', { name: '生成演化提案' })).toBeTruthy()
  })

  it('approve submits the edited draft at the current version and reloads the detail', async () => {
    const face = faceWith()
    const { surface } = await openProposalPreview(face)
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Proposed title'), { target: { value: 'Edited title' } })
    })
    const getCallsBefore = face.get.mock.calls.length

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存为新版本' })) })
    await flush()

    expect(face.commitEvolution).toHaveBeenCalledTimes(1)
    expect(face.commitEvolution).toHaveBeenCalledWith({
      proposalId: 'evo_1',
      expectedCurrentVersionId: 'idea_ver_1',
      draft: { ...proposalDraft(), title: 'Edited title' },
    })
    expect(surface.state.getSnapshot().proposal).toBeNull()
    expect(surface.state.getSnapshot().evolutionStatus).toBe('idle')
    // The detail and its history were re-fetched after the commit.
    expect(face.get.mock.calls.length).toBeGreaterThan(getCallsBefore)
  })

  it('a failed commit keeps the reviewed draft on screen for retry', async () => {
    const face = faceWith({
      commitEvolution: async () => ({ ok: false as const, error: { code: 'idea/version-conflict' } }),
    })
    const { surface } = await openProposalPreview(face)
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Proposed title'), { target: { value: 'Edited title' } })
    })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存为新版本' })) })
    await flush()

    expect(surface.state.getSnapshot().evolutionStatus).toBe('reviewing')
    expect(surface.state.getSnapshot().evolutionFailure).toBe('commit')
    expect(screen.getByText('保存新版本失败，请稍后重试')).toBeTruthy()
    expect((screen.getByDisplayValue('Edited title') as HTMLInputElement).value).toBe('Edited title')
    expect(face.get.mock.calls.length).toBe(1)
  })
})

describe('evolution surface guards', () => {
  it('ignores prepare without a discussion and commit outside the reviewing state', async () => {
    const face = faceWith()
    const surface = newSurface(face)

    surface.prepareEvolution()
    expect(face.prepareEvolution).not.toHaveBeenCalled()

    surface.commitProposal()
    expect(face.commitEvolution).not.toHaveBeenCalled()
  })

  it('ignores edits and cancel outside the reviewing state', async () => {
    const face = faceWith()
    const surface = newSurface(face)

    surface.editProposalDraft({ title: 'nope' })
    surface.cancelProposal()
    expect(surface.state.getSnapshot().proposal).toBeNull()
  })

  it('resets the evolution flow when another idea is opened', async () => {
    const face = faceWith()
    const { surface } = await openProposalPreview(face)

    await act(async () => { surface.open('idea_2') })

    expect(surface.state.getSnapshot().proposal).toBeNull()
    expect(surface.state.getSnapshot().evolutionStatus).toBe('idle')
    expect(surface.state.getSnapshot().discussionId).toBeNull()
  })
})
