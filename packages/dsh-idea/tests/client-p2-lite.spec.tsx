// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import { IdeaSaveSurface, editableFrom } from '../src/client/state.ts'
import type { IdeaRemoteFace } from '../src/client/state.ts'
import { IdeaSaveDialog } from '../src/client/IdeaSaveDialog.tsx'
import type { IdeaDialogProps } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'

const controllers: IdeaSaveSurface[] = []
afterEach(() => { cleanup(); controllers.splice(0).forEach(surface => surface.dispose()) })
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
const draft = { title: 'Proposal', core: 'Bounded content', motivation: '', currentConclusion: '', possibleValue: '', useWhen: [], openQuestions: [] }
const target = (id = 'one') => ({ id, versionId: `base-${id}`, status: 'active', ...draft, title: 'Same title', core: `Content ${id}`, createdAt: 1, updatedAt: 1 })
const source = { sessionId: 'session', anchorMessageId: 'answer', startSeq: 1, endSeq: 3, messageCount: 2, characterCount: 30, truncated: true }
const ok = <T,>(value: T) => ({ ok: true as const, value })
const fail = (code: string) => ({ ok: false as const, error: { code } })
function rig(overrides: Record<string, unknown> = {}) {
  const face = {
    list: vi.fn(async () => ok([target(), target('two')])), search: vi.fn(async () => ok([target('two')])),
    get: vi.fn(async ({ id }: { id: string }) => ok(target(id))),
    prepareFromMessage: vi.fn(async () => ok({ preparationId: 'prep_new', draft, source })),
    create: vi.fn(async () => ok({ ideaId: 'new' })),
    prepareUpdateFromMessage: vi.fn(async () => ok({ updateId: 'upd_one', draft, sourceStats: source, targetSummary: { ideaId: 'one', currentVersionId: 'base-one', title: 'Same title', status: 'active' } })),
    commitPreparedUpdate: vi.fn(async () => ok({ ideaId: 'one', currentVersionId: 'next', updated: true })),
    ...overrides,
  }
  const surface = new IdeaSaveSurface(face as unknown as IdeaRemoteFace, { kind: 'session', sessionId: 'session' })
  controllers.push(surface)
  const props = {
    sessionId: 'session', useIdea: (select: (state: unknown) => unknown) => useSyncExternalStore(surface.state.subscribe, () => select(surface.state.getSnapshot())),
    chooseMode: (mode: 'new' | 'update') => surface.chooseMode(mode), queryTargets: (query: string) => surface.queryTargets(query),
    selectTarget: (id: string) => surface.selectTarget(id), generate: () => surface.generate(),
    editDraft: surface.editDraft.bind(surface), submit: surface.submit.bind(surface), cancel: surface.cancel.bind(surface),
    cancelPending: surface.cancelPending.bind(surface), recordRendered: surface.recordRendered.bind(surface),
    dismissFailure: surface.dismissFailure.bind(surface), dismissToast: surface.dismissToast.bind(surface),
    t: (key: keyof typeof zh, params?: Record<string, unknown>) => zh[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')),
  } as unknown as IdeaDialogProps
  return { surface, face, props }
}
async function select(surface: IdeaSaveSurface) {
  act(() => { surface.openSummary('answer' as MessageId); surface.chooseMode('update') })
  await flush()
  act(() => surface.selectTarget('one')); await flush()
}

describe('P2-Lite explicit summary interaction', () => {
  for (const mode of ['new', 'update'] as const) {
    it(`UX02A ${mode}: choice/pending/preview commits are distinct, once-only and exclude user selection time`, async () => {
      const gate = Promise.withResolvers<unknown>()
      const prepare = vi.fn(() => gate.promise)
      const { surface, face, props } = rig(mode === 'new' ? { prepareFromMessage: prepare } : { prepareUpdateFromMessage: prepare })
      render(<IdeaSaveDialog {...props} />)
      if (mode === 'update') await select(surface)
      else act(() => surface.openSummary('answer' as MessageId))
      expect(surface.performance.snapshot()['client.choice-commit']?.count).toBe(1)
      expect(prepare).not.toHaveBeenCalled()
      expect(surface.performance.snapshot()['client.generate-to-preview-commit']).toBeUndefined()
      act(() => { surface.generate(); surface.generate() })
      expect(screen.getByRole('status').textContent).toContain('正在生成')
      expect(surface.performance.snapshot()['client.pending-commit']?.count).toBe(1)
      gate.resolve(ok(mode === 'new' ? { preparationId: 'private-prep', draft, source }
        : { updateId: 'private-update', draft, sourceStats: source, targetSummary: { ideaId: 'one', currentVersionId: 'base-one', title: 'Same title', status: 'active' } }))
      await flush()
      act(() => surface.editDraft({ title: 'edited private body' }))
      const metrics = surface.performance.snapshot()
      for (const stage of ['client.choice-commit', 'client.pending-commit', 'client.preview-commit', 'client.generate-to-preview-commit', 'client.rpc'] as const) expect(metrics[stage]?.count).toBe(1)
      expect(metrics[mode === 'new' ? 'client.new-rpc' : 'client.update-rpc']?.count).toBe(1)
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(face.create).not.toHaveBeenCalled(); expect(face.commitPreparedUpdate).not.toHaveBeenCalled()
      expect(JSON.stringify(metrics)).not.toMatch(/private|edited|session|answer/)
    })

    it(`UX02A ${mode}: cancelled late responses and unmounted commits do not add preview observations`, async () => {
      const gate = Promise.withResolvers<unknown>()
      const prepare = vi.fn(() => gate.promise)
      const { surface, props } = rig(mode === 'new' ? { prepareFromMessage: prepare } : { prepareUpdateFromMessage: prepare })
      const view = render(<IdeaSaveDialog {...props} />)
      if (mode === 'update') await select(surface)
      else act(() => surface.openSummary('answer' as MessageId))
      act(() => surface.generate())
      view.unmount()
      gate.resolve(ok({ preparationId: 'late', updateId: 'late', draft, source, sourceStats: source }))
      await flush()
      const metrics = surface.performance.snapshot()
      expect(metrics['client.choice-commit']?.count).toBe(1)
      expect(metrics['client.pending-commit']?.count).toBe(1)
      expect(metrics['client.preview-commit']).toBeUndefined()
      expect(metrics['client.generate-to-preview-commit']).toBeUndefined()
      expect(surface.state.getSnapshot().modal).toBeNull()
      expect((prepare.mock.calls[0] as unknown as [unknown, AbortSignal])[1].aborted).toBe(true)
    })
  }

  it('L01/L11 immediately opens mode choice with zero requests; new generation/save keep separate contracts', async () => {
    const { surface, face, props } = rig(); render(<IdeaSaveDialog {...props} />)
    act(() => { surface.openSummary('answer' as MessageId); surface.openSummary('other' as MessageId) })
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('button', { name: '更新已有 Idea' })).toBeTruthy()
    expect(face.prepareFromMessage).not.toHaveBeenCalled(); expect(face.list).not.toHaveBeenCalled()
    act(() => { surface.generate(); surface.generate() }); await flush()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(face.prepareFromMessage).toHaveBeenCalledTimes(1)
    expect(face.prepareUpdateFromMessage).not.toHaveBeenCalled()
    expect(face.create).not.toHaveBeenCalled()
    act(() => surface.submit()); await flush()
    expect(face.create).toHaveBeenCalledWith({ preparationId: 'prep_new', draft })
    expect(face.commitPreparedUpdate).not.toHaveBeenCalled()
  })

  it('L01/L02 empty library never invents a target or dispatches a model', async () => {
    const { surface, face, props } = rig({ list: vi.fn(async () => ok([])) }); render(<IdeaSaveDialog {...props} />)
    act(() => { surface.openSummary('answer' as MessageId); surface.chooseMode('update'); surface.generate() }); await flush()
    expect((screen.getByRole('button', { name: '生成草稿' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('没有可更新的 Idea，可保存为新 Idea。')).toBeTruthy()
    expect(face.prepareUpdateFromMessage).not.toHaveBeenCalled()
  })

  it('L02 stale search/detail cannot overwrite a newer explicit selection, even with identical titles', async () => {
    const search = Promise.withResolvers<ReturnType<typeof ok>>()
    const read = Promise.withResolvers<ReturnType<typeof ok>>()
    const { surface, face } = rig({ search: vi.fn(() => search.promise), get: vi.fn(({ id }: { id: string }) => id === 'one' ? read.promise : Promise.resolve(ok(target(id)))) })
    await select(surface)
    act(() => { surface.queryTargets('old'); surface.queryTargets(''); surface.selectTarget('two') }); await flush()
    search.resolve(ok([target('old')])); read.resolve(ok(target())); await flush()
    expect(surface.state.getSnapshot().summary?.target?.id).toBe('two')
    expect(surface.state.getSnapshot().summary?.items.map(item => item.id)).toEqual(['one', 'two'])
    expect(face.prepareUpdateFromMessage).not.toHaveBeenCalled()
  })

  it('L03/L09/L14 explicitly generates an editable update with target/base, then commits only ticket/draft', async () => {
    const { surface, face, props } = rig(); render(<IdeaSaveDialog {...props} />); await select(surface)
    expect(screen.getByRole('region', { name: '当前内容摘要' }).textContent).toContain('Content one')
    act(() => { surface.generate(); surface.generate() }); await flush()
    expect(face.prepareUpdateFromMessage).toHaveBeenCalledTimes(1)
    expect(face.prepareUpdateFromMessage).toHaveBeenCalledWith(expect.objectContaining({ ideaId: 'one', expectedCurrentVersionId: 'base-one', messageId: 'answer', requestKey: expect.any(String) }), expect.any(AbortSignal))
    expect(screen.getByText(/已截断为有界来源/)).toBeTruthy()
    act(() => surface.editDraft({ title: 'Approved' }))
    act(() => { surface.submit(); surface.submit() }); await flush()
    expect(face.commitPreparedUpdate).toHaveBeenCalledTimes(1)
    expect(face.commitPreparedUpdate).toHaveBeenCalledWith({ updateId: 'upd_one', draft: { ...draft, title: 'Approved' } })
    expect(face.create).not.toHaveBeenCalled()
    expect(surface.state.getSnapshot().success).toBe('updated')
  })

  it('L15 unchanged is a completed result, without a second commit or a fallback create', async () => {
    const { surface, face } = rig({ commitPreparedUpdate: vi.fn(async () => ok({ updated: false })) })
    await select(surface); act(() => surface.generate()); await flush()
    act(() => surface.submit()); await flush(); act(() => surface.submit())
    expect(surface.state.getSnapshot().success).toBe('unchanged')
    expect(surface.state.getSnapshot().modal).toBeNull()
    expect(face.commitPreparedUpdate).toHaveBeenCalledTimes(1); expect(face.create).not.toHaveBeenCalled()
  })

  it.each(['idea/version-conflict', 'idea/archived', 'idea/update-not-found'])('L04/L05/L16 %s retains the draft and never changes the base or retries', async code => {
    const { surface, face } = rig({ commitPreparedUpdate: vi.fn(async () => fail(code)) })
    await select(surface); act(() => surface.generate()); await flush()
    act(() => surface.editDraft({ title: 'Keep my draft' })); act(() => surface.submit()); await flush()
    act(() => { surface.dismissFailure(); surface.submit() }); await flush()
    expect(surface.state.getSnapshot().modal?.draft.title).toBe('Keep my draft')
    expect(face.commitPreparedUpdate).toHaveBeenCalledTimes(1)
    expect(face.prepareUpdateFromMessage).toHaveBeenCalledTimes(1)
  })

  it.each(['idea/update-result-uncertain', 'gateway/internal', 'idea/storage-failed'])('L18 %s locks payload and performs read-only verification without a fresh write', async code => {
    const { surface, face } = rig({ commitPreparedUpdate: vi.fn(async () => fail(code)) })
    await select(surface); act(() => surface.generate()); await flush()
    act(() => surface.submit()); await flush()
    act(() => { surface.dismissFailure(); surface.editDraft({ title: 'Forbidden mutation' }); surface.submit() }); await flush()
    expect(surface.state.getSnapshot().modal?.draft).toEqual(editableFrom(draft))
    expect(face.commitPreparedUpdate).toHaveBeenCalledTimes(1)
    expect(face.get).toHaveBeenCalledTimes(2)
    expect(face.prepareUpdateFromMessage).toHaveBeenCalledTimes(1)
  })

  it.each(['idea/source-unavailable', 'idea/model-failed', 'idea/invalid-model-output', 'idea/version-conflict'])('L07/L10 prepare %s never produces a preview, commit or hidden retry', async code => {
    const { surface, face } = rig({ prepareUpdateFromMessage: vi.fn(async () => fail(code)) })
    await select(surface); act(() => surface.generate()); await flush()
    expect(surface.state.getSnapshot().modal).toBeNull()
    expect(surface.state.getSnapshot().failure).not.toBeNull()
    expect(face.prepareUpdateFromMessage).toHaveBeenCalledTimes(1); expect(face.commitPreparedUpdate).not.toHaveBeenCalled()
  })

  it.each(['cancel', 'mode', 'target', 'unmount', 'session'])('L12/L13 %s aborts a pending update; late output cannot open or replace a preview', async action => {
    const gate = Promise.withResolvers<unknown>(); const prepare = vi.fn(() => gate.promise)
    const { surface, face, props } = rig({ prepareUpdateFromMessage: prepare }); const view = render(<IdeaSaveDialog {...props} />)
    await select(surface); act(() => surface.generate()); await flush()
    const signal = prepare.mock.calls[0] as unknown as [unknown, AbortSignal]
    if (action === 'unmount') view.unmount()
    else if (action === 'session') view.rerender(<IdeaSaveDialog {...props} sessionId="other-session" />)
    else act(() => { if (action === 'cancel') surface.cancel(); else if (action === 'mode') surface.chooseMode('new'); else surface.selectTarget('two') })
    expect(signal[1].aborted).toBe(true)
    gate.resolve(ok({ updateId: 'late', draft, sourceStats: source })); await flush()
    expect(surface.state.getSnapshot().modal).toBeNull()
    expect(face.commitPreparedUpdate).not.toHaveBeenCalled()
  })

  it('L13 ready preview mode change requires confirmation and never auto-generates', async () => {
    const { surface, face, props } = rig(); render(<IdeaSaveDialog {...props} />); await select(surface)
    act(() => surface.generate()); await flush()
    fireEvent.click(screen.getByRole('button', { name: '保存新 Idea' }))
    expect(screen.getByRole('dialog', { name: '放弃未保存的草稿？' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: '继续编辑' }).at(-1)!)
    expect(surface.state.getSnapshot().modal?.kind).toBe('update')
    fireEvent.click(screen.getByRole('button', { name: '保存新 Idea' }))
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(surface.state.getSnapshot().modal).toBeNull()
    expect(surface.state.getSnapshot().summary?.mode).toBe('new')
    expect(face.prepareFromMessage).not.toHaveBeenCalled()
    expect(face.prepareUpdateFromMessage).toHaveBeenCalledTimes(1)
  })

  it('L17 submitting disables editing, cancellation and duplicate submission until the result', async () => {
    const gate = Promise.withResolvers<unknown>(); const commit = vi.fn(() => gate.promise)
    const { surface } = rig({ commitPreparedUpdate: commit }); await select(surface)
    act(() => surface.generate()); await flush()
    act(() => { surface.submit(); surface.cancel(); surface.editDraft({ title: 'Not allowed' }); surface.submit() })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(surface.state.getSnapshot().modal?.draft.title).toBe('Proposal')
    gate.resolve(ok({ updated: true })); await flush()
    expect(surface.state.getSnapshot().modal).toBeNull()
  })
})
