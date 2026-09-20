/**
 * The `idea.relatedFromMessage` Remote path: the result projection is
 * JSON-representable and carries only canonical re-projected Idea data;
 * absent sources, failing model calls, and caller cancellation map onto the
 * plugin wire vocabulary; empty judgments and full three-match judgments
 * succeed; and the whole read-only path writes nothing durable. All offline
 * — the LLM/session seams are scripted fakes and the storage stack is local
 * json over a temp root.
 * @module tests/remote-related.spec
 */

import { afterEach, describe, expect, it } from 'vitest'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { textStream } from './helpers/preparation.ts'
import { evolutionHarness, seedDiscussion } from './helpers/evolution.ts'
import type { EvolutionEnv } from './helpers/evolution.ts'
import { cleanup, draft, storedBytes } from './helpers/harness.ts'
import IdeaRemoteService from '../src/remote-host/index.ts'
import IdeaRelatedService from '../src/related/index.ts'
import { decodeIdeaReferenceUri } from '../src/reference/uri.ts'

afterEach(cleanup)

/** Related stack plus the mounted remote controller. */
async function remoteHarness() {
  const env = await evolutionHarness()
  env.ctx.provide('ideaPreparations', {
    preparations: { resolve: () => { throw new Error('related never resolves preparations') } },
  } as never)
  env.ctx.provide('ideaResurfacing', {
    evaluate: () => { throw new Error('related never evaluates resurfacing') },
    judge: () => { throw new Error('related never judges resurfacing') },
  } as never)
  await env.ctx.plugin(IdeaRelatedService)
  await env.ctx.plugin(IdeaRemoteService)
  return { ...env, idea: env.ctx.idea }
}

/** One extra saved Idea in the eligible corpus. */
const addIdea = async (env: EvolutionEnv, title: string): Promise<string> => {
  const created = await env.ideaService.create(draft({ title, core: `Core of ${title}` }), {
    sessionId: 'session-9',
    anchorMessageId: 'msg-9',
    startSeq: 1,
    endSeq: 2,
    capturedContext: [{ role: 'user', text: `seed for ${title}` }],
  })
  return created.idea.ideaId as string
}

const matchesText = (...matches: Array<Record<string, unknown>>): string =>
  JSON.stringify({ matches })

/** The stable code of the RemoteError a call rejects with. */
const remoteCodeOf = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run()
  } catch (error) {
    return remoteErrorOf(error)?.code
  }
  throw new Error('expected the call to reject with a RemoteError')
}

describe('idea.relatedFromMessage', () => {
  it('returns a JSON-representable, canonical-only result and writes nothing durable', async () => {
    const env = await remoteHarness()
    const { ideaId } = await seedDiscussion(env)
    const alpha = await addIdea(env, 'Alpha idea')
    const before = await storedBytes(env.root, ideaId)
    env.llm.enqueueChunks(textStream(matchesText(
      { ideaId: alpha, whyUsefulNow: 'answers the open question now' },
    )))

    const result = await env.idea.relatedFromMessage({ sessionId: 'conversation-1', messageId: 'd-a2' })

    expect(JSON.parse(JSON.stringify(result)) as unknown).toEqual(result)
    expect(Object.keys(result).sort()).toEqual(['items'])
    expect(result.items).toHaveLength(1)
    expect(Object.keys(result.items[0]!).sort()).toEqual(['idea', 'reference', 'whyUsefulNow'])
    expect(Object.keys(result.items[0]!.idea).sort())
      .toEqual(['core', 'currentVersionId', 'id', 'title', 'updatedAt'])
    expect(typeof result.items[0]!.idea.updatedAt).toBe('number')
    // Canonical re-projection: the wire carries the stored canonical fields.
    expect(result.items[0]!.idea.title).toBe('Alpha idea')
    expect(result.items[0]!.idea.core).toBe('Core of Alpha idea')
    expect(result.items[0]!.whyUsefulNow).toBe('answers the open question now')
    // The Host owns the reference: it pins the exact current version.
    const reference = result.items[0]!.reference
    expect(reference).toEqual({
      ideaId: alpha,
      versionId: result.items[0]!.idea.currentVersionId,
      label: 'Alpha idea',
      mention: reference.mention,
    })
    expect(reference.mention.startsWith(`@[Alpha idea](dsh-idea:`)).toBe(true)
    expect(decodeIdeaReferenceUri(reference.mention.slice('@[Alpha idea]('.length, -1)))
      .toEqual({ ideaId: alpha, versionId: reference.versionId })
    // No aggregate internals leak onto the wire.
    const wire = JSON.stringify(result)
    expect(wire).not.toContain(ideaId)
    expect(wire).not.toContain('versions')
    expect(wire).not.toContain('sourceDiscussions')
    expect(wire).not.toContain('evolutionEvents')
    expect(await storedBytes(env.root, ideaId)).toEqual(before)
  })

  it('rejects a judgment carrying model-supplied extra fields as invalid-model-output', async () => {
    const env = await remoteHarness()
    await seedDiscussion(env)
    const alpha = await addIdea(env, 'Alpha idea')
    env.llm.enqueueChunks(textStream(matchesText(
      { ideaId: alpha, whyUsefulNow: 'x', title: 'HACKED', confidence: 0.9 },
    )))

    expect(await remoteCodeOf(() => env.idea.relatedFromMessage({ sessionId: 'conversation-1', messageId: 'd-a2' })))
      .toBe('idea/invalid-model-output')
  })

  it('maps an absent session onto idea/source-not-found without any model call', async () => {
    const env = await remoteHarness()
    expect(await remoteCodeOf(() => env.idea.relatedFromMessage({ sessionId: 'session-absent', messageId: 'a1' })))
      .toBe('idea/source-not-found')
    expect(env.llm.calls).toHaveLength(0)
  })

  it('maps a failing model call onto idea/model-failed', async () => {
    const env = await remoteHarness()
    await seedDiscussion(env)
    await addIdea(env, 'Failing idea')
    env.llm.enqueueFailure(new Error('transport reset'))

    expect(await remoteCodeOf(() => env.idea.relatedFromMessage({ sessionId: 'conversation-1', messageId: 'd-a2' })))
      .toBe('idea/model-failed')
  })

  it('maps caller cancellation onto gateway/cancelled', async () => {
    const env = await remoteHarness()
    await seedDiscussion(env)
    await addIdea(env, 'Cancelled idea')
    const controller = new AbortController()
    controller.abort()

    expect(await remoteCodeOf(() =>
      env.idea.relatedFromMessage({ sessionId: 'conversation-1', messageId: 'd-a2' }, controller.signal)))
      .toBe('gateway/cancelled')
    expect(env.llm.calls).toHaveLength(0)
  })

  it('succeeds with zero items on a zero-match judgment', async () => {
    const env = await remoteHarness()
    await seedDiscussion(env)
    await addIdea(env, 'Unmatched idea')
    env.llm.enqueueChunks(textStream(matchesText()))

    const result = await env.idea.relatedFromMessage({ sessionId: 'conversation-1', messageId: 'd-a2' })
    expect(result).toEqual({ items: [] })
    expect(env.llm.calls).toHaveLength(1)
  })

  it('carries a full three-match judgment in model order', async () => {
    const env = await remoteHarness()
    await seedDiscussion(env)
    const one = await addIdea(env, 'One idea')
    const two = await addIdea(env, 'Two idea')
    const three = await addIdea(env, 'Three idea')
    env.llm.enqueueChunks(textStream(matchesText(
      { ideaId: three, whyUsefulNow: 'c' },
      { ideaId: two, whyUsefulNow: 'b' },
      { ideaId: one, whyUsefulNow: 'a' },
    )))

    const result = await env.idea.relatedFromMessage({ sessionId: 'conversation-1', messageId: 'd-a2' })
    expect(result.items.map(item => item.idea.id)).toEqual([three, two, one])
  })

  it('delegates the carrier signal to the judgment call', async () => {
    const env = await remoteHarness()
    await seedDiscussion(env)
    const extra = await addIdea(env, 'Signalled idea')
    env.llm.enqueueChunks(textStream(matchesText({ ideaId: extra, whyUsefulNow: 'now' })))
    const controller = new AbortController()

    await env.idea.relatedFromMessage({ sessionId: 'conversation-1', messageId: 'd-a2' }, controller.signal)

    expect(env.llm.calls[0]?.signal).toBe(controller.signal)
  })
})
