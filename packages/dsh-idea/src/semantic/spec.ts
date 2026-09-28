/**
 * The `idea_semantic` storage-domain declaration: one disposable derived
 * domain holding a single `embeddings` table keyed by `ideaId`, at most one
 * current record per Idea. `per-record` layout stores each embedding as its
 * own document so a rebuild rewrites only that record, and
 * `backup-and-skip` makes a stored record that fails its schema move aside
 * instead of blocking the open — this domain is a cache, never business
 * truth, and deleting it in full must leave Ideas, T9, and every T10
 * behavior untouched. Version 1 is brand new: no earlier format exists.
 * @module @dsh-external/dsh-idea/src/semantic/spec
 */

import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { semanticEmbeddingRecordSchema } from './schema.ts'
import type { SemanticEmbeddingRecord } from './types.ts'
import type { IdeaId } from '../types.ts'

export const ideaSemanticDomainSpec = defineDomain({
  name: 'idea_semantic',
  version: 1,
  compatibleVersions: [],
  layout: 'per-record',
  invalidRecords: 'backup-and-skip',
  tables: {
    embeddings: domainTable<IdeaId, SemanticEmbeddingRecord>(semanticEmbeddingRecordSchema),
  },
})
