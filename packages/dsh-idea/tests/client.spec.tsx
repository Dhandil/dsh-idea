/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the Save Idea surface: plugin mount, the `💡`
 * action, the preview modal, and the per-session state engine. The Host face
 * is a scripted IdeaRemoteFace; no live Host, provider, or model call.
 * @module tests/client.spec
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import { IdeaSaveSurface, durableFrom, listItemsOf } from '../src/client/state.ts'
import type { EditableIdeaDraft, IdeaRemoteFace, IdeaSaveState } from '../src/client/state.ts'
import { zh } from '../src/client/locales.ts'
import { IdeaMessageActions } from '../src/client/IdeaMessageActions.tsx'
import { IdeaSaveDialog } from '../src/client/IdeaSaveDialog.tsx'
import type { IdeaActionProps, IdeaDialogProps } from '../src/client/slots.ts'
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
const useIdeaOf = (store: SnapshotStore<IdeaSaveState>) =>
  (select: (state: IdeaSaveState) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))

function actionProps(surface: IdeaSaveSurface, messageId = 'a1'): IdeaActionProps {
  return {
    messageId,
    prepare: (id: MessageId) => { surface.prepare(id) },
    useIdea: useIdeaOf(surface.state),
    t,
  } as unknown as IdeaActionProps
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
  } as unknown as IdeaDialogProps}

/** Prepare through the engine and wait for the modal to open. */
const MSG = 'a1' as MessageId

async function openModal(surface: IdeaSaveSurface, face: IdeaRemoteFace): Promise<void> {
  await act(async () => { surface.prepare(MSG) })
  await flush()
  expect(face.prepareFromMessage).toHaveBeenCalledTimes(1)
  expect(surface.state.getSnapshot().modal).not.toBeNull()
}

describe('client plugin mount', () => {
  it('mounts its own generated Remote contribution, then registers the UI', async () => {
    const ctx = new Context()
    const mountedContributions: Array<{ package?: string, descriptors?: Array<{ id: string }> }> = []
    const slotRegistrations: Array<{ name: string, id: string, order: number, locale: string }> = []
    const slotComponents: unknown[] = []
    const slotInjectNames: string[] = []
    const localeRegisters: string[] = []
    let remoteUnmounts = 0
    ctx.provide('remote', {
      $mount: vi.fn(async (contribution: { package?: string, descriptors?: Array<{ id: string }> }) => {
        mountedContributions.push(contribution)
        ctx.provide('remote.idea', { prepareFromMessage: vi.fn(), create: vi.fn() } as never)
        return async () => { remoteUnmounts += 1 }
      }),
    } as never)
    ctx.provide('locale', { register: vi.fn((ns: string) => { localeRegisters.push(ns) }) } as never)
    ctx.provide('slots', {
      inject: vi.fn((name: string, register: () => void) => { slotInjectNames.push(name); register() }),
      register: vi.fn((registration: { name: string, id: string, order: number, locale: string }, component: unknown) => {
        slotRegistrations.push(registration)
        slotComponents.push(component)
      }),
    } as never)
    ctx.provide('sessions', { refresh: vi.fn(async () => {}), open: vi.fn(() => {}) } as never)

    const { apply } = await import('../src/client/index.ts')
    const dispose = await apply(ctx)

    expect(ctx.remote.$mount).toHaveBeenCalledTimes(1)
    expect(mountedContributions).toHaveLength(1)
    const contribution = mountedContributions[0]!
    expect(contribution.package).toBe('@dsh-external/dsh-idea')
    expect(contribution.descriptors?.map(d => d.id).sort()).toEqual([
      '@dsh-external/dsh-idea#idea/continueDiscussion',
      '@dsh-external/dsh-idea#idea/create',
      '@dsh-external/dsh-idea#idea/get',
      '@dsh-external/dsh-idea#idea/getVersion',
      '@dsh-external/dsh-idea#idea/getVersions',
      '@dsh-external/dsh-idea#idea/list',
      '@dsh-external/dsh-idea#idea/prepareFromMessage',
    ])
    expect(localeRegisters).toEqual(['idea'])
    expect(slotInjectNames).toEqual([
      'conversation.chat.assistant-actions',
      'conversation.input.overlay',
      'settings.section',
    ])

    const action = slotRegistrations.find(entry => entry.id === 'idea')
    expect(action).toMatchObject({ name: 'conversation.chat.assistant-actions', order: 20, locale: 'idea' })
    const dialog = slotRegistrations.find(entry => entry.id === 'idea-dialog')
    expect(dialog).toMatchObject({ name: 'conversation.input.overlay', order: 3, locale: 'idea' })
    const section = slotRegistrations.find(entry => entry.id === 'ideas')
    expect(section).toMatchObject({ name: 'settings.section', order: 25, locale: 'idea' })
    expect(typeof (section as unknown as { label?: unknown } | undefined)?.label).toBe('function')
    expect(slotComponents).toHaveLength(3)

    const injected = action !== undefined
      ? (action as unknown as { inject: (sessionId: string) => unknown }).inject('session-1') as { hooks: { idea: unknown }, prepare: (messageId: string) => void }
      : undefined
    expect(typeof injected?.prepare).toBe('function')
    expect(injected?.hooks.idea).toBeDefined()

    const sectionInjected = section !== undefined
      ? (section as unknown as { inject: () => unknown }).inject() as { hooks: { ideaRead: unknown }, load: () => void, open: (id: string) => void, closeDetail: () => void, continueIdea: (id: string) => void }
      : undefined
    expect(typeof sectionInjected?.load).toBe('function')
    expect(typeof sectionInjected?.open).toBe('function')
    expect(typeof sectionInjected?.closeDetail).toBe('function')
    expect(typeof sectionInjected?.continueIdea).toBe('function')
    expect(sectionInjected?.hooks.ideaRead).toBeDefined()

    await dispose()
    expect(remoteUnmounts).toBe(1)
  })
})

describe('💡 action', () => {
  it('appears in the assistant action row and prepares for its own message', async () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(<IdeaMessageActions {...actionProps(surface)} />)
    const button = screen.getByRole('button', { name: '保存为 Idea' })
    expect(button.textContent).toContain('💡')
    await act(async () => { fireEvent.click(button) })
    await flush()
    expect(face.prepareFromMessage).toHaveBeenCalledWith({ sessionId: 'session-1', messageId: 'a1' }, expect.any(AbortSignal))
    expect(surface.state.getSnapshot().modal).not.toBeNull()
  })

  it('shows the loading state and swallows duplicate clicks while preparing', async () => {
    const gate = deferred<unknown>()
    const face = faceWith(() => gate.promise)
    const surface = newSurface(face)
    render(<IdeaMessageActions {...actionProps(surface)} />)

    await act(async () => {
      surface.prepare(MSG)
      surface.prepare(MSG)
    })
    expect(face.prepareFromMessage).toHaveBeenCalledTimes(1)
    expect(surface.state.getSnapshot().preparingMessageId).toBe('a1')
    expect((screen.getByRole('button', { name: '保存为 Idea' }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => { gate.resolve(okPreview()) })
    await flush()
    expect(surface.state.getSnapshot().modal).not.toBeNull()
  })

  it('coexists with neighboring actions in the row', () => {
    const face = faceWith()
    const surface = newSurface(face)
    render(
      <div>
        <button type="button">echo</button>
        <IdeaMessageActions {...actionProps(surface)} />
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
    expect(screen.getByText('预览已过期，请关闭后重新点击 💡 生成')).toBeTruthy()
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
