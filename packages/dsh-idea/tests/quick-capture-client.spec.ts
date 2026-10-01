/**
 * T12 Quick Capture — client-surface focused tests (T12.2 second repair):
 * the quick-capture form surface (open/close, text edits, direct auto-commit
 * through the same preparation id, the AI handoff contract, failure kinds
 * preserving the note, in-flight re-entry, and the phase-aware close:
 * preparing cancels, committing only hides and preserves), the Save Idea
 * surface's quick-commit path (structured-failure state restoration, same-id
 * retry on unclear outcomes, busy refusal), the preview handoff boolean, the
 * stale-task/AbortController race guard, and the relaxed required-fields
 * gate (D1). All remote faces are scripted; no live Host/provider call.
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

/** Chainable one-shot stub over a scripted vi.fn (keeps mock chaining typed). */
interface MockOnceStub {
  mockImplementationOnce: (impl: () => Promise<unknown>) => MockOnceStub
}

/** Drain pending microtasks/macrotasks so fire-and-forget flows settle. */
const flush = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 20)) }

const quickRig = () => {
  const prepareQuickCapture = vi.fn(async () => ({ ok: true as const, value: preview('1') }))
  const onPreview = vi.fn()
  const onCommit = vi.fn()
  const surface = new IdeaQuickCaptureSurface(
    { prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
    { kind: 'session', sessionId: 'session-1' },
    { onPreview, onCommit },
  )
  return { surface, prepareQuickCapture, onPreview, onCommit }
}

describe('IdeaQuickCaptureSurface — direct auto-commit (R4)', () => {
  it('hands the prepared proposal to the same-id commit with no preview step', async () => {
    const { surface, prepareQuickCapture, onPreview, onCommit } = quickRig()
    onCommit.mockResolvedValue('success')
    surface.open()
    surface.setText('我的想法')
    surface.saveDirect()
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    expect(onCommit).toHaveBeenCalledWith(preview('1'))
    expect(onPreview).not.toHaveBeenCalled()
    const call = (prepareQuickCapture.mock.calls[0] as unknown as [{ mode: string }])[0]
    expect(call.mode).toBe('direct')
    const snapshot = surface.state.getSnapshot()
    expect(snapshot.open).toBe(false)
    expect(snapshot.text).toBe('')
    expect(snapshot.preparing).toBe('none')
  })

  it('a failed auto-commit keeps the note with a visible commit failure', async () => {
    const { surface, onCommit } = quickRig()
    onCommit.mockResolvedValue('failed')
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
    const call = (prepareQuickCapture.mock.calls[0] as unknown as [{ mode: string }])[0]
    expect(call.mode).toBe('ai')
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
    const mock: { mockImplementationOnce: (impl: () => Promise<unknown>) => MockOnceStub } =
      prepareQuickCapture as unknown as MockOnceStub
    mock.mockImplementationOnce(async () => ({ ok: false as const, error: { code: 'idea/model-failed' } }))
      .mockImplementationOnce(async () => ({ ok: true as const, value: preview('1') }))
    onCommit.mockResolvedValue('success')
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
    const mock: { mockImplementationOnce: (impl: () => Promise<unknown>) => MockOnceStub } =
      prepareQuickCapture as unknown as MockOnceStub
    mock.mockImplementationOnce(async () => {
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
    onCommit.mockResolvedValue('success')
    const mock: { mockImplementationOnce: (impl: () => Promise<unknown>) => MockOnceStub } =
      prepareQuickCapture as unknown as MockOnceStub
    mock.mockImplementationOnce(async () => {
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

describe('IdeaSaveSurface — quick commit (R6) and preview handoff (R1)', () => {
  const saveRig = () => {
    const create = vi.fn()
    const surface = new IdeaSaveSurface(
      { create, prepareFromMessage: vi.fn(), prepareQuickCapture: vi.fn() } as unknown as ConstructorParameters<typeof IdeaSaveSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
    )
    return { surface, create }
  }

  it('commits the prepared draft verbatim on the same preparation id', async () => {
    const { surface, create } = saveRig()
    create.mockResolvedValue({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } })
    const outcome = await surface.commitQuickPreview(preview('1'))
    expect(outcome).toBe('success')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]?.[0]).toMatchObject({ preparationId: 'prep_1', draft: preview('1').draft })
    expect(surface.state.getSnapshot().toastSeq).toBe(1)
  })

  it('R6: a structured Remote failure fully restores submitting and the in-flight flag', async () => {
    const { surface, create } = saveRig()
    create.mockResolvedValue({ ok: false as const, error: { code: 'idea/storage-failed' } })
    const outcome = await surface.commitQuickPreview(preview('1'))
    expect(outcome).toBe('failed')
    expect(create).toHaveBeenCalledTimes(1)
    // The observable state must be fully restored, and a follow-up commit
    // must be accepted (the in-flight flag is not stuck).
    expect(surface.state.getSnapshot().submitting).toBe(false)
    create.mockResolvedValue({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } })
    expect(await surface.commitQuickPreview(preview('1'))).toBe('success')
  })

  it('R6: a thrown unclear outcome also fully restores the observable state', async () => {
    const { surface, create } = saveRig()
    create.mockImplementation(async () => { throw new Error('carrier down') })
    expect(await surface.commitQuickPreview(preview('1'))).toBe('unclear')
    expect(surface.state.getSnapshot().submitting).toBe(false)
    expect(await surface.commitQuickPreview(preview('1'))).toBe('unclear')
    expect(create).toHaveBeenCalledTimes(4)
    expect(create.mock.calls.every(call => (call[0] as { preparationId: string }).preparationId === 'prep_1')).toBe(true)
  })

  it('an unclear outcome retries once with the SAME preparation id', async () => {
    const { surface, create } = saveRig()
    create.mockImplementationOnce(async () => { throw new Error('carrier down') })
      .mockImplementationOnce(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    expect(await surface.commitQuickPreview(preview('1'))).toBe('success')
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls.every(call => (call[0] as { preparationId: string }).preparationId === 'prep_1')).toBe(true)
  })

  it('R10: a busy surface is `busy` — not attempted, no create call, nothing dropped', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, create } = saveRig()
    create.mockImplementationOnce(async () => {
      await gate
      return { ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }
    })
    surface.openQuickPreview(preview('1'))
    expect(await surface.commitQuickPreview(preview('2'))).toBe('busy')
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

describe('IdeaQuickCaptureSurface — R7 commit is not cancellable, R8 same-id recovery and races', () => {
  const quickRigWithSave = () => {
    const prepareQuickCapture = vi.fn(async () => ({ ok: true as const, value: preview('1') }))
    const create = vi.fn()
    const save = new IdeaSaveSurface(
      { create, prepareFromMessage: vi.fn(), prepareQuickCapture: vi.fn() } as unknown as ConstructorParameters<typeof IdeaSaveSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
    )
    const surface = new IdeaQuickCaptureSurface(
      { prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
      {
        onPreview: p => save.openQuickPreview(p),
        onCommit: p => save.commitQuickPreview(p),
      },
    )
    return { surface, save, prepareQuickCapture, create }
  }

  it('R7: closing during the commit hides the form but preserves the note; failure is recoverable', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, save, create } = quickRigWithSave()
    const mock = create as unknown as {
      mockImplementationOnce: (impl: () => Promise<unknown>) => unknown
    }
    mock.mockImplementationOnce(async () => {
      await gate
      return { ok: false as const, error: { code: 'idea/storage-failed' } }
    })
    surface.open()
    surface.setText('原文要保留')
    surface.saveDirect()
    await vi.waitFor(() => expect(save.state.getSnapshot().submitting).toBe(true))

    // The card closes (Escape/outside/×) while the commit is in flight.
    surface.close()
    expect(surface.state.getSnapshot().open).toBe(false)
    expect(surface.state.getSnapshot().text).toBe('原文要保留')

    // The commit settles as a definitive failure: the note stays recoverable.
    release()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))
    expect(surface.state.getSnapshot().text).toBe('原文要保留')
    // Reopening the card shows the form with the note again.
    surface.open()
    expect(surface.state.getSnapshot().open).toBe(true)
    expect(surface.state.getSnapshot().text).toBe('原文要保留')
  })

  it('R7: a commit that succeeds after the card closed consumes the note cleanly', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, save, create } = quickRigWithSave()
    const mock = create as unknown as {
      mockImplementationOnce: (impl: () => Promise<unknown>) => unknown
    }
    mock.mockImplementationOnce(async () => {
      await gate
      return { ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }
    })
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(save.state.getSnapshot().submitting).toBe(true))
    surface.close()
    release()
    // The commit settles as a success: the note is consumed cleanly.
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(surface.state.getSnapshot().failure).toBeNull()
    expect(save.state.getSnapshot().modal).toBeNull()
  })

  it('R8: recovery after an unclear commit retries the SAME id, never a re-prepare', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const { surface, save, prepareQuickCapture, create } = quickRigWithSave()
    const mock = create as unknown as {
      mockImplementationOnce: (impl: () => Promise<unknown>) => unknown
    }
    mock.mockImplementationOnce(async () => {
      await gate
      throw new Error('carrier down')
    })
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(save.state.getSnapshot().submitting).toBe(true))
    release()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))

    // The user clicks 直接保存 again: the commit retries with the ORIGINAL
    // preparation id — prepareQuickCapture is NOT called again.
    mock.mockImplementationOnce(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    expect(create.mock.calls.every(call => (call[0] as { preparationId: string }).preparationId === 'prep_1')).toBe(true)
  })

  it('R8: a close → reopen → new task race never lets the stale finally clobber the new task', async () => {
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => { releaseA = resolve })
    let releaseB!: () => void
    const gateB = new Promise<void>((resolve) => { releaseB = resolve })
    const { surface, save, prepareQuickCapture, create } = quickRigWithSave()
    const mock: { mockImplementationOnce: (impl: () => Promise<unknown>) => MockOnceStub } =
      prepareQuickCapture as unknown as MockOnceStub
    mock.mockImplementationOnce(async () => {
      await gateA
      return { ok: true as const, value: preview('1') }
    }).mockImplementationOnce(async () => {
      await gateB
      return { ok: true as const, value: preview('1') }
    })
    create.mockResolvedValue({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } })

    // Task A: a direct-save prepare parked on the gate.
    surface.open()
    surface.setText('第一份原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().preparing).toBe('direct'))

    // Close (cancels A while still parked), reopen, start task B — A's
    // finally has not run yet: this is the deterministic race window.
    surface.close()
    surface.open()
    surface.setText('第二份原文')
    surface.saveDirect()
    expect(prepareQuickCapture).toHaveBeenCalledTimes(2)

    // A's finally now runs: it must not clobber B's controller or state.
    releaseA()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(surface.state.getSnapshot().preparing).toBe('direct')
    expect(surface.state.getSnapshot().text).toBe('第二份原文')

    // B completes normally and consumes B's note only.
    releaseB()
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(create).toHaveBeenCalledTimes(1)
    expect(save.state.getSnapshot().failure).toBeNull()
  })
})

describe('IdeaQuickCaptureSurface — R9 pendingUnclear recovery lifecycle', () => {
  const unclearRig = () => {
    const rig = quickRig()
    // The first commit's outcome is unclear (thrown carrier error).
    const create = vi.fn()
    const save = new IdeaSaveSurface(
      { create, prepareFromMessage: vi.fn(), prepareQuickCapture: vi.fn() } as unknown as ConstructorParameters<typeof IdeaSaveSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
    )
    rig.surface.dispose()
    const surface = new IdeaQuickCaptureSurface(
      { prepareQuickCapture: rig.prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
      {
        onPreview: p => save.openQuickPreview(p),
        onCommit: p => save.commitQuickPreview(p),
      },
    )
    return { ...rig, surface, save, create }
  }

  it('R9-4: a structured Gateway-class failure is classified unclear, not failed', async () => {
    const create = vi.fn()
    const surface = new IdeaSaveSurface(
      { create, prepareFromMessage: vi.fn(), prepareQuickCapture: vi.fn() } as unknown as ConstructorParameters<typeof IdeaSaveSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
    )
    create.mockResolvedValueOnce({ ok: false as const, error: { code: 'gateway/internal' } })
    expect(await surface.commitQuickPreview(preview('1'))).toBe('unclear')
    // A plugin-owned code stays a definitive failure.
    create.mockResolvedValueOnce({ ok: false as const, error: { code: 'idea/storage-failed' } })
    expect(await surface.commitQuickPreview(preview('1'))).toBe('failed')
  })

  it('R9-1/R9-2: unclear → close → reopen → the same-id retry works, no concurrent duplicates', async () => {
    const rig = unclearRig()
    const { surface, prepareQuickCapture, create } = rig
    const mock = create as unknown as {
      mockImplementationOnce: (impl: () => Promise<unknown>) => unknown
    }
    mock.mockImplementationOnce(async () => { throw new Error('carrier down') })
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))

    // Closing the card with an unresolved pendingUnclear preserves the note.
    surface.close()
    expect(surface.state.getSnapshot()).toMatchObject({ open: false, text: '原文' })
    surface.open()
    expect(surface.state.getSnapshot()).toMatchObject({ open: true, text: '原文', failure: 'commit-failed' })

    // The manual retry enters commitInFlight synchronously: a double
    // activation cannot fire a concurrent duplicate commit.
    mock.mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return { ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }
    })
    surface.saveDirect()
    expect(surface.state.getSnapshot().preparing).toBe('direct')
    surface.saveDirect()
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    expect(create.mock.calls.every(call => (call[0] as { preparationId: string }).preparationId === 'prep_1')).toBe(true)
  })

  it('R9-3: an unresolved pendingUnclear cannot be bypassed by editing or AI organize', async () => {
    const { surface, prepareQuickCapture, create } = unclearRig()
    const mock = create as unknown as {
      mockImplementationOnce: (impl: () => Promise<unknown>) => unknown
    }
    mock.mockImplementationOnce(async () => { throw new Error('carrier down') })
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))
    // Editing the note is refused while the recovery is pending.
    surface.setText('试图改写')
    expect(surface.state.getSnapshot().text).toBe('原文')
    // AI organize is refused too: no new preparation may bypass the recovery.
    surface.organize()
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    // The unclear commit's same-id retry ran (2 create calls, one id).
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls.every(call => (call[0] as { preparationId: string }).preparationId === 'prep_1')).toBe(true)
  })

  it('R9-5: a retry in flight survives close; success and failure both recover', async () => {
    const { surface, create } = unclearRig()
    const mock = create as unknown as {
      mockImplementationOnce: (impl: () => Promise<unknown>) => unknown
    }
    // First commit: unclear.
    mock.mockImplementationOnce(async () => { throw new Error('carrier down') })
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))

    // Retry in flight, gated; the card closes during it.
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    mock.mockImplementationOnce(async () => {
      await gate
      return { ok: false as const, error: { code: 'idea/storage-failed' } }
    })
    surface.open()
    surface.saveDirect()
    expect(surface.state.getSnapshot().preparing).toBe('direct')
    surface.close()
    expect(surface.state.getSnapshot().text).toBe('原文')
    release()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))
    surface.open()
    expect(surface.state.getSnapshot().text).toBe('原文')

    // A later retry succeeds: the note is finally consumed.
    mock.mockImplementationOnce(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    surface.open()
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(surface.state.getSnapshot().open).toBe(false)
  })
})

describe('IdeaQuickCaptureSurface — R10 busy never destroys the pending recovery', () => {
  type CreateOk = { ok: true; value: { ideaId: string; currentVersionId: string; status: 'active'; title: string; createdAt: number } }
  type CreateFail = { ok: false; error: { code: string } }

  const busyRig = () => {
    const prepareQuickCapture = vi.fn(async () => ({ ok: true as const, value: preview('1') }))
    // The base create persists a transport failure: every unmocked attempt is
    // an UNCLEAR outcome, so pendingUnclear semantics stay deterministic.
    const create = vi.fn((_request: { preparationId: string; draft: unknown }): Promise<CreateOk | CreateFail> => {
      throw new Error('carrier down')
    })
    const save = new IdeaSaveSurface(
      { create, prepareFromMessage: vi.fn(), prepareQuickCapture: vi.fn() } as unknown as ConstructorParameters<typeof IdeaSaveSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
    )
    const surface = new IdeaQuickCaptureSurface(
      { prepareQuickCapture } as unknown as ConstructorParameters<typeof IdeaQuickCaptureSurface>[0],
      { kind: 'session', sessionId: 'session-1' },
      {
        onPreview: p => save.openQuickPreview(p),
        onCommit: p => save.commitQuickPreview(p),
      },
    )
    return { surface, save, prepareQuickCapture, create }
  }

  it('R10: unclear → other modal busy → the retry is not attempted and the original id is preserved', async () => {
    const { surface, save, prepareQuickCapture, create } = busyRig()
    // The first commit's outcome is unclear (two same-id create calls).
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))
    expect(create).toHaveBeenCalledTimes(2)

    // An unrelated AI preview modal occupies the save surface: the retry is
    // NOT attempted (no create call) and nothing is lost.
    save.openQuickPreview(preview('2'))
    surface.saveDirect()
    await flush()
    expect(create).toHaveBeenCalledTimes(2)
    expect(surface.state.getSnapshot().text).toBe('原文')

    // Once the busy surface clears, the retry runs with the ORIGINAL id.
    create.mockImplementationOnce(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    save.cancel()
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(3)
    expect(create.mock.calls.every(call => (call[0] as { preparationId: string }).preparationId === 'prep_1')).toBe(true)
  })

  it('R10: a first direct save bounced by busy keeps the note and commits later on the SAME id', async () => {
    const { surface, save, prepareQuickCapture, create } = busyRig()
    // An unrelated modal occupies the save surface BEFORE the first save.
    save.openQuickPreview(preview('2'))
    surface.open()
    surface.setText('第一次的想法')
    surface.saveDirect()
    await flush()
    // The prepare ran, but the commit was never attempted.
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(0)
    expect(surface.state.getSnapshot().text).toBe('第一次的想法')

    // The busy surface clears: the retry commits the SAME preparation id —
    // no re-prepare, so no duplicate-creation risk.
    create.mockImplementationOnce(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    save.cancel()
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(prepareQuickCapture).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
    expect((create.mock.calls[0] as [{ preparationId: string }])[0].preparationId).toBe('prep_1')
    expect(save.state.getSnapshot().modal).toBeNull()
  })

  it('R10: a double activation during the busy bounce still cannot fire a concurrent commit', async () => {
    const { surface, save, create } = busyRig()
    // Unclear first commit, then a busy bounce.
    surface.open()
    surface.setText('原文')
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().failure).toBe('commit-failed'))
    expect(create).toHaveBeenCalledTimes(2)
    save.openQuickPreview(preview('2'))
    surface.saveDirect()
    surface.saveDirect()
    await flush()
    // Both activations during the busy bounce are no-ops (not attempted).
    expect(create).toHaveBeenCalledTimes(2)

    save.cancel()
    create.mockImplementationOnce(async () => ({ ok: true as const, value: { ideaId: 'idea_1', currentVersionId: 'idea_ver_1', status: 'active' as const, title: 't', createdAt: 1 } }))
    surface.saveDirect()
    await vi.waitFor(() => expect(surface.state.getSnapshot().text).toBe(''))
    expect(create).toHaveBeenCalledTimes(3)
    expect(create.mock.calls.every(call => (call[0] as { preparationId: string }).preparationId === 'prep_1')).toBe(true)
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
