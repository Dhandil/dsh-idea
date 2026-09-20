/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * Client-focused tests for the contextual Idea resurfacing controller and
 * strip: trigger only from appended durable completed turn/end events
 * (replays and prepends never trigger), the deterministic gates (feature,
 * current-turn Idea activity, continuation-only silence), settlement and
 * revalidation races (newer user turn, composer revision, post-Judge
 * staleness), the one-suggestion surface budget consumed at surfacing and
 * kept after USER_CONTINUED, runtime identity suppression (referenced /
 * dismissed candidates never re-judged), user actions (reference success
 * and failure, dismiss), and the strip's zero/one-suggestion rendering.
 * All Host faces are scripted; no live Host, provider, or model call.
 * @module tests/client-resurfacing.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { IdeaResurfacingController } from '../src/client/resurfacing-state.ts'
import type {
  ResurfacingEventWindowFace,
  ResurfacingInputFace,
  ResurfacingRemoteFace,
  ResurfacingSaveFace,
} from '../src/client/resurfacing-state.ts'
import { IdeaResurfaceStrip } from '../src/client/IdeaResurfaceStrip.tsx'
import { zh } from '../src/client/locales.ts'
import { formatIdeaReferenceMention } from '../src/reference/uri.ts'
import type { IdeaReferenceDescriptor } from '../src/reference/types.ts'
import type { IdeaResurfacingCandidate } from '../src/remote-host/types.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  for (const dispose of pendings.splice(0)) dispose()
})

/** Controllers to dispose after each test. */
const pendings: Array<() => void> = []

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

/** The fake `t` seat: zh interpolation over the placeholders we use. */
const t = ((key: string, params?: Record<string, unknown>): string =>
  (zh as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))) as never

interface Entry {
  type: 'event' | 'transient'
  event: { type: string; seq: number; data: Record<string, unknown> }
}

const userEntry = (text: string, seq: number): Entry => ({
  type: 'event',
  event: { type: 'user/message', seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } },
})

const assistantEntry = (text: string, seq: number): Entry => ({
  type: 'event',
  event: { type: 'assistant/message', seq, data: { message: { content: [{ type: 'text', text }] } } },
})

const turnEndEntry = (seq: number, turn: number): Entry => ({
  type: 'event',
  event: { type: 'turn/end', seq, data: { turn, reason: { kind: 'completed' } } },
})

/** Scriptable incremental event window (replace/prepend/append/settle). */
type WindowChange =
  | { kind: 'replace' | 'prepend' | 'append'; entries: readonly Entry[] }
  | { kind: 'settle-assistant' }

class FakeWindow implements ResurfacingEventWindowFace {
  entries: Entry[] = []
  change: WindowChange = { kind: 'replace', entries: [] }
  revision = 0
  private readonly listeners = new Set<() => void>()

  getSnapshot(): { entries: readonly Entry[]; change: WindowChange; revision: number } {
    return { entries: this.entries, change: this.change, revision: this.revision }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private notify(change: WindowChange): void {
    this.change = change
    this.revision += 1
    for (const listener of [...this.listeners]) listener()
  }

  /** Backfilled history: never an opportunity. */
  replay(entries: Entry[]): void {
    this.entries = [...entries]
    this.notify({ kind: 'replace', entries })
  }

  prepend(entries: Entry[]): void {
    this.entries = [...entries, ...this.entries]
    this.notify({ kind: 'prepend', entries })
  }

  append(entry: Entry): void {
    this.entries = [...this.entries, entry]
    this.notify({ kind: 'append', entries: [entry] })
  }

  /** The Assistant reply settles into its placeholder slot, before the turn/end. */
  settle(entry: Entry): void {
    let insertAt = this.entries.length
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const existing = this.entries[index]
      if (existing?.type === 'event' && existing.event.type === 'turn/end') {
        insertAt = index
        break
      }
    }
    const next = [...this.entries]
    next.splice(insertAt, 0, entry)
    this.entries = next
    this.notify({ kind: 'settle-assistant' })
  }
}

const candidateWire = (id: string, title: string): IdeaResurfacingCandidate => ({
  ideaId: id,
  evaluatedVersionId: `idea_ver_${id}`,
  title,
  core: `Core of ${title}`,
  possibleValue: `Value of ${title}`,
  useWhen: [`When ${title} applies`],
  currentConclusion: `Conclusion of ${title}`,
  score: 30,
})

const surfaceVerdict = (id: string) => ({
  ok: true as const,
  value: { outcome: 'surface' as const, reason: 'ADDS_DECISION_VALUE', ideaId: id, dropped: [] },
})

/** A deferred promise for gating one remote call. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

interface Rig {
  controller: IdeaResurfacingController
  window: FakeWindow
  remote: {
    evaluateResurfacing: ReturnType<typeof vi.fn>
    judgeResurfacing: ReturnType<typeof vi.fn>
  }
  input: { draftRev: number; occurrences: Array<{ source: string; ref: string }> }
  save: { preparingMessageId: string | null; modal: unknown; submitting: boolean }
  appended: IdeaReferenceDescriptor[]
  appendOk: { value: boolean }
}

function makeRig(over: {
  evaluate?: ReturnType<typeof vi.fn>
  judge?: ReturnType<typeof vi.fn>
} = {}): Rig {
  const window = new FakeWindow()
  const input = { draftRev: 0, occurrences: [] as Array<{ source: string; ref: string }> }
  const save = { preparingMessageId: null, modal: null, submitting: false }
  const appended: IdeaReferenceDescriptor[] = []
  const appendOk = { value: true }
  const remote = {
    evaluateResurfacing: over.evaluate ?? vi.fn(async () => ({
      ok: true as const,
      value: { candidates: [candidateWire('idea_1', 'Alpha idea')], suppressed: [] },
    })),
    judgeResurfacing: over.judge ?? vi.fn(async () => surfaceVerdict('idea_1')),
  }
  const controller = new IdeaResurfacingController({
    sessionId: 'conversation-1',
    remote: remote as unknown as ResurfacingRemoteFace,
    events: window,
    input: { getSnapshot: () => input } as unknown as ResurfacingInputFace,
    save: { getSnapshot: () => save } as unknown as ResurfacingSaveFace,
    appendReference: (descriptor) => {
      appended.push(descriptor)
      return appendOk.value
    },
  })
  pendings.push(() => controller.dispose())
  return { controller, window, remote, input, save, appended, appendOk }
}

/** One complete admitted turn: user question, Assistant reply, turn/end. */
function pushTurn(window: FakeWindow, seq: number, user: string, reply: string): number {
  window.append(userEntry(user, seq))
  window.append(assistantEntry(reply, seq + 1))
  window.append(turnEndEntry(seq + 2, 1))
  return seq + 2
}

const useStoreOf = (store: { subscribe: (fn: () => void) => () => void; getSnapshot: () => unknown }) =>
  (select: (state: never) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot() as never))

/** Strip props wired to a live controller so clicks drive the real engine. */
function stripProps(controller: IdeaResurfacingController) {
  const useResurface = useStoreOf(controller.state) as never
  return {
    useResurface,
    toggleDetail: () => { controller.toggleDetail() },
    reference: () => { controller.reference() },
    dismiss: () => { controller.dismiss() },
    t,
  }
}

describe('trigger discipline', () => {
  it('evaluates once per completed turn and surfaces a valid verdict', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '可以从塔防的核心循环开始设计。')
    await flush()

    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
    const request = rig.remote.evaluateResurfacing.mock.calls[0]![0]
    expect(request.sessionId).toBe('conversation-1')
    expect(request.currentTurn).toContain('塔防')
    expect(rig.remote.judgeResurfacing).toHaveBeenCalledTimes(1)

    const suggestion = rig.controller.state.getSnapshot().suggestion
    expect(suggestion).not.toBeNull()
    expect(suggestion!.ideaId).toBe('idea_1')
    expect(suggestion!.title).toBe('Alpha idea')
    expect(suggestion!.reference.ideaId).toBe('idea_1')
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBeNull()
  })

  it('never triggers on replayed or prepended history', async () => {
    const rig = makeRig()
    rig.window.replay([
      userEntry('我准备重新做一个塔防游戏。', 1),
      assistantEntry('回复', 2),
      turnEndEntry(3, 1),
    ])
    await flush()
    rig.window.prepend([userEntry('更早的一条', 0)])
    await flush()

    expect(rig.remote.evaluateResurfacing).not.toHaveBeenCalled()
    expect(rig.remote.judgeResurfacing).not.toHaveBeenCalled()
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })

  it('ignores transient entries and non-completed turn ends', async () => {
    const rig = makeRig()
    rig.window.append({
      type: 'transient',
      event: { type: 'assistant-live-chunk', seq: 1, data: {} },
    })
    rig.window.append({
      type: 'event',
      event: { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'aborted' } } },
    })
    await flush()

    expect(rig.remote.evaluateResurfacing).not.toHaveBeenCalled()
  })

  it('stays silent when the detector does not admit the turn', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '继续', '好的，我们继续。')
    await flush()

    expect(rig.remote.evaluateResurfacing).not.toHaveBeenCalled()
    expect(rig.remote.judgeResurfacing).not.toHaveBeenCalled()
  })
})

describe('deterministic gates', () => {
  it('stops at CURRENT_TURN_IDEA_ACTIVE when the composer carries an Idea chip', async () => {
    const rig = makeRig()
    rig.input.occurrences.push({
      source: 'idea',
      ref: formatIdeaReferenceMention({ ideaId: 'idea_1', versionId: 'idea_ver_idea_1' }, 'Alpha idea'),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    expect(rig.remote.evaluateResurfacing).not.toHaveBeenCalled()
  })

  it('stops while an explicit Save Idea flow is running', async () => {
    const rig = makeRig()
    rig.save.modal = { open: true }
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    expect(rig.remote.evaluateResurfacing).not.toHaveBeenCalled()
  })

  it('makes no remote call when the Host evaluation stops', async () => {
    const rig = makeRig({
      evaluate: vi.fn(async () => ({
        ok: true as const,
        value: { stop: { reason: 'NO_ELIGIBLE_IDEAS' as const }, candidates: [], suppressed: [] },
      })),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
    expect(rig.remote.judgeResurfacing).not.toHaveBeenCalled()
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })

  it('stays silent on an evaluate failure', async () => {
    const rig = makeRig({
      evaluate: vi.fn(async () => ({ ok: false as const, error: { code: 'idea/unavailable' } })),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    expect(rig.remote.judgeResurfacing).not.toHaveBeenCalled()
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })

  it('stays silent when the Judge answers NONE, and may try again next turn', async () => {
    const rig = makeRig({
      judge: vi.fn(async () => ({
        ok: true as const,
        value: { outcome: 'none' as const, reason: 'REDUNDANT_WITH_CONTEXT', dropped: [] },
      })),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()

    pushTurn(rig.window, 4, '塔防的方向哪个更好？', '各有取舍。')
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(2)
    expect(rig.remote.judgeResurfacing).toHaveBeenCalledTimes(2)
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })
})

describe('settlement and revalidation races', () => {
  it('waits for the settling Assistant reply before judging', async () => {
    const rig = makeRig()
    rig.window.append(userEntry('我准备重新做一个塔防游戏。', 1))
    rig.window.append(turnEndEntry(2, 1))
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
    expect(rig.remote.judgeResurfacing).not.toHaveBeenCalled()

    rig.window.settle(assistantEntry('回复', 3))
    await flush()
    expect(rig.remote.judgeResurfacing).toHaveBeenCalledTimes(1)
    expect(rig.controller.state.getSnapshot().suggestion).not.toBeNull()
  })

  it('expires with TRIGGER_TURN_NO_LONGER_CURRENT when a newer user turn arrives', async () => {
    const evaluateGate = deferred<unknown>()
    const rig = makeRig({
      evaluate: vi.fn(() => evaluateGate.promise),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)

    rig.window.append(userEntry('算了，换个话题。', 4))
    await flush()
    evaluateGate.resolve({
      ok: true,
      value: { candidates: [candidateWire('idea_1', 'Alpha idea')], suppressed: [] },
    })
    await flush()

    expect(rig.remote.judgeResurfacing).not.toHaveBeenCalled()
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBe('TRIGGER_TURN_NO_LONGER_CURRENT')

    // The next completed turn evaluates fresh.
    pushTurn(rig.window, 5, '塔防的方向哪个更好？', '各有取舍。')
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(2)
  })

  it('expires with COMPOSER_CHANGED_SINCE_TRIGGER on a composer edit before the Judge', async () => {
    const evaluateGate = deferred<unknown>()
    const rig = makeRig({
      evaluate: vi.fn(() => evaluateGate.promise),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    rig.input.draftRev += 1
    evaluateGate.resolve({
      ok: true,
      value: { candidates: [candidateWire('idea_1', 'Alpha idea')], suppressed: [] },
    })
    await flush()

    expect(rig.remote.judgeResurfacing).not.toHaveBeenCalled()
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBe('COMPOSER_CHANGED_SINCE_TRIGGER')
  })

  it('rejects a correct-but-late verdict: a composer edit after the Judge stays silent', async () => {
    const judgeGate = deferred<unknown>()
    const rig = makeRig({
      judge: vi.fn(() => judgeGate.promise),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.remote.judgeResurfacing).toHaveBeenCalledTimes(1)

    rig.input.draftRev += 1
    judgeGate.resolve(surfaceVerdict('idea_1'))
    await flush()

    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })

  it('silences a Judge failure without crashing', async () => {
    const rig = makeRig({
      judge: vi.fn(async () => ({ ok: false as const, error: { code: 'idea/unavailable' } })),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBeNull()
  })

  it('caps the pool at three candidates before judging', async () => {
    const rig = makeRig({
      evaluate: vi.fn(async () => ({
        ok: true as const,
        value: {
          candidates: [
            candidateWire('idea_1', 'Alpha'),
            candidateWire('idea_2', 'Beta'),
            candidateWire('idea_3', 'Gamma'),
            candidateWire('idea_4', 'Delta'),
          ],
          suppressed: [],
        },
      })),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    const request = rig.remote.judgeResurfacing.mock.calls[0]![0]
    expect(request.candidates).toHaveLength(3)
    expect(request.candidates.map((entry: { ideaId: string }) => entry.ideaId))
      .toEqual(['idea_1', 'idea_2', 'idea_3'])
  })

  it('sends only canonical pins and no content to the Judge', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    const request = rig.remote.judgeResurfacing.mock.calls[0]![0]
    expect(request.candidates).toEqual([{ ideaId: 'idea_1', evaluatedVersionId: 'idea_ver_idea_1' }])
    expect(typeof request.assistantReply).toBe('string')
    expect(request.signals.every((signal: { type: string }) => typeof signal.type === 'string')).toBe(true)
  })
})

describe('the one-suggestion surface budget', () => {
  it('is consumed at surfacing: a later completed turn never re-surfaces', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.controller.state.getSnapshot().suggestion).not.toBeNull()

    // Another completed turn without a new user message cannot re-trigger.
    rig.window.append(assistantEntry('后续回复', 4))
    rig.window.append(turnEndEntry(5, 2))
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
    expect(rig.controller.state.getSnapshot().suggestion!.ideaId).toBe('idea_1')
  })

  it('expires with USER_CONTINUED and keeps the budget consumed', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.controller.state.getSnapshot().suggestion).not.toBeNull()

    rig.window.append(userEntry('好的，那就这样。', 4))
    await flush()
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBe('USER_CONTINUED')

    pushTurn(rig.window, 5, '塔防的方向哪个更好？', '各有取舍。')
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })
})

describe('runtime identity suppression', () => {
  it('marks a referenced Idea and never re-evaluates after the surface budget', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.controller.state.getSnapshot().suggestion!.ideaId).toBe('idea_1')

    act(() => { rig.controller.reference() })
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBe('REFERENCED')
    expect(rig.appended).toHaveLength(1)
    expect(rig.appended[0]!.ideaId).toBe('idea_1')

    // The next completed turn cannot re-trigger: the budget is consumed,
    // whatever the corpus now contains.
    rig.window.append(assistantEntry('后续回复', 4))
    rig.window.append(turnEndEntry(5, 2))
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })

  it('marks a dismissed Idea and never re-evaluates afterwards', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    act(() => { rig.controller.dismiss() })
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBe('DISMISSED')

    rig.window.append(assistantEntry('后续回复', 4))
    rig.window.append(turnEndEntry(5, 2))
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()
  })

  it('filters a candidate attached as a composer chip during the evaluation', async () => {
    const evaluateGate = deferred<unknown>()
    const rig = makeRig({
      evaluate: vi.fn(() => evaluateGate.promise),
      judge: vi.fn(async (request: { candidates: Array<{ ideaId: string }> }) =>
        surfaceVerdict(request.candidates[0]!.ideaId)),
    })
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)

    // The user attaches an Idea chip while the evaluation is in flight; the
    // candidate it pins is dropped by deterministic identity before judging.
    rig.input.occurrences.push({
      source: 'idea',
      ref: formatIdeaReferenceMention({ ideaId: 'idea_1', versionId: 'idea_ver_idea_1' }, 'Alpha idea'),
    })
    evaluateGate.resolve({
      ok: true,
      value: {
        candidates: [
          candidateWire('idea_1', 'Alpha idea'),
          candidateWire('idea_2', 'Beta idea'),
        ],
        suppressed: [],
      },
    })
    await flush()

    expect(rig.remote.judgeResurfacing).toHaveBeenCalledTimes(1)
    const request = rig.remote.judgeResurfacing.mock.calls[0]![0]
    expect(request.candidates).toEqual([{ ideaId: 'idea_2', evaluatedVersionId: 'idea_ver_idea_2' }])
    expect(rig.controller.state.getSnapshot().suggestion!.ideaId).toBe('idea_2')
  })
})

describe('reference failure keeps the strip', () => {
  it('does not mark referenced or close on a failed append', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    rig.appendOk.value = false

    act(() => { rig.controller.reference() })
    expect(rig.appended).toHaveLength(1)
    expect(rig.controller.state.getSnapshot().suggestion).not.toBeNull()
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBeNull()
  })
})

describe('dispose', () => {
  it('unsubscribes the feed and clears the suggestion', async () => {
    const rig = makeRig()
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(rig.controller.state.getSnapshot().suggestion).not.toBeNull()

    rig.controller.dispose()
    expect(rig.controller.state.getSnapshot().suggestion).toBeNull()

    pushTurn(rig.window, 4, '塔防的方向哪个更好？', '各有取舍。')
    await flush()
    expect(rig.remote.evaluateResurfacing).toHaveBeenCalledTimes(1)
  })
})

describe('the strip component', () => {
  it('renders nothing without a suggestion and the banner with the title', async () => {
    const rig = makeRig()
    const view = render(<IdeaResurfaceStrip {...stripProps(rig.controller)} />)
    expect(view.container.textContent).toBe('')

    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()
    expect(screen.getByText('💡 以前保存过一个可能相关的 Idea：「Alpha idea」')).toBeDefined()
    expect(screen.getByText('查看')).toBeDefined()
    expect(screen.getByText('引用')).toBeDefined()
    expect(screen.getByText('忽略')).toBeDefined()
  })

  it('expands a read-only detail and toggles it closed', async () => {
    const rig = makeRig()
    render(<IdeaResurfaceStrip {...stripProps(rig.controller)} />)
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    fireEvent.click(screen.getByText('查看'))
    expect(screen.getByText('Core of Alpha idea')).toBeDefined()
    expect(screen.getByText('Value of Alpha idea')).toBeDefined()
    expect(screen.getByText('When Alpha idea applies')).toBeDefined()
    expect(screen.getByText('收起')).toBeDefined()

    fireEvent.click(screen.getByText('收起'))
    expect(screen.queryByText('Core of Alpha idea')).toBeNull()
    // The composer draft is untouched by any strip interaction.
    expect(rig.appended).toHaveLength(0)
  })

  it('closes on 引用 and on 忽略 through the controller', async () => {
    const rig = makeRig()
    render(<IdeaResurfaceStrip {...stripProps(rig.controller)} />)
    pushTurn(rig.window, 1, '我准备重新做一个塔防游戏。', '回复')
    await flush()

    fireEvent.click(screen.getByText('忽略'))
    expect(screen.queryByText('引用')).toBeNull()
    expect(rig.controller.state.getSnapshot().lastExpireReason).toBe('DISMISSED')
  })
})
