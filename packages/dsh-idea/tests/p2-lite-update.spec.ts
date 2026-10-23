import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { IdeaId, IdeaVersionId } from '../src/types.ts'
import type { IdeaUpdateId } from '../src/preparation/update-types.ts'
import { draft, sourceDraft, storedBytes } from './helpers/harness.ts'
import { assistantEvent, userEvent, textStream, toolCallStream } from './helpers/preparation.ts'
import { cleanupUpdates, noNetwork, recordsOf, sourceEvents, updateHarness, updateRequest } from './helpers/update.ts'

beforeEach(noNetwork); afterEach(cleanupUpdates)
const proposed = () => draft({ title: 'Updated current idea', currentConclusion: 'A stronger conclusion', motivation: '' })
const model = (env: Awaited<ReturnType<typeof updateHarness>>, value = proposed()) => env.llm.enqueueChunks(textStream(JSON.stringify(value)))
const codeOf = async (run: () => Promise<unknown>) => { try { await run(); return null } catch (error) { return remoteErrorOf(error)?.code } }

describe('P2-Lite Host/Remote explicit-target AI update', () => {
  it('H00 generated RPC codecs round-trip the new Host contracts and reject Client source overrides', async () => {
    const { default: contribution } = await import('../lib/typert.remote-client.js')
    const prepare = contribution.methods['idea/prepareUpdateFromMessage']
    const commit = contribution.methods['idea/commitPreparedUpdate']
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const request = updateRequest(initial)
    const decoded = prepare.input({ strict: true }).create().parse({ request })
    expect(() => prepare.input({ strict: true }).create().parse({ request: { ...request, source: sourceDraft() } })).toThrow()
    model(env)
    const preview = await env.remote.prepareUpdateFromMessage(decoded.request)
    expect(prepare.result.create().parse(preview)).toEqual(preview)
    const input = { request: { updateId: preview.updateId, draft: preview.draft } }
    const approved = commit.input({ strict: true }).create().parse(input)
    expect(() => commit.input({ strict: true }).create().parse({ request: { ...input.request, ideaId: 'other' } })).toThrow()
    const result = await env.remote.commitPreparedUpdate(approved.request)
    expect(commit.result.create().parse(result)).toEqual(result)
  })

  it('H01 prepares once without writes, then atomically commits the approved draft and exact Host source', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const other = await env.service.create(draft({ title: 'Other idea' }), sourceDraft())
    const before = await storedBytes(env.root, initial.idea.ideaId)
    const read = vi.spyOn(env.sessionQuery, 'readSurface')
    model(env)
    const preview = await env.remote.prepareUpdateFromMessage(updateRequest(initial))
    expect(read).toHaveBeenCalledTimes(1); expect(env.llm.calls).toHaveLength(1)
    expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(before)
    expect(preview.targetSummary).toMatchObject({ ideaId: initial.idea.ideaId, currentVersionId: initial.idea.currentVersionId, title: draft().title })
    expect(preview.sourceStats).toMatchObject({ startSeq: 2, endSeq: 4, messageCount: 2, truncated: false })
    const prompt = env.llm.calls[0]!.messages[0]!.content
    const promptText = JSON.stringify(prompt)
    expect(promptText).toContain(draft().core)
    expect(promptText).toContain('Improve the current conclusion.')
    expect(promptText).not.toContain('excluded recall'); expect(promptText).not.toContain('excluded future')
    expect(promptText).toContain('historySummary')
    const update = vi.spyOn(recordsOf(env.service), 'update')
    const approved = { ...preview.draft, title: 'User approved title' }
    // Adversarial extra fields must not replace the Host-bound target/source.
    const result = await env.remote.commitPreparedUpdate({ updateId: preview.updateId, draft: approved,
      ideaId: other.idea.ideaId, source: sourceDraft({ sessionId: 'forged-source' }) } as never)
    expect(result.updated).toBe(true); expect(update).toHaveBeenCalledTimes(1)
    const saved = env.service.get(initial.idea.ideaId)
    expect(saved.versions).toHaveLength(2); expect(saved.sourceDiscussions).toHaveLength(2); expect(saved.evolutionEvents).toHaveLength(2)
    expect(saved.versions[1]!.draft).toEqual(approved)
    expect(saved.versions[1]!.sourceDiscussionIds).toEqual([saved.sourceDiscussions[1]!.sourceDiscussionId])
    expect(saved.sourceDiscussions[1]).toMatchObject({
      ideaId: initial.idea.ideaId, sessionId: 'ordinary-session', anchorMessageId: 'answer', startSeq: 2, endSeq: 4,
      capturedContext: [{ role: 'user', text: 'Improve the current conclusion.' }, { role: 'assistant', text: 'Keep the useful fields and revise the conclusion.' }],
    })
    expect(saved.versions[0]).toEqual(initial.versions[0]); expect(saved.sourceDiscussions[0]).toEqual(initial.sourceDiscussions[0])
    expect(env.service.get(other.idea.ideaId)).toEqual(other)
    expect(await env.remote.get({ id: initial.idea.ideaId })).toMatchObject({ source: { sessionId: 'ordinary-session', anchorMessageId: 'answer' } })
    expect(env.llm.calls).toHaveLength(1)
    // No persisted special discussion/workspace was fabricated.
    expect(env.service.findCurrentDiscussion(initial.idea.ideaId)).toBeUndefined()
  })

  it('H02 duplicate generation requests join one read/route/model call; binding changes reject', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const started = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>()
    env.llm.enqueueScript(async function* () { started.resolve(); await gate.promise; yield* textStream(JSON.stringify(proposed())) })
    const read = vi.spyOn(env.sessionQuery, 'readSurface'), route = vi.spyOn(env.sessionQuery, 'observeSession')
    const a = env.remote.prepareUpdateFromMessage(updateRequest(initial)); await started.promise
    const b = env.remote.prepareUpdateFromMessage(updateRequest(initial))
    expect(await codeOf(() => env.remote.prepareUpdateFromMessage({ ...updateRequest(initial), messageId: 'other-anchor' }))).toBe('idea/update-request-conflict')
    gate.resolve()
    const [left, right] = await Promise.all([a, b]); expect(left).toEqual(right)
    expect(read).toHaveBeenCalledTimes(1); expect(route).toHaveBeenCalledTimes(1); expect(env.llm.calls).toHaveLength(1)
    left.draft.title = 'Client mutation'
    expect((await env.remote.prepareUpdateFromMessage(updateRequest(initial))).draft.title).toBe(proposed().title)
  })

  it.each(['missing', 'stale', 'archived', 'forged-input'] as const)('H03 %s target rejects before source/model work', async kind => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    if (kind === 'archived') await env.service.archive(initial.idea.ideaId, initial.idea.currentVersionId)
    const request = updateRequest(initial)
    if (kind === 'missing') request.ideaId = IdeaId('absent')
    if (kind === 'stale') request.expectedCurrentVersionId = IdeaVersionId('stale')
    const read = vi.spyOn(env.sessionQuery, 'readSurface')
    const expected = { missing: 'idea/not-found', stale: 'idea/version-conflict', archived: 'idea/archived', 'forged-input': 'idea/invalid-update-request' }[kind]
    expect(await codeOf(() => env.remote.prepareUpdateFromMessage(kind === 'forged-input' ? { ...request, source: 'untrusted' } as never : request))).toBe(expected)
    expect(read).not.toHaveBeenCalled(); expect(env.llm.calls).toHaveLength(0)
  })

  it.each(['missing', 'duplicate', 'empty', 'inherited', 'replacement', 'wrong-session', 'tool-only'] as const)('H04 %s source is rejected without a model call', async kind => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    let events = sourceEvents()
    if (kind === 'missing') events = events.filter(event => event.type !== 'assistant/message')
    if (kind === 'duplicate') events.push(assistantEvent('answer', 'ambiguous answer', 8))
    if (kind === 'empty') events = [userEvent('u', 'Earlier human', 2), assistantEvent('answer', '  ', 4)]
    if (kind === 'replacement') events = [userEvent('replaced', 'Later surface replacement', 8), assistantEvent('answer', 'Answer', 4)]
    if (kind === 'tool-only') events = [assistantEvent('answer', '', 4, { message: { id: 'answer', role: 'assistant', content: [{ type: 'tool-call', id: 'call', name: 'tool', arguments: '{}' }], source: { provider: 'offline', model: 'fixture' } } })]
    env.sessionQuery.add('ordinary-session', events)
    if (kind === 'inherited' || kind === 'wrong-session') vi.spyOn(env.sessionQuery, 'readSurface').mockResolvedValue({
      session: { id: kind === 'wrong-session' ? 'another-session' : 'ordinary-session' }, inheritedEventCount: kind === 'inherited' ? 5 : 0,
      capturedThroughSeq: 6, events,
    })
    await expect(env.updates.prepare(updateRequest(initial))).rejects.toMatchObject({ code: kind === 'missing' || kind === 'duplicate' || kind === 'wrong-session' ? 'source-not-found' : 'source-unavailable' })
    expect(env.llm.calls).toHaveLength(0)
  })

  it('H05 capture is frozen for prompt and persistence, with bounded/truncated stats', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const long = 'bounded text '.repeat(2000)
    env.sessionQuery.add('ordinary-session', [userEvent('u', long, 2), assistantEvent('answer', 'Answer', 4)])
    model(env)
    const preview = await env.updates.prepare(updateRequest(initial))
    expect(preview.sourceStats.characterCount).toBe(12000); expect(preview.sourceStats.truncated).toBe(true)
    env.sessionQuery.add('ordinary-session', [userEvent('different', 'Must not recapture this', 10), assistantEvent('answer', 'Changed later source', 12)])
    await env.updates.commit(preview.updateId, preview.draft)
    const source = env.service.get(initial.idea.ideaId).sourceDiscussions[1]!
    expect(source.startSeq).toBe(2); expect(source.endSeq).toBe(4)
    const input = env.llm.calls[0]!.messages[0]!.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
    const snapshot = JSON.parse(input.split('\n')[1]!) as { discussion: { messages: unknown[] } }
    expect(source.capturedContext).toEqual(snapshot.discussion.messages)
    expect(JSON.stringify(source)).not.toContain('Must not recapture')
  })

  it('H05b message-count truncation is reported and uses the same bounded prompt/source', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    env.sessionQuery.add('ordinary-session', [
      ...Array.from({ length: 14 }, (_, index) => userEvent(`human-${index}`, `Discussion ${index}`, index + 1)),
      assistantEvent('answer', 'Bounded answer', 15),
    ])
    model(env)
    const preview = await env.updates.prepare(updateRequest(initial))
    expect(preview.sourceStats).toMatchObject({ messageCount: 12, startSeq: 4, endSeq: 15, truncated: true })
    await env.updates.commit(preview.updateId, preview.draft)
    const source = env.service.get(initial.idea.ideaId).sourceDiscussions[1]!
    const input = env.llm.calls[0]!.messages[0]!.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
    expect(source.capturedContext).toEqual(JSON.parse(input.split('\n')[1]!).discussion.messages)
    expect(source.capturedContext[0]!.text).toBe('Discussion 3')
  })

  it.each(['changed', 'archived'] as const)('H06 %s during the one model call yields no stale ticket or rebase', async kind => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    env.llm.enqueueScript(async function* () {
      if (kind === 'changed') await env.service.manualEdit(initial.idea.ideaId, draft({ title: 'Concurrent manual edit' }), initial.idea.currentVersionId)
      else await env.service.archive(initial.idea.ideaId, initial.idea.currentVersionId)
      yield* textStream(JSON.stringify(proposed()))
    })
    await expect(env.updates.prepare(updateRequest(initial))).rejects.toMatchObject({ code: kind === 'changed' ? 'version-conflict' : 'archived' })
    await expect(env.updates.prepare(updateRequest(initial))).rejects.toBeDefined()
    expect(env.llm.calls).toHaveLength(1); expect(env.service.get(initial.idea.ideaId).sourceDiscussions).toHaveLength(1)
  })

  it('H07 preview becoming stale rejects commit even if edited draft equals latest', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()); model(env)
    const preview = await env.updates.prepare(updateRequest(initial))
    const latest = await env.service.manualEdit(initial.idea.ideaId, proposed(), initial.idea.currentVersionId)
    const bytes = await storedBytes(env.root, initial.idea.ideaId)
    expect(await codeOf(() => env.remote.commitPreparedUpdate({ updateId: preview.updateId, draft: latest.versions[1]!.draft }))).toBe('idea/version-conflict')
    expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(bytes)
    expect(env.service.get(initial.idea.ideaId).sourceDiscussions).toHaveLength(1)
  })

  it('H08 no-change consumes the payload binding but makes zero durable write; normalized retry replays', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()); model(env)
    const preview = await env.updates.prepare(updateRequest(initial))
    const bytes = await storedBytes(env.root, initial.idea.ideaId), update = vi.spyOn(recordsOf(env.service), 'update'), put = vi.spyOn(recordsOf(env.service), 'put')
    const result = await env.updates.commit(preview.updateId, draft({ title: ` ${draft().title} ` }))
    expect(result.updated).toBe(false)
    expect(await env.updates.commit(preview.updateId, draft())).toEqual(result)
    await expect(env.updates.commit(preview.updateId, proposed())).rejects.toMatchObject({ code: 'update-payload-conflict' })
    expect(update).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled()
    expect(await storedBytes(env.root, initial.idea.ideaId)).toEqual(bytes)
    expect(env.service.get(initial.idea.ideaId)).toEqual(initial)
  })

  it('H09 concurrent same-ticket commits join one aggregate write and replay without duplicate sources', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()); model(env)
    const preview = await env.updates.prepare(updateRequest(initial)), gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
    const table = recordsOf(env.service), original = table.update.bind(table)
    const update = vi.spyOn(table, 'update').mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return original(...args) })
    const first = env.updates.commit(preview.updateId, preview.draft); await entered.promise
    const second = env.updates.commit(preview.updateId, preview.draft)
    gate.resolve()
    const [a, b] = await Promise.all([first, second]); expect(a).toEqual(b)
    expect(await env.updates.commit(preview.updateId, preview.draft)).toEqual(a)
    expect(update).toHaveBeenCalledTimes(1); expect(env.service.get(initial.idea.ideaId).sourceDiscussions).toHaveLength(2)
  })

  it('H10 different tickets for the same base cannot duplicate content/source commits', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()); model(env); model(env, draft({ title: 'Second proposal' }))
    const a = await env.updates.prepare(updateRequest(initial, 'a')), b = await env.updates.prepare({ ...updateRequest(initial, 'b'), messageId: 'future-answer' })
    const results = await Promise.allSettled([env.updates.commit(a.updateId, a.draft), env.updates.commit(b.updateId, b.draft)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { code: 'version-conflict' } })
    const current = env.service.get(initial.idea.ideaId)
    expect(current.versions).toHaveLength(2); expect(current.sourceDiscussions).toHaveLength(2)
    expect(current.sourceDiscussions[1]!.anchorMessageId).toBe('answer')
  })

  it.each(['invalid-json', 'tool', 'failure'] as const)('H11 %s model output is classified, never retried or written', async kind => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    if (kind === 'tool') env.llm.enqueueChunks(toolCallStream())
    else if (kind === 'failure') env.llm.enqueueFailure(Error('controlled model failure'))
    else env.llm.enqueueChunks(textStream('not JSON'))
    expect(await codeOf(() => env.remote.prepareUpdateFromMessage(updateRequest(initial)))).toBe(kind === 'failure' ? 'idea/model-failed' : 'idea/invalid-model-output')
    expect(env.llm.calls).toHaveLength(1); expect(env.service.get(initial.idea.ideaId)).toEqual(initial)
  })

  it('H12 cancellation before and during read prevents dispatch; late read does not register', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()), before = new AbortController()
    before.abort()
    await expect(env.updates.prepare(updateRequest(initial), before.signal)).rejects.toMatchObject({ code: 'request-cancelled' })
    const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), abort = new AbortController()
    const original = env.sessionQuery.readSurface.bind(env.sessionQuery)
    vi.spyOn(env.sessionQuery, 'readSurface').mockImplementation(async id => { entered.resolve(); await gate.promise; return original(id) })
    const pending = env.updates.prepare(updateRequest(initial, 'during-read'), abort.signal)
    const rejected = expect(pending).rejects.toMatchObject({ code: 'request-cancelled' })
    await entered.promise; abort.abort(); gate.resolve(); await rejected
    await expect(env.updates.prepare(updateRequest(initial, 'during-read'))).rejects.toMatchObject({ code: 'request-cancelled' })
    expect(env.llm.calls).toHaveLength(0)
  })

  it('H13 stream receives real cancellation and an ignored late result cannot become a ticket', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), abort = new AbortController()
    env.llm.enqueueScript(async function* () { entered.resolve(); await gate.promise; yield* textStream(JSON.stringify(proposed())) })
    const pending = env.updates.prepare(updateRequest(initial), abort.signal)
    const rejected = expect(pending).rejects.toMatchObject({ code: 'request-cancelled' })
    await entered.promise; abort.abort(); expect(env.llm.calls[0]!.signal!.aborted).toBe(true)
    gate.resolve(); await rejected
    await expect(env.updates.prepare(updateRequest(initial))).rejects.toMatchObject({ code: 'request-cancelled' })
    expect(env.service.get(initial.idea.ideaId)).toEqual(initial)
  })

  it('H14 abort before commit is zero write; abort after writer admission is not a rollback', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()); model(env)
    const preview = await env.updates.prepare(updateRequest(initial)), abort = new AbortController()
    abort.abort()
    await expect(env.updates.commit(preview.updateId, preview.draft, abort.signal)).rejects.toMatchObject({ code: 'request-cancelled' })
    expect(env.service.get(initial.idea.ideaId)).toEqual(initial)
    const after = new AbortController(), gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
    const table = recordsOf(env.service), original = table.update.bind(table)
    vi.spyOn(table, 'update').mockImplementation(async (...args) => { entered.resolve(); await gate.promise; return original(...args) })
    const pending = env.updates.commit(preview.updateId, preview.draft, after.signal)
    await entered.promise; after.abort(); gate.resolve()
    expect((await pending).updated).toBe(true)
    expect(env.service.get(initial.idea.ideaId).sourceDiscussions).toHaveLength(2)
  })

  it('H15 lost acknowledgement after actual write stays uncertain and never blindly rewrites', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()); model(env)
    const preview = await env.updates.prepare(updateRequest(initial)), original = env.service.evolve.bind(env.service)
    const writer = vi.spyOn(env.service, 'evolve').mockImplementation(async (...args) => { await original(...args); throw Error('controlled lost acknowledgement') })
    expect(await codeOf(() => env.remote.commitPreparedUpdate({ updateId: preview.updateId, draft: preview.draft }))).toBe('idea/update-result-uncertain')
    expect(await codeOf(() => env.remote.commitPreparedUpdate({ updateId: preview.updateId, draft: preview.draft }))).toBe('idea/update-result-uncertain')
    expect(writer).toHaveBeenCalledTimes(1)
    expect(env.service.get(initial.idea.ideaId).sourceDiscussions).toHaveLength(2)
  })

  it('H16 invalid draft does not bind a payload; unknown/cross-kind/restarted ticket cannot write', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft()); model(env)
    const preview = await env.updates.prepare(updateRequest(initial))
    expect(await codeOf(() => env.remote.commitPreparedUpdate({ updateId: preview.updateId, draft: {} as never }))).toBe('idea/invalid-draft')
    expect(await codeOf(() => env.remote.commitPreparedUpdate({ updateId: 'prep_forged' as IdeaUpdateId, draft: preview.draft }))).toBe('idea/update-not-found')
    await env.ctx.fiber.dispose()
    const reopened = await updateHarness(env.root)
    expect(await codeOf(() => reopened.remote.commitPreparedUpdate({ updateId: preview.updateId, draft: preview.draft }))).toBe('idea/update-not-found')
    expect(reopened.service.get(initial.idea.ideaId)).toEqual(initial)
    expect(reopened.llm.calls).toHaveLength(0)
  })

  it('H17 lifecycle unload cancels pending model preparation and invalidates late work', async () => {
    const env = await updateHarness(), initial = await env.service.create(draft(), sourceDraft())
    const gate = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
    env.llm.enqueueScript(async function* () { entered.resolve(); await gate.promise; yield* textStream(JSON.stringify(proposed())) })
    const pending = env.updates.prepare(updateRequest(initial))
    const rejected = expect(pending).rejects.toMatchObject({ code: 'request-cancelled' })
    await entered.promise; await env.ctx.fiber.dispose(); gate.resolve(); await rejected
    expect(env.llm.calls[0]!.signal!.aborted).toBe(true)
  })
})
