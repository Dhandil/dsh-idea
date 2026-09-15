/**
 * Test harness for the Idea domain: boots the real storage stack — storage
 * hub, json backend over a temp root, storage-domain form — plus the
 * IdeaService, exactly the way an external package mounts them. Every context
 * and temp root is tracked and torn down by {@link cleanup}; a harness may be
 * reopened over the same root to prove persistence across a full dispose.
 * @module tests/helpers/harness
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply,
  Config as storageJsonConfig,
  inject as storageJsonInject,
  name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply,
  Config as storageDomainConfig,
  inject as storageDomainInject,
  name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import IdeaService from '../../src/index.ts'
import { ideaAggregateSchema } from '../../src/schema.ts'
import type { IdeaAggregate, IdeaDraft, SourceDiscussionDraft } from '../../src/types.ts'

const contexts: Context[] = []
const roots: string[] = []

/** Boot one Idea service over a real json-backed storage stack. */
export async function harness(root?: string): Promise<{
  ctx: Context
  root: string
  service: IdeaService
}> {
  const created = root ?? await mkdtemp(join(tmpdir(), 'dsh-idea-'))
  roots.push(created)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(
    { name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig },
    { root: created },
  )
  await ctx.plugin(
    {
      name: storageDomainName,
      inject: storageDomainInject,
      apply: storageDomainApply,
      Config: storageDomainConfig,
    },
    { backend: 'json' },
  )
  await ctx.plugin(IdeaService)
  return { ctx, root: created, service: ctx.ideaService }
}

/** Dispose every tracked context, then remove every tracked temp root. */
export async function cleanup(): Promise<void> {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all([...new Set(roots.splice(0))].map(root =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))
}

/** The stored per-record document path for one idea under a backend root. */
export const ideaRecordPath = (root: string, ideaId: string): string =>
  join(root, 'idea', 'ideas', `${ideaId}.json`)

/** The stored aggregate document for one idea (undefined = absent/unreadable). */
export async function storedAggregate(root: string, ideaId: string): Promise<IdeaAggregate | undefined> {
  try {
    const document = JSON.parse(await readFile(ideaRecordPath(root, ideaId), 'utf8')) as { record: unknown }
    return ideaAggregateSchema.parse(document.record)
  } catch {
    return undefined
  }
}

/** The raw stored bytes for one idea's document (undefined = absent). */
export async function storedBytes(root: string, ideaId: string): Promise<Buffer | undefined> {
  try {
    return await readFile(ideaRecordPath(root, ideaId))
  } catch {
    return undefined
  }
}

/** A valid Idea draft, overridable per field for rejection cases. */
export const draft = (overrides: Partial<IdeaDraft> = {}): IdeaDraft => ({
  title: 'Session-attached idea notes',
  core: 'Keep long-lived ideas attached to the conversations that produced them',
  motivation: 'Directions lose their context when detached from the discussion that shaped them',
  currentConclusion: 'Store each idea as one canonical aggregate over the storage domain',
  possibleValue: 'Ideas resurface later with their full source discussion intact',
  useWhen: ['A research session produces a reusable direction'],
  openQuestions: ['How should ideas resurface?'],
  ...overrides,
})

/** A valid source-snapshot draft, overridable per field. */
export const sourceDraft = (overrides: Partial<SourceDiscussionDraft> = {}): SourceDiscussionDraft => ({
  sessionId: 'session-1',
  anchorMessageId: 'msg-42',
  startSeq: 3,
  endSeq: 9,
  capturedContext: [
    { role: 'user', text: 'What if ideas lived next to their source conversations?' },
    { role: 'assistant', text: 'One aggregate per idea could snapshot this exchange verbatim.' },
  ],
  ...overrides,
})
