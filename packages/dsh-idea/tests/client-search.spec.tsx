/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the conversation Idea search: the composer
 * reference append (official edit path only — the separating space through
 * the scoped plain-text edit, the re-read draft revision, chip-aware
 * detect coordinates, CAS-failure reporting, and no reconstruction or
 * submission) and the floating search card (open/query/select/add/close
 * lifecycle, stale-completion immunity, retry, and the three close paths
 * with zero side effects). The Host face is a scripted IdeaSearchFace; no
 * live Host, provider, or model call.
 * @module tests/client-search.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IdeaSearchSurface, selectedReference } from '../src/client/search-state.ts'
import type { IdeaSearchFace } from '../src/client/search-state.ts'
import { appendIdeaReference, appendIdeaReferenceNotified } from '../src/client/reference-append.ts'
import type { ReferenceAppendSeams } from '../src/client/reference-append.ts'
import { IdeaSearchCard } from '../src/client/IdeaSearchCard.tsx'
import { zh } from '../src/client/locales.ts'
import { ideaReferenceDescriptor } from '../src/reference/uri.ts'
import type { SearchCardProps } from '../src/client/slots.ts'
import type { IdeaReferenceDescriptor } from '../src/reference/types.ts'
import type { IdeaSearchResult } from '../src/remote-host/types.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  for (const dispose of pendings.splice(0)) dispose()
})

/** Surfaces to dispose after each test (aborts in-flight searches). */
const pendings: Array<() => void> = []

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

/** The fake `t` seat: zh interpolation, exactly the placeholders we use. */
const t = ((key: string, params?: Record<string, unknown>): string =>
  (zh as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))) as never

const descriptorOf = (id: string): IdeaReferenceDescriptor =>
  ideaReferenceDescriptor(id, `idea_ver_${id}`, `Title of ${id}`)

const rowOf = (id: string, title: string): IdeaSearchResult => ({
  id,
  status: 'active',
  currentVersionId: `idea_ver_${id}`,
  title,
  core: `Core of ${title}`,
  currentConclusion: `Conclusion of ${title}`,
  useWhen: [],
  openQuestionsCount: 0,
  updatedAt: 1,
  reference: descriptorOf(id),
})

const rows = (): IdeaSearchResult[] => [rowOf('idea_1', 'Alpha idea'), rowOf('idea_2', 'Beta idea')]

/** A deferred promise for gating the fake Host face. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

/** A scripted Host face whose calls are individually observable. */
function searchFace(run?: (request: { query: string; scope: 'current' | 'all' }, signal?: AbortSignal) => Promise<unknown>):
  IdeaSearchFace & { search: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn(run ?? (async () => ({ ok: true as const, value: rows() }))),
  } as never
}

function newSurface(face: IdeaSearchFace): IdeaSearchSurface {
  const surface = new IdeaSearchSurface(face)
  pendings.push(() => surface.dispose())
  return surface
}

/** The framework-synthesized selector hook over the surface's store. */
const useIdeaOf = <T,>(store: SnapshotStore<T>) =>
  (select: (state: T) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))

const useSearchOf = useIdeaOf<ReturnType<IdeaSearchSurface['state']['getSnapshot']>>

/** Card props wired to a live surface so clicks drive the real engine. */
function liveCardProps(surface: IdeaSearchSurface, add = vi.fn()) {
  return {
    setQuery: (query: string) => { surface.setQuery(query) },
    select: (id: string) => { surface.select(id) },
    retry: () => { surface.retry() },
    add: (descriptor: unknown) => { add(descriptor); surface.close() },
    close: () => { surface.close() },
    useSearch: useSearchOf(surface.state),
    t,
  } as unknown as SearchCardProps
}

describe('composer reference append', () => {
  const mention = descriptorOf('idea_1').mention

  /** Scripted input facade over a mutable draft snapshot. */
  function seamsOf(initial: { draft: string; draftRev: number; occurrences: readonly { length: number }[] }) {
    let snapshot = { ...initial }
    const input = {
      state: { getSnapshot: () => snapshot },
      insertReference: vi.fn(() => true),
      notify: vi.fn(),
    }
    const insertText = vi.fn(() => {
      snapshot = { ...snapshot, draft: `${snapshot.draft} `, draftRev: snapshot.draftRev + 1 }
      return true
    })
    const seams: ReferenceAppendSeams = { input: input as unknown as ReferenceAppendSeams['input'], insertText }
    return { seams, input, insertText, setSnapshot: (next: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...next } } }
  }

  it('appends directly to an empty draft with no separating space', () => {
    const { seams, input, insertText } = seamsOf({ draft: '', draftRev: 7, occurrences: [] })

    expect(appendIdeaReference(seams, descriptorOf('idea_1'))).toBe(true)
    expect(insertText).not.toHaveBeenCalled()
    expect(input.insertReference).toHaveBeenCalledTimes(1)
    expect(input.insertReference).toHaveBeenCalledWith(
      { source: 'idea', ref: mention, label: 'Title of idea_1', clipboardText: mention },
      { start: 0, end: 0, draftRev: 7 },
    )
  })

  it('inserts the separating space first, then re-reads the draft revision', () => {
    const { seams, input, insertText } = seamsOf({ draft: 'hello', draftRev: 3, occurrences: [] })

    expect(appendIdeaReference(seams, descriptorOf('idea_1'))).toBe(true)
    expect(insertText).toHaveBeenCalledTimes(1)
    expect(insertText).toHaveBeenCalledWith(' ', { start: 5, end: 5, draftRev: 3 })
    // The chip span carries the post-edit revision, never the stale one.
    expect(input.insertReference).toHaveBeenCalledWith(
      { source: 'idea', ref: mention, label: 'Title of idea_1', clipboardText: mention },
      { start: 6, end: 6, draftRev: 4 },
    )
  })

  it('skips the space when the draft already ends with whitespace', () => {
    const { seams, input, insertText } = seamsOf({ draft: 'hello ', draftRev: 3, occurrences: [] })

    expect(appendIdeaReference(seams, descriptorOf('idea_1'))).toBe(true)
    expect(insertText).not.toHaveBeenCalled()
    expect(input.insertReference).toHaveBeenCalledWith(expect.anything(), { start: 6, end: 6, draftRev: 3 })
  })

  it('computes the detect coordinate across existing chips', () => {
    // Clipboard draft 'ab' + a 10-char chip; the chip occupies one editor slot.
    const chip = 'x'.repeat(10)
    const { seams, input, insertText } = seamsOf({
      draft: `ab${chip}`,
      draftRev: 2,
      occurrences: [{ length: chip.length }],
    })

    expect(appendIdeaReference(seams, descriptorOf('idea_1'))).toBe(true)
    // Detect length = 12 − 9 = 3; the space bumps it to 4.
    expect(insertText).toHaveBeenCalledWith(' ', { start: 3, end: 3, draftRev: 2 })
    expect(input.insertReference).toHaveBeenCalledWith(expect.anything(), { start: 4, end: 4, draftRev: 3 })
  })

  it('fails without a chip insert when the space edit loses its CAS', () => {
    const input = {
      state: { getSnapshot: () => ({ draft: 'hello', draftRev: 3, occurrences: [] }) },
      insertReference: vi.fn(),
      notify: vi.fn(),
    }
    const seams: ReferenceAppendSeams = { input: input as unknown as ReferenceAppendSeams['input'], insertText: () => false }

    expect(appendIdeaReference(seams, descriptorOf('idea_1'))).toBe(false)
    expect(input.insertReference).not.toHaveBeenCalled()
  })

  it('reports a localized failure when the chip insert fails, and stays silent on success', () => {
    const failing = {
      state: { getSnapshot: () => ({ draft: '', draftRev: 1, occurrences: [] }) },
      insertReference: vi.fn(() => false),
      notify: vi.fn(),
    }
    const failingSeams: ReferenceAppendSeams = {
      input: failing as unknown as ReferenceAppendSeams['input'],
      insertText: () => true,
    }

    expect(appendIdeaReferenceNotified(failingSeams, descriptorOf('idea_1'), '无法附加该 Idea 引用，请重试')).toBe(false)
    expect(failing.notify).toHaveBeenCalledTimes(1)
    expect(failing.notify).toHaveBeenCalledWith('error', '无法附加该 Idea 引用，请重试')

    const succeeding = {
      state: { getSnapshot: () => ({ draft: '', draftRev: 1, occurrences: [] }) },
      insertReference: vi.fn(() => true),
      notify: vi.fn(),
    }
    const succeedingSeams: ReferenceAppendSeams = {
      input: succeeding as unknown as ReferenceAppendSeams['input'],
      insertText: () => true,
    }
    expect(appendIdeaReferenceNotified(succeedingSeams, descriptorOf('idea_1'), '无法附加该 Idea 引用，请重试')).toBe(true)
    expect(succeeding.notify).not.toHaveBeenCalled()
  })
})

describe('search surface', () => {
  it('opens on the blank-query recency list and folds repeated opens', async () => {
    const face = searchFace()
    const surface = newSurface(face)

    surface.open()
    surface.open()
    await flush()

    expect(face.search).toHaveBeenCalledTimes(1)
    expect(face.search).toHaveBeenCalledWith({ query: '', scope: 'current' }, expect.any(AbortSignal))
    const state = surface.state.getSnapshot()
    expect(state.open).toBe(true)
    expect(state.query).toBe('')
    expect(state.status).toBe('ready')
    expect(state.items.map(item => item.id)).toEqual(['idea_1', 'idea_2'])
  })

  it('runs one explicit search per typed query', async () => {
    const face = searchFace()
    const surface = newSurface(face)
    surface.open()
    await flush()

    await act(async () => { surface.setQuery('向量') })
    await flush()

    expect(face.search).toHaveBeenLastCalledWith({ query: '向量', scope: 'current' }, expect.any(AbortSignal))
    expect(surface.state.getSnapshot().query).toBe('向量')
  })

  it('ignores a stale completion from an older query', async () => {
    const first = deferred<unknown>()
    const face = searchFace((request) => {
      if (request.query === '') return Promise.resolve({ ok: true as const, value: rows() })
      if (request.query === 'old') return first.promise
      return Promise.resolve({ ok: true as const, value: [rowOf('idea_9', 'Fresh idea')] })
    })
    const surface = newSurface(face)
    surface.open()
    await flush()

    await act(async () => { surface.setQuery('old') })
    await act(async () => { surface.setQuery('new') })
    await flush()
    expect(surface.state.getSnapshot().items.map(item => item.id)).toEqual(['idea_9'])

    // The 'old' query lands last in wall-clock order but must not overwrite.
    await act(async () => { first.resolve({ ok: true as const, value: [rowOf('idea_8', 'Stale idea')] }) })
    await flush()
    expect(surface.state.getSnapshot().items.map(item => item.id)).toEqual(['idea_9'])
  })

  it('maps a wire failure and a thrown carrier error onto the error state', async () => {
    const face = searchFace(async () => ({ ok: false as const, error: { code: 'idea/search-failed' } }))
    const surface = newSurface(face)
    surface.open()
    await flush()
    expect(surface.state.getSnapshot().status).toBe('error')
    expect(surface.state.getSnapshot().errorCode).toBe('idea/search-failed')

    const thrown = newSurface(searchFace(async () => { throw new Error('carrier exploded') }))
    thrown.open()
    await flush()
    expect(thrown.state.getSnapshot().status).toBe('error')
    expect(thrown.state.getSnapshot().errorCode).toBe('idea/search-failed')
  })

  it('retry re-runs the current query', async () => {
    let attempts = 0
    const face = searchFace(async () => {
      attempts += 1
      return attempts === 1
        ? { ok: false as const, error: { code: 'idea/search-failed' } }
        : { ok: true as const, value: rows() }
    })
    const surface = newSurface(face)
    await act(async () => {
      surface.open()
      await flush()
      surface.retry()
    })
    await flush()

    expect(face.search).toHaveBeenCalledTimes(2)
    expect(face.search).toHaveBeenLastCalledWith({ query: '', scope: 'current' }, expect.any(AbortSignal))
    expect(surface.state.getSnapshot().status).toBe('ready')
  })

  it('selects exactly one row and exposes its pinned reference', async () => {
    const face = searchFace()
    const surface = newSurface(face)
    surface.open()
    await flush()

    surface.select('idea_1')
    expect(surface.state.getSnapshot().selectedId).toBe('idea_1')
    expect(selectedReference(surface.state.getSnapshot())).toEqual(descriptorOf('idea_1'))
    surface.select('idea_2')
    expect(selectedReference(surface.state.getSnapshot())).toEqual(descriptorOf('idea_2'))
  })

  it('closes with zero side effects and ignores the in-flight completion', async () => {
    const gate = deferred<unknown>()
    let captured: AbortSignal | undefined
    const face = searchFace((_request, signal) => {
      captured = signal
      return gate.promise
    })
    const surface = newSurface(face)
    surface.open()
    surface.select('idea_1')

    surface.close()
    expect(captured?.aborted).toBe(true)
    const state = surface.state.getSnapshot()
    expect(state.open).toBe(false)
    expect(state.query).toBe('')
    expect(state.items).toEqual([])
    expect(state.selectedId).toBeNull()

    await act(async () => { gate.resolve({ ok: true as const, value: rows() }) })
    await flush()
    const after = surface.state.getSnapshot()
    expect(after.open).toBe(false)
    expect(after.items).toEqual([])
  })

  it('dispose aborts the in-flight search', async () => {
    const gate = deferred<unknown>()
    let captured: AbortSignal | undefined
    const face = searchFace((_request, signal) => {
      captured = signal
      return gate.promise
    })
    const surface = newSurface(face)
    surface.open()
    surface.dispose()
    expect(captured?.aborted).toBe(true)
  })
})

describe('search card', () => {
  it('renders nothing while closed', () => {
    const surface = newSurface(searchFace())
    render(<IdeaSearchCard {...liveCardProps(surface)} />)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('renders the search input, rows, and a disabled Add before any selection', async () => {
    const face = searchFace()
    const surface = newSurface(face)
    surface.open()
    await flush()
    render(<IdeaSearchCard {...liveCardProps(surface)} />)

    expect(screen.getByText('搜索 Idea')).toBeTruthy()
    expect((screen.getByLabelText('搜索保存的 Idea…') as HTMLInputElement).value).toBe('')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    const add = screen.getByRole('button', { name: '添加' }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
  })

  it('types into the engine, selects one row, and Add attaches its pinned reference', async () => {
    const add = vi.fn()
    const face = searchFace()
    const surface = newSurface(face)
    surface.open()
    await flush()
    render(<IdeaSearchCard {...liveCardProps(surface, add)} />)

    await act(async () => { fireEvent.change(screen.getByLabelText('搜索保存的 Idea…'), { target: { value: '向量' } }) })
    expect(face.search).toHaveBeenLastCalledWith({ query: '向量', scope: 'current' }, expect.any(AbortSignal))

    await act(async () => { fireEvent.click(screen.getAllByRole('option')[1]!) })
    expect(surface.state.getSnapshot().selectedId).toBe('idea_2')
    expect((screen.getAllByRole('option')[1]!).getAttribute('aria-selected')).toBe('true')
    expect((screen.getAllByRole('option')[0]!).getAttribute('aria-selected')).toBe('false')
    expect((screen.getByRole('button', { name: '添加' }) as HTMLButtonElement).disabled).toBe(false)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '添加' })) })
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(descriptorOf('idea_2'))
    // Add closes the card.
    expect(surface.state.getSnapshot().open).toBe(false)
  })

  it('closes via ×, outside click, and Escape', async () => {
    const face = searchFace()
    const surface = newSurface(face)
    surface.open()
    await flush()
    const { rerender } = render(<IdeaSearchCard {...liveCardProps(surface)} />)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '关闭' })) })
    expect(surface.state.getSnapshot().open).toBe(false)
    rerender(<IdeaSearchCard {...liveCardProps(surface)} />)
    expect(screen.queryByRole('listbox')).toBeNull()

    surface.open()
    await flush()
    rerender(<IdeaSearchCard {...liveCardProps(surface)} />)
    await act(async () => { fireEvent.click(document.querySelector('.dsh-idea-search-backdrop')!) })
    expect(surface.state.getSnapshot().open).toBe(false)
    rerender(<IdeaSearchCard {...liveCardProps(surface)} />)

    surface.open()
    await flush()
    rerender(<IdeaSearchCard {...liveCardProps(surface)} />)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(surface.state.getSnapshot().open).toBe(false)
  })

  it('shows the empty copy and the error retry affordance', async () => {
    const face = searchFace(async () => ({ ok: true as const, value: [] }))
    const surface = newSurface(face)
    surface.open()
    await flush()
    const { rerender } = render(<IdeaSearchCard {...liveCardProps(surface)} />)
    expect(screen.getByText('没有匹配的 Idea')).toBeTruthy()

    const failing = searchFace(async () => ({ ok: false as const, error: { code: 'idea/search-failed' } }))
    const failed = newSurface(failing)
    failed.open()
    await flush()
    rerender(<IdeaSearchCard {...liveCardProps(failed)} />)
    expect(screen.getByText('搜索失败，请重试')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
  })
})
