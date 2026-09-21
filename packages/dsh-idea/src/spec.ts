/**
 * The Idea storage-domain declaration: one `ideas` table keyed by
 * {@link IdeaId}, each record the full canonical {@link IdeaAggregate} for
 * one idea (header, complete append-only version history, evolution events,
 * source-discussion snapshots), one `discussions` table keyed by
 * {@link IdeaDiscussionId}, each record one continued-discussion workspace,
 * and one `resurfacing_budgets` table keyed by conversation id, each record
 * the conversation's consumed proactive-resurfacing budget fact. One save is
 * one record put or update — the aggregate record is deliberately unsplit
 * because the current storage-domain has no cross-table transactions.
 * `per-record` layout stores one document per record, so a save rewrites
 * only that record's document. Ideas are authoritative user data: an open
 * rejects (never skips) a stored record that fails its schema. Version 2
 * reshaped versions onto nested drafts with reasons and added evolution
 * events. Version 3 restored the plural `sourceDiscussionIds` citation array
 * (version 2 had folded it to one singular field, silently dropping valid
 * provenance): version 1 and 2 records remain readable and are migrated
 * non-lossily by the record schema — the next write of a migrated idea
 * persists the version-3 form. The `discussions` table is version-2-additive
 * and `resurfacing_budgets` is version-3-additive: neither holds earlier-era
 * data and neither changes any existing record shape, so both stay inside
 * version 3 without a bump.
 * @module @dsh-external/dsh-idea/src/spec
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { ideaAggregateSchema, ideaDiscussionSchema, resurfacingBudgetSchema } from './schema.ts'
import type { IdeaAggregate, IdeaDiscussion, IdeaId, ResurfacingBudget } from './types.ts'
import type { IdeaDiscussionId } from './types.ts'

export const ideaDomainSpec = defineDomain({
  name: 'idea',
  version: 3,
  compatibleVersions: [1, 2],
  layout: 'per-record',
  tables: {
    ideas: domainTable<IdeaId, IdeaAggregate>(ideaAggregateSchema),
    discussions: domainTable<IdeaDiscussionId, IdeaDiscussion>(ideaDiscussionSchema),
    resurfacing_budgets: domainTable<string, ResurfacingBudget>(resurfacingBudgetSchema),
  },
})
