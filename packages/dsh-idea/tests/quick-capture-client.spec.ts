/**
 * T12 Quick Capture — client-surface focused tests: the quick-capture form
 * surface (open/close, text edits, the zero-model direct prepare, the
 * single-call AI prepare, failure preserving the note, in-flight re-entry
 * and close guards, dispose abort), the Save Idea surface's quick preview
 * modal (source-less state, the double-submit no-op, the unclear-outcome
 * retry that resubmits the SAME preparation id, and cancel-while-submitting),
 * and the relaxed required-fields gate (motivation may be empty, D1).
 * All remote faces are scripted; no live Host, provider, or model call.
 * @module tests/quick-capture-client.spec
 */

import { describe, expect, it, vi } from 'vitest'
import { IdeaQuickCaptureSurface } from '../src/client/quick-capture-state.ts'
import type { QuickCapturePreview } from '../src/preparation/types.ts'
import { IdeaSaveSurface, requiredPresent } from '../src/client/state.ts'

const preview = (id: string): QuickCapturePreview => ({
  preparationId: `prep_${id}` as QuickCapturePreview['preparationId'],
  draft: {
    title: '浇水决策小助手',
    core: '原文',
    motivation: '',
    currentConclusion: '',
    possibleValue: '',
    useWhen: [],
    openQuestions: [],
  },
})

const quickRig = (over: { result?: 'ok' | 'fail' | 'throw' } = {}) => {
  const prepareQuickCapture = vi.fn(async () => {
    if (over.result === 'fail') return { ok: false as const, error: { code: 'idea/model-failed' } }
    if (over.result === 'throw') throw new Error('carrier down')
    return { ok: true as const, value: preview('1') }
  })
  const onPreview = vi.fn()
  const surface = new IdeaQuickCaptureSurface(
    { prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
    'session-1',
    onPreview,
  )
  return { surface, prepareQuickCapture, onPreview }
}

describe('IdeaQuickCaptureSurface', () => {
  it('opens, prepares direct with zero ambiguity, and hands the preview over', async () => {
    const { surface, prepareQuickCapture, onPreview } = quickRig()
    surface.open()
    surface.setText('  我的想法  ')
    surface.saveDirect()
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1))
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    expect(prepareQuickCapture).toHaveBeenCalledWith(
      { sessionId: 'session-1', text: '  我的想法  ', mode: 'direct' },
      expect.anything(),
    )
    // The form closes and resets after handing over.
    const snapshot = surface.state.getSnapshot()
    expect(snapshot.open).toBe(false)
    expect(snapshot.text).toBe('')
    expect(snapshot.preparing).toBe('none')
  })

  it('an AI failure preserves the note and direct save stays available', async () => {
    const prepareQuickCapture = vi.fn()
      .mockImplementationOnce(async () => ({ ok: false as const, error: { code: 'idea/model-failed' } }))
      .mockImplementationOnce(async () => ({ ok: true as const, value: preview('1') }))
    const onPreview = vi.fn()
    const surface = new IdeaQuickCaptureSurface(
      { prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
      'session-1',
      onPreview,
    )
    surface.open()
    surface.setText('原文要保留')
    surface.organize()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('prepare-failed'))
    expect(prepareQuickCapture).toHaveBeenCalledWith(
      { sessionId: 'session-1', text: '原文要保留', mode: 'ai' },
      expect.anything(),
    )
    expect(surface.state.getSnapshot().text).toBe('原文要保留')
    expect(surface.state.getSnapshot().preparing).toBe('none')
    expect(onPreview).not.toHaveBeenCalled()

    // Direct save still works after the failure.
    surface.saveDirect()
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1))
    const lastCall = (prepareQuickCapture.mock.calls as unknown as Array<[{ text: string; mode: string }]>).at(-1)
    expect(lastCall?.[0]).toMatchObject({ mode: 'direct', text: '原文要保留' })
  })

  it('a thrown carrier error is a failed prepare, not a crash', async () => {
    const { surface, onPreview } = quickRig({ result: 'throw' })
    surface.open()
    surface.setText('原文')
    surface.organize()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('prepare-failed'))
    expect(surface.state.getSnapshot().text).toBe('原文')
    expect(onPreview).not.toHaveBeenCalled()
  })

  it('re-entry while a prepare is in flight is a no-op (double-click safety)', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const prepareQuickCapture = vi.fn(async () => { await gate; return { ok: true as const, value: preview('1') } })
    const onPreview = vi.fn()
    const surface = new IdeaQuickCaptureSurface(
      { prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
      'session-1',
      onPreview,
    )
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    surface.saveDirect()
    surface.organize()
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1))
  })

  it('an empty note never calls the Host, and close during prepare is ignored', async () => {
    const { surface, prepareQuickCapture } = quickRig()
    surface.open()
    surface.setText('   ')
    surface.saveDirect()
    expect(prepareQuickCapture).not.toHaveBeenCalled()

    surface.setText('原文')
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    prepareQuickCapture.mockImplementationOnce(async () => { await gate; return { ok: true as const, value: preview('1') } })
    surface.saveDirect()
    surface.close()
    expect(surface.state.getSnapshot().open).toBe(true)
    release()
    await vi.waitFor(() => expect(surface.state.getSnapshot().open).toBe(false))
  })
})

describe('IdeaSaveSurface quick preview + unclear-outcome retry', () => {
  const saveRig = () => {
    const create = vi.fn()
    const surface = new IdeaSaveSurface(
      { create, prepareFromMessage: vi.fn(), prepareQuickCapture: vi.fn() } as unknown as ConstructorParameters<typeof IdeaSaveSurface>[0],
      'session-1',
    )
    return { surface, create }
  }

  it('opens a source-less modal for a quick-capture proposal and gates re-entry', () => {
    const { surface } = saveRig()
    surface.openQuickPreview(preview('1'))
    const modal = surface.state.getSnapshot().modal
    expect(modal).not.toBeNull()
    expect(modal?.source).toBeNull()
    expect(modal?.draft.core).toBe('原文')
    // While a modal is open, a second preview cannot replace it.
    surface.openQuickPreview(preview('2'))
    expect(surface.state.getSnapshot().modal?.preparationId).toBe(modal?.preparationId)
  })

  it('double-clicks submit once, and an unclear outcome retries the SAME preparation id', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, create } = saveRig()
    create.mockImplementationOnce(async () => {
      // The first attempt's outcome is unclear: the carrier dies mid-flight.
      await gate
      throw new Error('carrier down')
    })
    surface.openQuickPreview(preview('1'))
    surface.submit()
    surface.submit()
    expect(create).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('save-failed'))
    // The modal stays open with the same preparation; the retry resubmits
    // the SAME id and succeeds (the Host commit machine dedups both calls).
    expect(surface.state.getSnapshot().modal?.preparationId).toBe('prep_1')
    create.mockImplementation(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    surface.submit()
    await vi.waitFor(() => expect(surface.state.getSnapshot().modal).toBeNull())
    expect(create.mock.calls.every(call => call[0].preparationId === 'prep_1')).toBe(true)
  })

  it('cancel while submitting is ignored (no misleading cancelled state)', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, create } = saveRig()
    create.mockImplementation(async () => { await gate; return { ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } } })
    surface.openQuickPreview(preview('1'))
    surface.submit()
    surface.cancel()
    expect(surface.state.getSnapshot().modal).not.toBeNull()
    expect(surface.state.getSnapshot().submitting).toBe(true)
    release()
    await vi.waitFor(() => expect(surface.state.getSnapshot().submitting).toBe(false))
    expect(surface.state.getSnapshot().modal).toBeNull()
  })
})

describe('relaxed required-fields gate (D1)', () => {
  it('title and core gate every save surface; an empty motivation passes', () => {
    expect(requiredPresent({
      title: 't', core: 'c', motivation: '', currentConclusion: '', possibleValue: '', useWhenText: '', openQuestionsText: '',
    })).toBe(true)
    expect(requiredPresent({
      title: ' t ', core: '', motivation: 'm', currentConclusion: '', possibleValue: '', useWhenText: '', openQuestionsText: '',
    })).toBe(false)
    expect(requiredPresent({
      title: '', core: 'c', motivation: 'm', currentConclusion: '', possibleValue: '', useWhenText: '', openQuestionsText: '',
    })).toBe(false)
  })
})
