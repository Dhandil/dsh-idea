/**
 * The Idea storage-domain declaration: one `ideas` table keyed by
 * {@link IdeaId}, each record the full canonical {@link IdeaAggregate} for
 * one idea (header, complete linear version history, source-discussion
 * snapshots). One save is one record put or update — the aggregate record is
 * deliberately unsplit because the current storage-domain has no cross-table
 * transactions. `per-record` layout stores one document per idea, so a save
 * rewrites only that idea's document. Ideas are authoritative user data: an
 * open rejects (never skips) a stored record that fails its schema.
 * @module @dsh-external/dsh-idea/src/spec
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { ideaAggregateSchema } from './schema.ts'
import type { IdeaAggregate, IdeaId } from './types.ts'

export const ideaDomainSpec = defineDomain({
  name: 'idea',
  version: 1,
  layout: 'per-record',
  tables: { ideas: domainTable<IdeaId, IdeaAggregate>(ideaAggregateSchema) },
})
