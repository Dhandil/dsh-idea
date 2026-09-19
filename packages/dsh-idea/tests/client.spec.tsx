/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the Save Idea surface: plugin mount (one unified
 * action entry, three composer overlays, the settings section, the `idea`
 * command, and the `idea` composer reference source with its canonical
 * codec), the unified per-message action and its two-operation menu, the
 * preview modal, and the per-session state engine. The Host face is a
 * scripted IdeaRemoteFace; no live Host, provider, or model call.
 * @module tests/client.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import { IdeaSaveSurface, durableFrom, listItemsOf } from '../src/client/state.ts'
import type { EditableIdeaDraft, IdeaRemoteFace, IdeaSaveState } from '../src/client/state.ts'
import { zh } from '../src/client/locales.ts'
import { IdeaAssistantActions } from '../src/client/IdeaAssistantActions.tsx'
import { IdeaSaveDialog } from '../src/client/IdeaSaveDialog.tsx'
import { formatIdeaReferenceMention } from '../src/reference/uri.ts'
import type { UnifiedActionProps, IdeaDialogProps } from '../src/client/slots.ts'
import type { IdeaDraft } from '../src/types.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  for (const dispose of pendings.splice(0)) dispose()
})

/** Surfaces to dispose after each test (aborts in-flight prepares). */
const pendings: Array<() => void> = []

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

/** The fake `t` seat: zh interpolation, exactly the placeholders we use. */
const t = ((key: string, params?: Record<string, unknown>): string =>
  (zh as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))) as never

/** A deferred promise for gating the fake Host face. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

const previewDraft: IdeaDraft = {
  title: 'Model title',
  core: 'Model core',
  motivation: 'Model motivation',
  currentConclusion: 'Model conclusion',
  possibleValue: 'Model value',
  useWhen: ['u1', 'u2'],
  openQuestions: ['q1'],
}
const sourceInfo = { sessionId: 'session-1', anchorMessageId: 'a1', startSeq: 1, endSeq: 2, messageCount: 2, characterCount: 30 }
const okPreview = () => ({
  ok: true as const,
  value: { preparationId: 'prep_1', draft: previewDraft, source: sourceInfo },
})
const okCreate = () => ({
  ok: true as const,
  value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 'Model title', createdAt: 1 },
})

/** A scripted Host face plus the spies. */
function faceWith(prepare?: () => Promise<unknown>, create?: () => Promise<unknown>): IdeaRemoteFace {
  return {
    prepareFromMessage: vi.fn(prepare ?? (async () => okPreview())),
    create: vi.fn(create ?? (async () => okCreate())),
  } as unknown as IdeaRemoteFace
}

function newSurface(face: IdeaRemoteFace, sessionId = 'session-1'): IdeaSaveSurface {
  const surface = new IdeaSaveSurface(face, sessionId)
  pendings.push(() => surface.dispose())
  return surface
}

/** The framework-synthesized selector hook over the surface's store. */
const useIdeaOf = <T,>(store: SnapshotStore<T>) =>
  (select: (state: T) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))

/** A minimal store shaped for the unified action's two pending selectors. */
function pendingStore(): SnapshotStore<Partial<IdeaSaveState> & { loadingMessageId: string | null }> {
  return createSnapshotStore({ preparingMessageId: null, loadingMessageId: null })
}

function actionProps(
  surface: IdeaSaveSurface,
  relatedStore = pendingStore(),
  messageId = 'a1',
): UnifiedActionProps {
  return {
    messageId,
    prepare: (id: MessageId) => { surface.prepare(id) },
    findRelated: () => {},
    useIdea: useIdeaOf(surface.state),
    useRelated: useIdeaOf(relatedStore),
    t,
  } as unknown as UnifiedActionProps
}

function dialogProps(surface: IdeaSaveSurface): IdeaDialogProps {
  return {
    editDraft: (patch: Partial<EditableIdeaDraft>) => { surface.editDraft(patch) },
    submit: () => { surface.submit() },
    cancel: () => { surface.cancel() },
    dismissFailure: () => { surface.dismissFailure() },
    dismissToast: (seq: number) => { surface.dismissToast(seq) },
    useIdea: useIdeaOf(surface.state),
    t,
  } as unknown as IdeaDialogProps
}

/** Prepare through the engine and wait for the modal to open. */
const MSG = 'a1' as MessageId

async function openModal(surface: IdeaSaveSurface, face: IdeaRemoteFace): Promise<void> {
  await act(async () => { surface.prepare(MSG) })
  await flush()
  expect(face.prepareFromMessage).toHaveBeenCalledTimes(1)
  expect(surface.state.getSnapshot().modal).not.toBeNull()
}

const openMenu = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存为 Idea' })) })
}

describe('client plugin mount', () => {
  it('mounts its own generated Remote contribution, then registers the UI', async () => {
    const ctx = new Context()
    const mountedContributions: Array<{ package?: string, descriptors?: Array<{ id: string }> }> = []
    const slotRegistrations: Array<{ name: string, id: string, order: number, locale: string }> = []
    const slotComponents: unknown[] = []
    const slotInjectNames: string[] = []
    const localeRegisters: string[] = []
    const commandRegisters: unknown[] = []
    const triggerSources: unknown[] = []
    let remoteUnmounts = 0
    ctx.provide('remote', {
      $mount: vi.fn(async (contribution: { package?: string, descriptors?: Array<{ id: string }> }) => {
        mountedContributions.push(contribution)
        ctx.provide('remote.idea', {
          prepareFromMessage: vi.fn(),
          create: vi.fn(),
          get: vi.fn(),
          search: vi.fn(),
        } as never)
        return async () => { remoteUnmounts += 1 }
      }),
    } as never)
    ctx.provide('locale', {
      register: vi.fn((ns: string) => { localeRegisters.push(ns) }),
      bind: vi.fn(() => (key: string) => key),
    } as never)
    ctx.provide('slots', {
      inject: vi.fn((name: string, register: () => void) => { slotInjectNames.push(name); register() }),
      register: vi.fn((registration: { name: string, id: string, order: number, locale: string }, component: unknown) => {
        slotRegistrations.push(registration)
        slotComponents.push(component)
      }),
    } as never)
    ctx.provide('sessions', {
      refresh: vi.fn(async () => {}),
      open: vi.fn(() => {}),
      scope: vi.fn(() => undefined),
      list: { getSnapshot: () => ({ current: undefined }) },
    } as never)
    ctx.provide('commandUi', { register: vi.fn((registration: unknown) => { commandRegisters.push(registration) }) } as never)
    ctx.provide('inputTriggers', { registerSource: vi.fn((source: unknown) => { triggerSources.push(source) }) } as never)
    ctx.provide('conversation', { input: { for: vi.fn() } } as never)

    const { apply } = await import('../src/client/index.ts')
    const dispose = await apply(ctx)

    expect(ctx.remote.$mount).toHaveBeenCalledTimes(1)
    expect(mountedContributions).toHaveLength(1)
    const contribution = mountedContributions[0]!
    expect(contribution.package).toBe('@dsh-external/dsh-idea')
    expect(contribution.descriptors?.map(d => d.id).sort()).toEqual([
      '@dsh-external/dsh-idea#idea/archive',
      '@dsh-external/dsh-idea#idea/commitEvolution',
      '@dsh-external/dsh-idea#idea/continueDiscussion',
      '@dsh-external/dsh-idea#idea/create',
      '@dsh-external/dsh-idea#idea/deleteIdea',
      '@dsh-external/dsh-idea#idea/get',
      '@dsh-external/dsh-idea#idea/getVersion',
      '@dsh-external/dsh-idea#idea/getVersions',
      '@dsh-external/dsh-idea#idea/list',
      '@dsh-external/dsh-idea#idea/manualEdit',
      '@dsh-external/dsh-idea#idea/prepareEvolution',
      '@dsh-external/dsh-idea#idea/prepareFromMessage',
      '@dsh-external/dsh-idea#idea/relatedFromMessage',
      '@dsh-external/dsh-idea#idea/restore',
      '@dsh-external/dsh-idea#idea/search',
    ])
    expect(localeRegisters).toEqual(['idea'])
    expect(slotInjectNames).toEqual([
      'conversation.chat.assistant-actions',
      'conversation.input.overlay',
      'conversation.input.overlay',
      'conversation.input.overlay',
      'settings.section',
    ])

    // The one unified per-message action entry.
    const action = slotRegistrations.find(entry => entry.id === 'idea')
    expect(action).toMatchObject({ name: 'conversation.chat.assistant-actions', order: 20, locale: 'idea' })
    const actionInjected = action !== undefined
      ? (action as unknown as { inject: (sessionId: string) => unknown }).inject('session-1') as {
          hooks: { idea: unknown; related: unknown }
          prepare: (messageId: string) => void
          findRelated: (messageId: string) => void
        }
      : undefined
    expect(actionInjected?.hooks.idea).toBeDefined()
    expect(actionInjected?.hooks.related).toBeDefined()
    expect(typeof actionInjected?.prepare).toBe('function')
    expect(typeof actionInjected?.findRelated).toBe('function')

    // The three composer overlays: preview modal, related overlay, search card.
    const dialog = slotRegistrations.find(entry => entry.id === 'idea-dialog')
    expect(dialog).toMatchObject({ name: 'conversation.input.overlay', order: 3, locale: 'idea' })
    const relatedOverlay = slotRegistrations.find(entry => entry.id === 'idea-related')
    expect(relatedOverlay).toMatchObject({ name: 'conversation.input.overlay', order: 4, locale: 'idea' })
    const relatedInjected = relatedOverlay !== undefined
      ? (relatedOverlay as unknown as { inject: (sessionId: string) => unknown }).inject('session-1') as {
          hooks: { related: unknown }
          close: () => void
          getDetail: (id: string) => Promise<unknown>
          add: (descriptor: unknown) => void
        }
      : undefined
    expect(relatedInjected?.hooks.related).toBeDefined()
    expect(typeof relatedInjected?.close).toBe('function')
    expect(typeof relatedInjected?.getDetail).toBe('function')
    expect(typeof relatedInjected?.add).toBe('function')
    const searchOverlay = slotRegistrations.find(entry => entry.id === 'idea-search')
    expect(searchOverlay).toMatchObject({ name: 'conversation.input.overlay', order: 5, locale: 'idea' })
    const searchInjected = searchOverlay !== undefined
      ? (searchOverlay as unknown as { inject: (sessionId: string) => unknown }).inject('session-1') as {
          hooks: { search: unknown }
          setQuery: (query: string) => void
          select: (id: string) => void
          retry: () => void
          add: (descriptor: unknown) => void
          close: () => void
        }
      : undefined
    expect(searchInjected?.hooks.search).toBeDefined()
    expect(typeof searchInjected?.setQuery).toBe('function')
    expect(typeof searchInjected?.select).toBe('function')
    expect(typeof searchInjected?.retry).toBe('function')
    expect(typeof searchInjected?.add).toBe('function')
    expect(typeof searchInjected?.close).toBe('function')

    const section = slotRegistrations.find(entry => entry.id === 'ideas')
    expect(section).toMatchObject({ name: 'settings.section', order: 25, locale: 'idea' })
    expect(typeof (section as unknown as { label?: unknown } | undefined)?.label).toBe('function')
    expect(slotComponents).toHaveLength(5)

    const sectionInjected = section !== undefined
      ? (section as unknown as { inject: () => unknown }).inject() as {
          hooks: { ideaRead: unknown }
          load: () => void
          open: (id: string) => void
          closeDetail: () => void
          continueIdea: (id: string) => void
          prepareEvolution: () => void
          editProposalDraft: (patch: unknown) => void
          cancelProposal: () => void
          commitProposal: () => void
        }
      : undefined
    expect(typeof sectionInjected?.load).toBe('function')
    expect(typeof sectionInjected?.open).toBe('function')
    expect(typeof sectionInjected?.closeDetail).toBe('function')
    expect(typeof sectionInjected?.continueIdea).toBe('function')
    expect(typeof sectionInjected?.prepareEvolution).toBe('function')
    expect(typeof sectionInjected?.editProposalDraft).toBe('function')
    expect(typeof sectionInjected?.cancelProposal).toBe('function')
    expect(typeof sectionInjected?.commitProposal).toBe('function')
    expect(sectionInjected?.hooks.ideaRead).toBeDefined()

    // The `idea` command: the single composer `+`-menu entry opening the card.
    expect(commandRegisters).toHaveLength(1)
    const command = commandRegisters[0]! as { name: string; icon: unknown; available: () => boolean; ui: { kind: string; run: (session: { sessionId: string }) => void } }
    expect(command.name).toBe('idea')
    expect(command.icon).toBeDefined()
    expect(command.available()).toBe(true)
    expect(command.ui.kind).toBe('action')

    // The `idea` composer reference source owns the chip codec: every
    // serialized reference must be one canonical mention.
    expect(triggerSources).toHaveLength(1)
    const source = triggerSources[0]! as {
      trigger: string
      name: string
      showGroupTitle: boolean
      candidates: () => Promise<unknown[]>
      codec: { clipboardText: (ref: string) => string; serialize: (ref: string) => Promise<string> }
    }
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('idea')
    expect(source.showGroupTitle).toBe(false)
    await expect(source.candidates()).resolves.toEqual([])
    const mention = formatIdeaReferenceMention({ ideaId: 'idea_1', versionId: 'idea_ver_1' }, 'Title')
    expect(source.codec.clipboardText(mention)).toBe(mention)
    await expect(source.codec.serialize(mention)).resolves.toBe(mention)
    await expect(source.codec.serialize('plain text')).rejects.toThrow()
    await expect(source.codec.serialize(`${mention} and ${mention}`)).rejects.toThrow()

    await dispose()
    expect(remoteUnmounts).toBe(1)
  })
})

describe('unified idea action', () => {
  it('renders exactly one entry with the outline icon, no emoji, and no text verb', () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaAssistantActions {...actionProps(surface)} />)
    const button = screen.getByRole('button', { name: '保存为 Idea' })
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).not.toContain('💡')
    expect(button.textContent).not.toContain('关联')
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    // The menu is closed: no operation rows exist yet.
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('opens a menu with exactly the two operations 总结 and 相关', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaAssistantActions {...actionProps(surface)} />)
    await openMenu()
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(2)
    expect(items.map(item => item.textContent)).toEqual(['总结', '相关'])
  })

  it('总结 prepares once for its own message and closes the menu', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaAssistantActions {...actionProps(surface)} />)
    await openMenu()
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '总结' })) })
    await flush()
    expect(face.prepareFromMessage).toHaveBeenCalledWith({ sessionId: 'session-1', messageId: 'a1' }, expect.any(AbortSignal))
    expect(face.prepareFromMessage).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('相关 triggers exactly one judge call and closes the menu', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    const findRelated = vi.fn()
    render(<IdeaAssistantActions {...{ ...actionProps(surface), findRelated } as unknown as UnifiedActionProps} />)
    await openMenu()
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '相关' })) })
    expect(findRelated).toHaveBeenCalledTimes(1)
    expect(findRelated).toHaveBeenCalledWith('a1')
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('disables a running operation and folds its duplicate click', async () => {
    const gate = deferred<unknown>()
    const face = faceWith(() => gate.promise)
    const surface = newSurface(face)
    render(<IdeaAssistantActions {...actionProps(surface)} />)
    await openMenu()
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '总结' })) })
    await flush()
    expect(face.prepareFromMessage).toHaveBeenCalledTimes(1)
    // Reopen while the prepare is still running: 总结 disabled, 相关 live.
    await openMenu()
    expect((screen.getByRole('menuitem', { name: '总结' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('menuitem', { name: '相关' }) as HTMLButtonElement).disabled).toBe(false)
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '总结' })) })
    expect(face.prepareFromMessage).toHaveBeenCalledTimes(1)

    await act(async () => { gate.resolve(okPreview()) })
    await flush()
  })

  it('Escape closes the menu without firing any verb', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaAssistantActions {...actionProps(surface)} />)
    await openMenu()
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(face.prepareFromMessage).not.toHaveBeenCalled()
  })

  it('coexists with neighboring actions in the row', () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(
      <div>
        <button type="button">echo</button>
        <IdeaAssistantActions {...actionProps(surface)} />
      </div>,
    )
    expect(screen.getByRole('button', { name: 'echo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '保存为 Idea' })).toBeTruthy()
  })
})

describe('preview modal', () => {
  it('opens on prepare success with all seven fields populated', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    await openModal(surface, face)
    render(<IdeaSaveDialog {...dialogProps(surface)} />)

    expect(screen.getByText('保存 Idea')).toBeTruthy()
    expect(screen.getByText('来源：当前对话 · 2 条消息')).toBeTruthy()
    expect((screen.getByLabelText('标题 *') as HTMLInputElement).value).toBe('Model title')
    expect((screen.getByLabelText('核心想法 *') as HTMLTextAreaElement).value).toBe('Model core')
    expect((screen.getByLabelText('为什么值得保留 *') as HTMLTextAreaElement).value).toBe('Model motivation')
    expect((screen.getByLabelText('当前结论') as HTMLTextAreaElement).value).toBe('Model conclusion')
    expect((screen.getByLabelText('可能价值') as HTMLTextAreaElement).value).toBe('Model value')
    expect((screen.getByLabelText('适用场景（每行一条）') as HTMLTextAreaElement).value).toBe('u1\nu2')
    expect((screen.getByLabelText('待解决问题（每行一条）') as HTMLTextAreaElement).value).toBe('q1')
  })

  it('updates the local draft while editing', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    await openModal(surface, face)
    render(<IdeaSaveDialog {...dialogProps(surface)} />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('标题 *'), { target: { value: 'Edited title' } })
      fireEvent.change(screen.getByLabelText('适用场景（每行一条）'), { target: { value: 'u1\n  u2 \n\n u3 ' } })
    })
    const draft = surface.state.getSnapshot().modal?.draft
    expect(draft?.title).toBe('Edited title')
    expect(draft?.useWhenText).toBe('u1\n  u2 \n\n u3 ')
  })

  it('cancels with zero durable writes', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    await openModal(surface, face)
    render(<IdeaSaveDialog {...dialogProps(surface)} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '取消' })) })
    await flush()
    expect(face.create).not.toHaveBeenCalled()
    expect(surface.state.getSnapshot().modal).toBeNull()
  })

  it('submits only the preparation reference and the edited draft; double-click sends one create', async () => {
    const gate = deferred<unknown>()
    const face = faceWith(undefined, () => gate.promise)
    const surface = newSurface(face)
    await openModal(surface, face)
    render(<IdeaSaveDialog {...dialogProps(surface)} />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('标题 *'), { target: { value: 'Edited title' } })
    })
    const save = screen.getByRole('button', { name: '保存' })
    await act(async () => {
      fireEvent.click(save)
      surface.submit()
    })
    expect(face.create).toHaveBeenCalledTimes(1)
    const request = ((face.create as ReturnType<typeof vi.fn>).mock.calls[0]! as Array<{ preparationId: string, draft: IdeaDraft }>)[0]!
    expect(request.preparationId).toBe('prep_1')
    expect(request.draft).toEqual({ ...previewDraft, title: 'Edited title' })

    await act(async () => { gate.resolve(okCreate()) })
    await flush()
    expect(surface.state.getSnapshot().modal).toBeNull()
    expect(surface.state.getSnapshot().failure).toBeNull()
    expect(surface.state.getSnapshot().toastSeq).toBe(1)
    expect(screen.getByText('Idea 已保存')).toBeTruthy()
  })

  it('keeps the modal and draft open on a storage failure and allows retry', async () => {
    let attempts = 0
    const face = faceWith(undefined, async () => {
      attempts += 1
      return attempts === 1
        ? { ok: false as const, error: { code: 'idea/storage-failed' } }
        : okCreate()
    })
    const surface = newSurface(face)
    await openModal(surface, face)
    render(<IdeaSaveDialog {...dialogProps(surface)} />)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('标题 *'), { target: { value: 'Edited title' } })
      fireEvent.click(screen.getByRole('button', { name: '保存' }))
    })
    await flush()
    expect(attempts).toBe(1)
    expect(surface.state.getSnapshot().failure).toBe('save-failed')
    expect(surface.state.getSnapshot().modal?.draft.title).toBe('Edited title')
    expect(screen.getByText('保存失败，请稍后重试')).toBeTruthy()
    expect(screen.getByText('保存 Idea')).toBeTruthy()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
    await flush()
    expect(attempts).toBe(2)
    expect(surface.state.getSnapshot().modal).toBeNull()
    expect(surface.state.getSnapshot().toastSeq).toBe(1)
  })

  it('shows explicit expired copy and keeps the draft when the preparation expired', async () => {
    const face = faceWith(undefined, async () => ({ ok: false as const, error: { code: 'idea/preparation-not-found' } }))
    const surface = newSurface(face)
    await openModal(surface, face)
    render(<IdeaSaveDialog {...dialogProps(surface)} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存' })) })
    await flush()
    expect(surface.state.getSnapshot().failure).toBe('expired')
    expect(screen.getByText('预览已过期，请关闭后重新通过回答旁的 Idea 菜单生成')).toBeTruthy()
    expect((screen.getByLabelText('标题 *') as HTMLInputElement).value).toBe('Model title')
    expect(screen.queryByText('保存失败，请稍后重试')).toBeNull()
  })

  it('keeps fields usable on a narrow viewport: form is a single injected flex column', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    await openModal(surface, face)
    render(
      <div data-composer-card="">
        <IdeaSaveDialog {...dialogProps(surface)} />
      </div>,
    )
    const form = document.querySelector('.dsh-idea-form')
    expect(form).not.toBeNull()
    const sheet = document.querySelector('style[data-plugin-css=\'@dsh-external/dsh-idea/client.css\']')
    expect(sheet).not.toBeNull()
    expect(sheet?.textContent).toContain('flex-direction: column')
  })
})

describe('prepare lifecycle edges', () => {
  it('session unmount cancels a pending prepare without a failure toast', async () => {
    const gate = deferred<unknown>()
    let captured: AbortSignal | undefined
    const face = faceWith((_req?: unknown, signal?: AbortSignal) => {
      captured = signal
      return gate.promise
    })
    const surface = newSurface(face)
    await act(async () => { surface.prepare(MSG) })
    expect(surface.state.getSnapshot().preparingMessageId).toBe(MSG)

    surface.dispose()
    expect(captured?.aborted).toBe(true)

    await act(async () => { gate.resolve(okPreview()) })
    await flush()
    const state = surface.state.getSnapshot()
    expect(state.preparingMessageId).toBeNull()
    expect(state.modal).toBeNull()
    expect(state.failure).toBeNull()
  })
})

describe('draft normalization', () => {
  it('normalizes newline lists: trim, drop empties, preserve order', () => {
    expect(listItemsOf('  a \n\n b\n\nc  ')).toEqual(['a', 'b', 'c'])
    expect(listItemsOf('\n\n')).toEqual([])
    const durable = durableFrom({
      title: 't', core: 'c', motivation: 'm', currentConclusion: '', possibleValue: '',
      useWhenText: ' x \n\ny', openQuestionsText: '',
    })
    expect(durable.useWhen).toEqual(['x', 'y'])
    expect(durable.openQuestions).toEqual([])
  })
})
