/**
 * Hybrid rank fusion (T11): a pure deterministic Reciprocal Rank Fusion of
 * the lexical branch's existing order and the semantic branch's rank order.
 * Only ranks fuse — the raw lexical score and the raw similarity are never
 * numerically combined, and after fusion a candidate's origin is no longer
 * part of product behavior. Identity is `ideaId + evaluatedVersionId`, so a
 * candidate present in both branches receives both contributions exactly
 * once.
 * @module @dsh-external/dsh-idea/src/resurfacing/hybrid
 */

/** Frozen RRF damping constant. */
export const RRF_K = 60

/** Frozen maximum size of the pool sent onward to the unchanged T10 Judge. */
export const FINAL_JUDGE_POOL_LIMIT = 3

/** The minimal identity one branch contributes to the fusion. */
export interface HybridRankInput {
  ideaId: string
  evaluatedVersionId: string
}

/** One fused candidate with its rank bookkeeping (diagnostic, not product). */
export interface HybridFusedEntry {
  ideaId: string
  evaluatedVersionId: string
  fusedScore: number
  presentInLexical: boolean
  presentInSemantic: boolean
  lexicalRank?: number
  semanticRank?: number
  /** The candidate's best (lowest) 1-based branch rank. */
  bestBranchRank: number
}

const identityKey = (candidate: HybridRankInput): string =>
  `${candidate.ideaId}\x00${candidate.evaluatedVersionId}`

/**
 * Fuse the two branch orderings. Lexical input arrives in its existing
 * order (its ranks are positional); semantic input arrives in semantic rank
 * order. Ordering of the fused pool: fused score DESC, then — on an exact
 * tie — lexical-present candidates first, then best branch rank ASC, then
 * stable ideaId ASC, then stable evaluatedVersionId ASC. No cap is applied
 * here; callers apply {@link FINAL_JUDGE_POOL_LIMIT} with their own
 * suppression step in between.
 */
export function fuseHybridCandidates(
  lexical: readonly HybridRankInput[],
  semantic: readonly HybridRankInput[],
): HybridFusedEntry[] {
  const fused = new Map<string, HybridFusedEntry>()
  const contribution = (rank: number): number => 1 / (RRF_K + rank)
  lexical.forEach((candidate, index) => {
    const rank = index + 1
    const key = identityKey(candidate)
    const entry = fused.get(key) ?? {
      ideaId: candidate.ideaId,
      evaluatedVersionId: candidate.evaluatedVersionId,
      fusedScore: 0,
      presentInLexical: false,
      presentInSemantic: false,
      bestBranchRank: Number.MAX_SAFE_INTEGER,
    }
    entry.fusedScore += contribution(rank)
    entry.presentInLexical = true
    entry.lexicalRank = rank
    entry.bestBranchRank = Math.min(entry.bestBranchRank, rank)
    fused.set(key, entry)
  })
  semantic.forEach((candidate, index) => {
    const rank = index + 1
    const key = identityKey(candidate)
    const entry = fused.get(key) ?? {
      ideaId: candidate.ideaId,
      evaluatedVersionId: candidate.evaluatedVersionId,
      fusedScore: 0,
      presentInLexical: false,
      presentInSemantic: false,
      bestBranchRank: Number.MAX_SAFE_INTEGER,
    }
    entry.fusedScore += contribution(rank)
    entry.presentInSemantic = true
    entry.semanticRank = rank
    entry.bestBranchRank = Math.min(entry.bestBranchRank, rank)
    fused.set(key, entry)
  })
  return [...fused.values()].sort((left, right) =>
    right.fusedScore - left.fusedScore
    || (left.presentInLexical === right.presentInLexical ? 0 : left.presentInLexical ? -1 : 1)
    || left.bestBranchRank - right.bestBranchRank
    || (left.ideaId < right.ideaId ? -1 : left.ideaId > right.ideaId ? 1 : 0)
    || (left.evaluatedVersionId < right.evaluatedVersionId ? -1 : left.evaluatedVersionId > right.evaluatedVersionId ? 1 : 0))
}
