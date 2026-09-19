/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the Related Ideas surface: the one-query
 * lifecycle (duplicate clicks folded, loading/ready/empty/error states),
 * canonical card rendering with the two verbs — Add (Host-owned pinned
 * reference) and View (read-only detail, no lifecycle mutation) — close and
 * dispose semantics, and the tightened judge prompt criteria. The Host face
 * is a scripted IdeaRelatedFace; no live Host, provider, or model call.
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
import { IdeaRelatedOverlay } from '../src/client/IdeaRelatedOverlay.tsx'
import { SYSTEM_PROMPT, buildRelatedIdeasPrompt } from '../src/related/prompt.ts'
import type { RelatedOverlayProps } from '../src/client/slots.ts'
import type { IdeaDetail, IdeaRelatedMatch, IdeaRelatedResult } from '../src/remote-host/types.ts'
import type { IdeaVersionId } from '../src/types.ts'

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
  reference: {
    ideaId: id,
    versionId: `idea_ver_${id}`,
    label: title,
    mention: `@[${title}](dsh-idea:x)`,
  },
})

const detailOf = (id: string, title: string): IdeaDetail => ({
  id,
  status: 'active',
  title,
  core: `Core of ${title}`,
  motivation: `Motivation of ${title}`,
  createdAt: 1,
  updatedAt: 5,
  currentConclusion: `Conclusion of ${title}`,
  possibleValue: `Value of ${title}`,
  useWhen: [`Use ${title}`],
  openQuestions: [`Question of ${title}`],
  versionId: `idea_ver_${id}` as IdeaVersionId,
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

function overlayProps(
  surface: RelatedIdeasSurface,
  getDetail: (id: string) => Promise<{ ok: true; value: IdeaDetail } | { ok: false; error: { code: string } }> = vi.fn(),
  add: (descriptor: unknown) => void = vi.fn(),
): RelatedOverlayProps {
  return {
    close: () => { surface.close() },
    getDetail,
    add,
    useRelated: useRelatedOf(surface.state),
    t,
  } as unknown as RelatedOverlayProps
}

const MSG = 'a1' as MessageId

/** Query, resolve, and render one ready overlay. */
async function readyOverlay(
  face = relatedFace(),
  getDetail?: Parameters<typeof overlayProps>[1],
  add?: Parameters<typeof overlayProps>[2],
) {
  const surface = newSurface(face)
  await act(async () => { surface.findRelated(MSG) })
  await flush()
  render(<IdeaRelatedOverlay {...overlayProps(surface, getDetail, add)} />)
  return surface
}

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
    await readyOverlay()
    expect(screen.getByText('Alpha idea')).toBeTruthy()
    expect(screen.getByText('Core of Alpha idea')).toBeTruthy()
    expect(screen.getByText('为什么现在有用')).toBeTruthy()
    expect(screen.getByText('Alpha idea answers the open question now')).toBeTruthy()
  })

  it('shows the empty copy on a zero-match judgment', async () => {
    await readyOverlay(relatedFace(async () => okRelated([])))
    expect(screen.getByText('暂时没有值得关联的 Idea')).toBeTruthy()
  })

  it('shows the error copy on a wire failure and on a thrown carrier error', async () => {
    await readyOverlay(relatedFace(async () => ({ ok: false as const, error: { code: 'idea/model-failed' } })))
    expect(screen.getByText('查找关联 Idea 失败，请重试')).toBeTruthy()

    const thrown = newSurface(relatedFace(async () => { throw new Error('carrier exploded') }))
    await act(async () => { thrown.findRelated(MSG) })
    await flush()
    expect(thrown.state.getSnapshot().status).toBe('error')
    expect(thrown.state.getSnapshot().errorCode).toBe('idea/model-failed')
  })

  it('resets to idle on close and issues a fresh query on the next click', async () => {
    const face = relatedFace()
    const surface = await readyOverlay(face)

    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0]!) })
    expect(surface.state.getSnapshot().status).toBe('idle')
    expect(screen.queryByText('Alpha idea')).toBeNull()

    await act(async () => { surface.findRelated(MSG) })
    await flush()
    expect(face.relatedFromMessage).toHaveBeenCalledTimes(2)
    expect(surface.state.getSnapshot().status).toBe('ready')
  })
})

describe('add and view verbs', () => {
  it('Add attaches the Host-owned pinned reference and keeps the overlay open', async () => {
    const add = vi.fn()
    await readyOverlay(relatedFace(), undefined, add)
    const expected = matchOf('idea_1', 'Alpha idea').reference

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '添加' })) })

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(expected)
    expect(add).not.toHaveBeenCalledWith(expect.objectContaining({ ideaId: 'idea_2' }))
    // The overlay stays open: attachment never dismisses the suggestions.
    expect(screen.getByText('Alpha idea')).toBeTruthy()
  })

  it('View opens the read-only detail with every field and no lifecycle mutation', async () => {
    const getDetail = vi.fn(async () => ({ ok: true as const, value: detailOf('idea_1', 'Alpha idea') }))
    await readyOverlay(relatedFace(), getDetail)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '查看' })) })
    await flush()

    expect(getDetail).toHaveBeenCalledTimes(1)
    expect(getDetail).toHaveBeenCalledWith('idea_1')
    expect(screen.getByLabelText('Idea 详情（只读）')).toBeTruthy()
    expect(screen.getByText('Conclusion of Alpha idea')).toBeTruthy()
    expect(screen.getByText('Motivation of Alpha idea')).toBeTruthy()
    expect(screen.getByText('Value of Alpha idea')).toBeTruthy()
    expect(screen.getByText('Use Alpha idea')).toBeTruthy()
    expect(screen.getByText('Question of Alpha idea')).toBeTruthy()
    // Read-only: only 返回 and 添加 — never 编辑/归档/恢复/删除/保存.
    const buttons = screen.getAllByRole('button').map(button => button.textContent)
    expect(buttons).toContain('返回列表')
    expect(buttons).toContain('添加')
    expect(buttons).not.toContain('保存')
    expect(buttons).not.toContain('归档')
    expect(buttons).not.toContain('恢复')
    expect(buttons).not.toContain('删除')
    expect(screen.queryByText('保存 Idea')).toBeNull()
  })

  it('detail Add reuses the match’s pinned reference', async () => {
    const getDetail = vi.fn(async () => ({ ok: true as const, value: detailOf('idea_1', 'Alpha idea') }))
    const add = vi.fn()
    await readyOverlay(relatedFace(), getDetail, add)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '查看' })) })
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '添加' })) })

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(matchOf('idea_1', 'Alpha idea').reference)
  })

  it('Back returns to the list without refetching', async () => {
    const getDetail = vi.fn(async () => ({ ok: true as const, value: detailOf('idea_1', 'Alpha idea') }))
    await readyOverlay(relatedFace(), getDetail)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '查看' })) })
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '返回列表' })) })

    expect(getDetail).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Alpha idea')).toBeTruthy()
    expect(screen.queryByLabelText('Idea 详情（只读）')).toBeNull()
  })

  it('shows the error copy when the detail read fails', async () => {
    const getDetail = vi.fn(async () => ({ ok: false as const, error: { code: 'idea/not-found' } }))
    await readyOverlay(relatedFace(), getDetail)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '查看' })) })
    await flush()

    expect(screen.getByText('该 Idea 加载失败')).toBeTruthy()
  })
})

describe('judge prompt criteria', () => {
  it('demands useful-now value, rejects weak signals, and prefers zero results', () => {
    expect(SYSTEM_PROMPT).toContain('meaningful change')
    expect(SYSTEM_PROMPT).toContain('When in doubt, leave the Idea out')
    expect(SYSTEM_PROMPT).toContain('never enough')
    // The strict JSON contract stays: matches with ideaId + whyUsefulNow only.
    const built = buildRelatedIdeasPrompt({ messages: [], candidates: [] })
    expect(built.user).toContain('"matches"')
    expect(built.user).toContain('"whyUsefulNow"')
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
