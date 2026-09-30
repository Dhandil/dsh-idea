/**
 * T12 Quick Capture — client-surface focused tests (T12.2 repair): the
 * quick-capture form surface (open/close, text edits, direct auto-commit
 * through the same preparation id, the AI handoff contract, failure kinds
 * preserving the note, in-flight re-entry, and close-cancels-in-flight so a
 * closed card is never followed by a late preview), the Save Idea surface's
 * quick-commit path (same-id retry on unclear outcomes, busy refusal), the
 * preview handoff boolean, and the relaxed required-fields gate (D1). All
 * remote faces are scripted; no live Host, provider, or model call.
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

const quickRig = () => {
  const prepareQuickCapture = vi.fn(async () => ({ ok: true as const, value: preview('1') }))
  const onPreview = vi.fn()
  const onCommit = vi.fn()
  const surface = new IdeaQuickCaptureSurface(
    { prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
    'session-1',
    { onPreview, onCommit },
  )
  return { surface, prepareQuickCapture, onPreview, onCommit }
}

describe('IdeaQuickCaptureSurface — direct auto-commit (R4)', () => {
  it('hands the prepared proposal to the same-id commit with no preview step', async () => {
    const { surface, prepareQuickCapture, onPreview, onCommit } = quickRig()
    onCommit.mockResolvedValue(true)
    surface.open()
    surface.setText('我的想法')
    surface.saveDirect()
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    expect(onCommit).toHaveBeenCalledWith(preview('1'))
    expect(onPreview).not.toHaveBeenCalled()
    expect((prepareQuickCapture.mock.calls[0] as unknown as [{ mode: string }])[0].mode).toBe('direct')
    const snapshot = surface.state.getSnapshot()
    expect(snapshot.open).toBe(false)
    expect(snapshot.text).toBe('')
    expect(snapshot.preparing).toBe('none')
  })

  it('a failed auto-commit keeps the note with a visible commit failure', async () => {
    const { surface, onCommit } = quickRig()
    onCommit.mockResolvedValue(false)
    surface.open()
    surface.setText('原文要保留')
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))
    expect(surface.state.getSnapshot().text).toBe('原文要保留')
    expect(surface.state.getSnapshot().open).toBe(true)
  })
})

describe('IdeaQuickCaptureSurface — AI handoff contract (R1)', () => {
  it('hands an accepted preview over and closes the form', async () => {
    const { surface, prepareQuickCapture, onPreview, onCommit } = quickRig()
    onPreview.mockReturnValue(true)
    surface.open()
    surface.setText('原文')
    surface.organize()
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1))
    expect(onPreview).toHaveBeenCalledWith(preview('1'))
    expect(onCommit).not.toHaveBeenCalled()
    expect((prepareQuickCapture.mock.calls[0] as unknown as [{ mode: string }])[0].mode).toBe('ai')
    expect(surface.state.getSnapshot().open).toBe(false)
  })

  it('a refused handoff keeps the note with a visible handoff failure, and a retry works', async () => {
    const { surface, onPreview } = quickRig()
    onPreview.mockReturnValueOnce(false).mockReturnValueOnce(true)
    surface.open()
    surface.setText('原文要保留')
    surface.organize()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('handoff-failed'))
    expect(surface.state.getSnapshot().text).toBe('原文要保留')

    surface.organize()
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2))
    expect(surface.state.getSnapshot().open).toBe(false)
  })

  it('an AI prepare failure preserves the note and direct save stays available', async () => {
    const { surface, prepareQuickCapture, onPreview, onCommit } = quickRig()
    ;(prepareQuickCapture as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async () => ({ ok: false as const, error: { code: 'idea/model-failed' } }))
      .mockImplementationOnce(async () => ({ ok: true as const, value: preview('1') }))
    onCommit.mockResolvedValue(true)
    surface.open()
    surface.setText('原文要保留')
    surface.organize()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('prepare-failed'))
    expect(surface.state.getSnapshot().text).toBe('原文要保留')
    expect(onPreview).not.toHaveBeenCalled()

    surface.saveDirect()
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    const lastCall = (prepareQuickCapture.mock.calls as unknown as Array<[{ text: string; mode: string }]>).at(-1)
    expect(lastCall?.[0]).toMatchObject({ mode: 'direct', text: '原文要保留' })
  })
})

describe('IdeaQuickCaptureSurface — close coordination (R1)', () => {
  it('closing while an AI prepare is in flight cancels it: no late preview, state cleared', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, prepareQuickCapture, onPreview, onCommit } = quickRig()
    prepareQuickCapture.mockImplementationOnce(async () => {
      await gate
      return { ok: true as const, value: preview('1') }
    })
    surface.open()
    surface.setText('原文')
    surface.organize()
    expect(surface.state.getSnapshot().preparing).toBe('ai')
    surface.close()
    expect(surface.state.getSnapshot()).toMatchObject({ open: false, text: '', preparing: 'none' })
    release()
    await vi.waitFor(() => expect(prepareQuickCapture).toHaveBeenCalledTimes(1))
    // Let every microtask settle: neither the preview nor the commit may fire.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('an idle close clears the note with zero side effects', () => {
    const { surface, prepareQuickCapture, onPreview, onCommit } = quickRig()
    surface.open()
    surface.setText('草稿')
    surface.close()
    expect(surface.state.getSnapshot()).toMatchObject({ open: false, text: '' })
    expect(prepareQuickCapture).not.toHaveBeenCalled()
    expect(onPreview).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('re-entry while a prepare is in flight is a no-op (double-click safety)', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, prepareQuickCapture, onCommit } = quickRig()
    onCommit.mockResolvedValue(true)
    prepareQuickCapture.mockImplementationOnce(async () => {
      await gate
      return { ok: true as const, value: preview('1') }
    })
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    surface.saveDirect()
    surface.organize()
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
  })

  it('an empty note never calls the Host', () => {
    const { surface, prepareQuickCapture } = quickRig()
    surface.open()
    surface.setText('   ')
    surface.saveDirect()
    surface.organize()
    expect(prepareQuickCapture).not.toHaveBeenCalled()
  })
})

describe('IdeaSaveSurface — quick commit (R4) and preview handoff (R1)', () => {
  const saveRig = () => {
    const create = vi.fn()
    const surface = new IdeaSaveSurface(
      { create, prepareFromMessage: vi.fn(), prepareQuickCapture: vi.fn() } as unknown as ConstructorParameters<typeof IdeaSaveSurface>[0],
      'session-1',
    )
    return { surface, create }
  }

  it('commits the prepared draft verbatim on the same preparation id', async () => {
    const { surface, create } = saveRig()
    create.mockResolvedValue({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } })
    const committed = await surface.commitQuickPreview(preview('1'))
    expect(committed).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toMatchObject({ preparationId: 'prep_1', draft: preview('1').draft })
    expect(surface.state.getSnapshot().toastSeq).toBe(1)
  })

  it('an unclear outcome retries once with the SAME preparation id', async () => {
    const { surface, create } = saveRig()
    create.mockImplementationOnce(async () => { throw new Error('carrier down') })
      .mockImplementationOnce(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    const committed = await surface.commitQuickPreview(preview('1'))
    expect(committed).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls.every(call => call[0].preparationId === 'prep_1')).toBe(true)
  })

  it('persistent unclear outcomes resolve false after exhausting the same-id retry', async () => {
    const { surface, create } = saveRig()
    create.mockImplementation(async () => { throw new Error('carrier down') })
    const committed = await surface.commitQuickPreview(preview('1'))
    expect(committed).toBe(false)
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls.every(call => call[0].preparationId === 'prep_1')).toBe(true)
  })

  it('refuses the commit while busy, without dropping anything', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, create } = saveRig()
    create.mockImplementationOnce(async () => {
      await gate
      return { ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }
    })
    surface.openQuickPreview(preview('1'))
    const busy = await surface.commitQuickPreview(preview('2'))
    expect(busy).toBe(false)
    expect(create).toHaveBeenCalledTimes(0)
    release()
    await vi.waitFor(() => expect(surface.state.getSnapshot().submitting).toBe(false))
  })

  it('openQuickPreview returns the handoff boolean: true when free, false while busy', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, create } = saveRig()
    expect(surface.openQuickPreview(preview('1'))).toBe(true)
    create.mockImplementationOnce(async () => {
      await gate
      throw new Error('carrier down')
    })
    const busy = surface.commitQuickPreview(preview('2'))
    expect(surface.openQuickPreview(preview('3'))).toBe(false)
    release()
    await busy
    surface.cancel()
    expect(surface.state.getSnapshot().modal).toBeNull()
    expect(surface.openQuickPreview(preview('4'))).toBe(true)
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
