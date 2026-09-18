/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the detail page's Continue Discussion entry: the
 * button renders, a click enters the loading state and collapses duplicate
 * clicks into one Host call, the request carries at most a Workspace id —
 * the current session's workspace, else the most recent one, else none —
 * success hands the Host-returned conversation id to the opener, failure
 * shows the error copy without navigating and an explicit re-click retries.
 * The Host face is a scripted IdeaReadFace; no live Host, provider, or model
 * call.
 * @module tests/client-continue.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IdeaReadSurface } from '../src/client/read-state.ts'
import { selectContinuationWorkspace } from '../src/client/workspace.ts'
import type { IdeaContinueDiscussionResult, IdeaDetail, IdeaListRow, IdeaSummary } from '../src/remote-host/types.ts'
import type { IdeaReadFace, IdeaReadState } from '../src/client/read-state.ts'
import { IdeaSection } from '../src/client/IdeaSection.tsx'
import type { IdeaSectionProps } from '../src/client/slots.ts'
import type { EditableIdeaDraft } from '../src/client/state.ts'
import { zh } from '../src/client/locales.ts'
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
  currentConclusion: '',
  useWhen: [],
  openQuestionsCount: 0,
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
  ...overrides,
})

const detailOf = (summary: IdeaSummary): IdeaDetail => ({
  ...summary,
  currentConclusion: '',
  possibleValue: '',
  useWhen: [],
  openQuestions: [],
  versionId: 'idea_ver_1' as IdeaVersionId,
})

const continueResult = (): { ok: true; value: IdeaContinueDiscussionResult } => ({
  ok: true,
  value: { discussionId: 'idea_dis_1', conversationId: 'session-new', baseVersionId: 'idea_ver_1' },
})

/** A scripted face plus the spies; only continueDiscussion is interesting here. */
function faceWith(
  continueDiscussion: () => Promise<unknown> = async () => continueResult(),
): IdeaReadFace {
  return {
    list: vi.fn(async () => ({ ok: true as const, value: [row()] })),
    get: vi.fn(async () => ({ ok: true as const, value: detailOf(summary()) })),
    getVersions: vi.fn(async () => ({ ok: true as const, value: [] })),
    continueDiscussion: vi.fn(continueDiscussion),
  } as unknown as IdeaReadFace
}

function newSurface(face: IdeaReadFace, openConversation: (conversationId: string) => Promise<void> = async () => {}) {
  const surface = new IdeaReadSurface(face, openConversation)
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

/** Render the section, open the one idea's detail, and return the test seats. */
async function openDetail(face: IdeaReadFace, openConversation?: (conversationId: string) => Promise<void>) {
  const surface = newSurface(face, openConversation)
  render(<IdeaSection {...sectionProps(surface)} />)
  await flush()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
  await flush()
  return { surface }
}

describe('Ideas section: continue discussion', () => {
  it('shows the 继续讨论 button on the detail page', async () => {
    await openDetail(faceWith())
    expect(screen.getByRole('button', { name: '继续讨论' })).toBeTruthy()
  })

  it('enters the loading state, disables the button, and opens the conversation on success', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const face = faceWith(() => gate.then(() => continueResult()))
    const openConversation = vi.fn(async () => {})
    await openDetail(face, openConversation)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    const loading = screen.getByRole('button', { name: '正在开启讨论…' }) as HTMLButtonElement
    expect(loading.disabled).toBe(true)

    await act(async () => { release?.() })
    await flush()
    expect(face.continueDiscussion).toHaveBeenCalledWith({ id: 'idea_1' })
    expect(openConversation).toHaveBeenCalledWith('session-new')
    expect((screen.getByRole('button', { name: '继续讨论' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText('继续讨论失败，请稍后重试')).toBeNull()
  })

  it('collapses duplicate clicks into one call while a continuation is in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const face = faceWith(() => gate.then(() => continueResult()))
    await openDetail(face)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '正在开启讨论…' })) })
    await act(async () => { release?.() })
    await flush()

    expect(face.continueDiscussion).toHaveBeenCalledTimes(1)
  })

  it('shows the failure copy, navigates nowhere, and retries only on a new click', async () => {
    let failing = true
    const face = faceWith(async () => {
      if (failing) return { ok: false as const, error: { code: 'idea/conversation-failed' } }
      return continueResult()
    })
    const openConversation = vi.fn(async () => {})
    await openDetail(face, openConversation)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()
    expect(screen.getByText('继续讨论失败，请稍后重试')).toBeTruthy()
    expect(openConversation).not.toHaveBeenCalled()

    failing = false
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()
    expect(face.continueDiscussion).toHaveBeenCalledTimes(2)
    expect(openConversation).toHaveBeenCalledWith('session-new')
    expect(screen.queryByText('继续讨论失败，请稍后重试')).toBeNull()
  })

  it('lands in the error state when the opener itself fails', async () => {
    const face = faceWith()
    const openConversation = vi.fn(async () => { throw new Error('session list refused') })
    await openDetail(face, openConversation)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()
    expect(openConversation).toHaveBeenCalledWith('session-new')
    expect(screen.getByText('继续讨论失败，请稍后重试')).toBeTruthy()
  })

  it('resets the continue state when another idea is opened', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const face = faceWith(() => gate.then(() => continueResult()))
    const surface = newSurface(face)
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    expect(surface.state.getSnapshot().continueStatus).toBe('loading')

    await act(async () => { surface.open('idea_2') })
    expect(surface.state.getSnapshot().continueStatus).toBe('idle')
    await act(async () => { release?.() })
  })

  it('sends the resolved workspace id and opens the Host-returned conversation', async () => {
    const face = faceWith()
    const openConversation = vi.fn(async () => {})
    const prepareWorkspace = vi.fn(async () => 'workspace-a')
    const surface = new IdeaReadSurface(face, openConversation, prepareWorkspace)
    pendings.push(() => surface.dispose())
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()

    expect(prepareWorkspace).toHaveBeenCalledTimes(1)
    // The request carries only the Workspace: never a client-nominated
    // conversation id.
    expect(face.continueDiscussion).toHaveBeenCalledWith({ id: 'idea_1', workspaceId: 'workspace-a' })
    expect(openConversation).toHaveBeenCalledWith('session-new')
  })

  it('sends no workspace when none is selected, letting the Host choose', async () => {
    const face = faceWith()
    const openConversation = vi.fn(async () => {})
    const prepareWorkspace = vi.fn(async () => undefined)
    const surface = new IdeaReadSurface(face, openConversation, prepareWorkspace)
    pendings.push(() => surface.dispose())
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()

    expect(face.continueDiscussion).toHaveBeenCalledWith({ id: 'idea_1' })
    expect(openConversation).toHaveBeenCalledWith('session-new')
  })

  it('lands in the error state when the workspace selection itself fails', async () => {
    const face = faceWith()
    const openConversation = vi.fn(async () => {})
    const prepareWorkspace = vi.fn(async () => { throw new Error('workspace store refused') })
    const surface = new IdeaReadSurface(face, openConversation, prepareWorkspace)
    pendings.push(() => surface.dispose())
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '继续讨论' })) })
    await flush()

    expect(face.continueDiscussion).not.toHaveBeenCalled()
    expect(openConversation).not.toHaveBeenCalled()
    expect(screen.getByText('继续讨论失败，请稍后重试')).toBeTruthy()
  })
})

describe('continuation workspace selection', () => {
  const row = (workspaceId: string, sessionIds: string[], updatedAt: string) =>
    ({ workspaceId, sessionIds, updatedAt })

  it('prefers the workspace of the current session', () => {
    const items = [
      row('workspace-old', ['session-1'], '2026-09-01T00:00:00.000Z'),
      row('workspace-current', ['session-2'], '2026-09-01T00:00:00.000Z'),
    ]
    expect(selectContinuationWorkspace(items, 'session-2')).toBe('workspace-current')
  })

  it('falls back to the most recently updated workspace', () => {
    const items = [
      row('workspace-older', ['session-1'], '2026-09-01T00:00:00.000Z'),
      row('workspace-newest', ['session-9'], '2026-09-17T00:00:00.000Z'),
    ]
    // Neither the absent current session nor no current session at all can
    // anchor the choice, so recency decides.
    expect(selectContinuationWorkspace(items, 'session-absent')).toBe('workspace-newest')
    expect(selectContinuationWorkspace(items, undefined)).toBe('workspace-newest')
  })

  it('selects nothing when no workspace exists', () => {
    expect(selectContinuationWorkspace([], 'session-1')).toBeUndefined()
    expect(selectContinuationWorkspace([], undefined)).toBeUndefined()
  })
})
