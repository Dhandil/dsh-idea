/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the Related Ideas surface: the per-message action
 * beside Save Idea, the one-query lifecycle (duplicate clicks folded,
 * loading/ready/empty/error states), canonical card rendering, close and
 * dispose semantics (abort plus stale-completion immunity), and separation
 * from the Save Idea state. The Host face is a scripted IdeaRelatedFace; no
 * live Host, provider, or model call.
 * @module tests/client-related.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import { IdeaSaveSurface } from '../src/client/state.ts'
import { RelatedIdeasSurface } from '../src/client/related-state.ts'
import type { IdeaRelatedFace } from '../src/client/related-state.ts'
import { zh } from '../src/client/locales.ts'
import { IdeaRelatedActions } from '../src/client/IdeaRelatedActions.tsx'
import { IdeaRelatedOverlay } from '../src/client/IdeaRelatedOverlay.tsx'
import { IdeaMessageActions } from '../src/client/IdeaMessageActions.tsx'
import type { IdeaActionProps, RelatedActionProps, RelatedOverlayProps } from '../src/client/slots.ts'
import type { IdeaRelatedMatch, IdeaRelatedResult } from '../src/remote-host/types.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  for (const dispose of pendings.splice(0)) dispose()
})

/** Surfaces to dispose after each test (aborts in-flight queries). */
const pendings: Array<() => void> = []

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

/** The fake `t` seat: zh interpolation, exactly the placeholders we use. */
const t = ((key: string, params?: Record<string, unknown>): string =>
  (zh as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))) as never

/** A deferred promise for gating the fake Host face. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const matchOf = (id: string, title: string): IdeaRelatedMatch => ({
  idea: { id, currentVersionId: `idea_ver_${id}`, title, core: `Core of ${title}`, updatedAt: 5 },
  whyUsefulNow: `${title} answers the open question now`,
})

const okRelated = (items: IdeaRelatedMatch[]): { ok: true; value: IdeaRelatedResult } => ({
  ok: true,
  value: { items },
})

/** A scripted Host face plus the spy. */
function relatedFace(run?: (request: unknown, signal?: AbortSignal) => Promise<unknown>): IdeaRelatedFace {
  return {
    relatedFromMessage: vi.fn(run ?? (async () => okRelated([matchOf('idea_1', 'Alpha idea')]))),
  } as unknown as IdeaRelatedFace
}

function newSurface(face: IdeaRelatedFace, sessionId = 'session-1'): RelatedIdeasSurface {
  const surface = new RelatedIdeasSurface(face, sessionId)
  pendings.push(() => surface.dispose())
  return surface
}

/** The framework-synthesized selector hook over the surface's store. */
const useIdeaOf = <T,>(store: SnapshotStore<T>) =>
  (select: (state: T) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))

const useRelatedOf = useIdeaOf<ReturnType<RelatedIdeasSurface['state']['getSnapshot']>>

function actionProps(surface: RelatedIdeasSurface, messageId = 'a1'): RelatedActionProps {
  return {
    messageId,
    findRelated: (id: MessageId) => { surface.findRelated(id) },
    useRelated: useRelatedOf(surface.state),
    t,
  } as unknown as RelatedActionProps
}

function overlayProps(surface: RelatedIdeasSurface): RelatedOverlayProps {
  return {
    close: () => { surface.close() },
    useRelated: useRelatedOf(surface.state),
    t,
  } as unknown as RelatedOverlayProps
}

const MSG = 'a1' as MessageId

describe('related action', () => {
  it('appears beside the Save Idea action in the row', () => {
    const face = relatedFace()
    const surface = newSurface(face)
    const saveFace = { prepareFromMessage: vi.fn(), create: vi.fn() } as never
    const save = new IdeaSaveSurface(saveFace, 'session-1')
    pendings.push(() => save.dispose())
    render(
      <div>
        <IdeaMessageActions {...{
          messageId: MSG,
          prepare: () => {},
          useIdea: useIdeaOf(save.state),
          t,
        } as unknown as IdeaActionProps} />
        <IdeaRelatedActions {...actionProps(surface)} />
      </div>,
    )
    expect(screen.getByRole('button', { name: '保存为 Idea' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '关联 Idea' })).toBeTruthy()
  })

  it('sends the session and message identity with a signal on click', async () => {
    const face = relatedFace()
    const surface = newSurface(face)
    render(<IdeaRelatedActions {...actionProps(surface)} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '关联 Idea' })) })
    await flush()
    expect(face.relatedFromMessage).toHaveBeenCalledWith({ sessionId: 'session-1', messageId: 'a1' }, expect.any(AbortSignal))
    expect(surface.state.getSnapshot().status).toBe('ready')
  })

  it('folds a duplicate click while pending and disables the control', async () => {
    const gate = deferred<unknown>()
    const face = relatedFace(() => gate.promise)
    const surface = newSurface(face)
    render(<IdeaRelatedActions {...actionProps(surface)} />)

    await act(async () => {
      surface.findRelated(MSG)
      surface.findRelated(MSG)
    })
    expect(face.relatedFromMessage).toHaveBeenCalledTimes(1)
    expect(surface.state.getSnapshot().loadingMessageId).toBe(MSG)
    expect((screen.getByRole('button', { name: '关联 Idea' }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => { gate.resolve(okRelated([])) })
    await flush()
    expect(surface.state.getSnapshot().status).toBe('ready')
  })
})

describe('related overlay', () => {
  it('shows the loading copy while the query is in flight', async () => {
    const face = relatedFace(() => new Promise<unknown>(() => {}))
    const surface = newSurface(face)
    await act(async () => { surface.findRelated(MSG) })
    render(<IdeaRelatedOverlay {...overlayProps(surface)} />)
    expect(screen.getByText('关联 Idea')).toBeTruthy()
    expect(screen.getByText('正在查找关联 Idea…')).toBeTruthy()
  })

  it('renders canonical cards with the why-useful-now reason', async () => {
    const face = relatedFace()
    const surface = newSurface(face)
    await act(async () => { surface.findRelated(MSG) })
    await flush()
    render(<IdeaRelatedOverlay {...overlayProps(surface)} />)

    expect(screen.getByText('Alpha idea')).toBeTruthy()
    expect(screen.getByText('Core of Alpha idea')).toBeTruthy()
    expect(screen.getByText('为什么现在有用')).toBeTruthy()
    expect(screen.getByText('Alpha idea answers the open question now')).toBeTruthy()
  })

  it('shows the empty copy on a zero-match judgment', async () => {
    const face = relatedFace(async () => okRelated([]))
    const surface = newSurface(face)
    await act(async () => { surface.findRelated(MSG) })
    await flush()
    render(<IdeaRelatedOverlay {...overlayProps(surface)} />)
    expect(screen.getByText('暂时没有值得关联的 Idea')).toBeTruthy()
  })

  it('shows the error copy on a wire failure and on a thrown carrier error', async () => {
    const face = relatedFace(async () => ({ ok: false as const, error: { code: 'idea/model-failed' } }))
    const surface = newSurface(face)
    await act(async () => { surface.findRelated(MSG) })
    await flush()
    render(<IdeaRelatedOverlay {...overlayProps(surface)} />)
    expect(screen.getByText('查找关联 Idea 失败，请重试')).toBeTruthy()

    const thrown = newSurface(relatedFace(async () => { throw new Error('carrier exploded') }))
    await act(async () => { thrown.findRelated(MSG) })
    await flush()
    expect(thrown.state.getSnapshot().status).toBe('error')
    expect(thrown.state.getSnapshot().errorCode).toBe('idea/model-failed')
  })

  it('resets to idle on close and issues a fresh query on the next click', async () => {
    const face = relatedFace()
    const surface = newSurface(face)
    await act(async () => { surface.findRelated(MSG) })
    await flush()
    render(<IdeaRelatedOverlay {...overlayProps(surface)} />)

    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]!) })
    expect(surface.state.getSnapshot().status).toBe('idle')
    expect(screen.queryByText('Alpha idea')).toBeNull()

    await act(async () => { surface.findRelated(MSG) })
    await flush()
    expect(face.relatedFromMessage).toHaveBeenCalledTimes(2)
    expect(surface.state.getSnapshot().status).toBe('ready')
  })
})

describe('dispose semantics', () => {
  it('aborts the in-flight query and ignores its stale completion', async () => {
    const gate = deferred<unknown>()
    let captured: AbortSignal | undefined
    const face = relatedFace((_request?: unknown, signal?: AbortSignal) => {
      captured = signal
      return gate.promise
    })
    const surface = newSurface(face)
    await act(async () => { surface.findRelated(MSG) })
    expect(surface.state.getSnapshot().status).toBe('loading')

    surface.dispose()
    expect(captured?.aborted).toBe(true)

    await act(async () => { gate.resolve(okRelated([matchOf('idea_9', 'Late idea')])) })
    await flush()
    const state = surface.state.getSnapshot()
    expect(state.status).toBe('idle')
    expect(state.items).toEqual([])
    expect(state.errorCode).toBeNull()
  })

  it('keeps a closed surface idle when the carrier throws after dispose', async () => {
    const gate = deferred<unknown>()
    const face = relatedFace(() => gate.promise)
    const surface = newSurface(face)
    await act(async () => { surface.findRelated(MSG) })

    surface.dispose()
    await act(async () => { gate.reject(new Error('late carrier failure')) })
    await flush()
    const state = surface.state.getSnapshot()
    expect(state.status).toBe('idle')
    expect(state.errorCode).toBeNull()
  })
})

describe('separation from Save Idea state', () => {
  it('leaves the Save Idea surface untouched by a related failure', async () => {
    const face = relatedFace(async () => ({ ok: false as const, error: { code: 'idea/model-failed' } }))
    const saveFace = { prepareFromMessage: vi.fn(), create: vi.fn() } as never
    const related = newSurface(face)
    const save = new IdeaSaveSurface(saveFace, 'session-1')
    pendings.push(() => save.dispose())
    const before = JSON.stringify(save.state.getSnapshot())

    await act(async () => { related.findRelated(MSG) })
    await flush()

    expect(related.state.getSnapshot().status).toBe('error')
    expect(JSON.stringify(save.state.getSnapshot())).toBe(before)
    expect(save.state.getSnapshot().modal).toBeNull()
    expect(save.state.getSnapshot().failure).toBeNull()
    expect(save.state.getSnapshot().preparingMessageId).toBeNull()
  })
})
