/**
 * The semantic Host service (`ctx.ideaSemantic`): one of three frozen
 * backends behind the semantic branch of hybrid resurfacing retrieval.
 * `llm` (the default) uses the current Harness Session's model route as a
 * semantic candidate selector: it lazily resolves the LLM-side services, or
 * returns empty when any is absent; the selector answers only semantic
 * relation — never usefulness-now, which stays the separate T10 Judge's job
 * — over the canonical current-version corpus, with strict output parsing
 * and per-candidate canonical revalidation after the call. `embedding` keeps
 * the accepted T11 disposable derived index over `idea_semantic/v1`:
 * indexing is a background accelerator where a synchronous identity-only
 * `domain/changed` listener coalesces Idea identities into a pending map
 * (never a FIFO queue, never built from `change.value`), and a
 * concurrency-1 worker re-reads canonical state, batches documents through
 * the provider, and re-checks canonical state again before each persist
 * (post-I/O stale guard — a late stale result is dropped, never relabeled).
 * `off` is fully inert. Every branch validates candidate-locally against
 * canonical state and degrades to an empty result on every ordinary failure
 * while preserving caller cancellation as cancellation. It never mutates
 * Ideas and never touches the durable resurfacing budget.
 * @module @dsh-external/dsh-idea/src/semantic/service
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'
import type { IdeaAggregate, IdeaVersionId } from '../types.ts'
import { IdeaId } from '../types.ts'
import { ideaDomainSpec } from '../spec.ts'
import { IdeaPreparationError } from '../preparation/errors.ts'
import { checkCancelled, extractModelText, resolveModelRoute } from '../preparation/pipeline.ts'
import { candidateOf } from '../resurfacing/candidate.ts'
import type { ResurfacingCandidate } from '../resurfacing/types.ts'
import type { IdeaSemanticResurfacingCandidate, IdeaSemanticResurfacingCandidatesRequest, IdeaSemanticResurfacingCandidatesResult } from '../remote-host/types.ts'
import { buildSemanticDocument, hashSemanticDocument, semanticContentHash } from './document.ts'
import { resolveEmbeddingProfile } from './profile.ts'
import { resolveSemanticConfig, SemanticConfig } from './config.ts'
import type { ResolvedSemanticConfig, SemanticPluginConfig } from './config.ts'
import { buildSemanticQueryText, boundSemanticQueryInput, selectSemanticTopK } from './retrieval.ts'
import type { SemanticScoredRecord } from './retrieval.ts'
import { parseSelectorIdeaIds } from './selector-parser.ts'
import { buildSelectorPrompt } from './selector-prompt.ts'
import { extractSelectorQueryFeatures, projectSelectorCandidates, selectSelectorPool } from './selector-retrieval.ts'
import { OpenAICompatibleEmbeddingProvider } from './openai-compatible.ts'
import { EmbeddingCancelledError } from './provider.ts'
import type { IdeaEmbeddingProvider } from './provider.ts'
import { dotProduct } from './vector.ts'
import { ideaSemanticDomainSpec } from './spec.ts'
import {
  IDEA_SEMANTIC_DOCUMENT_VERSION,
  SEMANTIC_ADAPTER,
  SEMANTIC_NORMALIZATION_VERSION,
} from './types.ts'
import type { ResolvedEmbeddingProfile, SemanticEmbeddingRecord } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ideaSemantic: IdeaSemanticService
  }
}

/** Bounded, secret-free diagnostics text for a thrown fault. */
function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

/** What one pending identity resolves to when the worker re-reads canonical state. */
type IndexTarget =
  | 'remove'
  | 'skip'
  | {
    ideaId: IdeaId
    versionId: IdeaVersionId
    profileId: string
    document: string
    contentHash: string
  }

/**
 * The Idea semantic service. Owns the semantic backend mode, the embedding
 * profile/provider/index when in `embedding` mode, the coalescing pending
 * map, the worker, startup reconciliation, the semantic exact-scan
 * retrieval, and the Harness-LLM selector — and nothing else: Idea business
 * writes and resurfacing-budget claims stay with their own services.
 */
export class IdeaSemanticService extends Service {
  static inject = ['ideaService', 'storageDomain']

  static Config = SemanticConfig

  private readonly config: ResolvedSemanticConfig
  private readonly profile?: ResolvedEmbeddingProfile
  private readonly provider?: IdeaEmbeddingProvider
  private embeddings?: KvTable<IdeaId, SemanticEmbeddingRecord>
  /** Coalescing pending identities: at most one entry per Idea, keyed by identity only. */
  private readonly pending = new Map<IdeaId, true>()
  /** Concurrency-1 worker tail: each drain starts after the previous settles. */
  private workerTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: SemanticPluginConfig) {
    super(ctx, 'ideaSemantic')
    this.config = resolveSemanticConfig(config ?? {})
    if (this.config.mode === 'embedding') {
      this.profile = resolveEmbeddingProfile({
        adapter: SEMANTIC_ADAPTER,
        baseURL: this.config.baseURL,
        model: this.config.model,
        expectedDimensions: this.config.expectedDimensions,
        documentVersion: IDEA_SEMANTIC_DOCUMENT_VERSION,
        normalizationVersion: SEMANTIC_NORMALIZATION_VERSION,
      })
      const profile = this.profile
      this.provider = new OpenAICompatibleEmbeddingProvider({
        canonicalBaseURL: profile.canonicalBaseURL,
        model: this.config.model,
        expectedDimensions: this.config.expectedDimensions,
        timeoutMs: this.config.timeoutMs,
        resolveApiKey: () => this.resolveApiKey(),
      })
    }
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(ideaSemanticDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'ideaSemantic.domainClose')
    this.embeddings = domain.table('embeddings')
    this.ctx.on('domain/changed', change => this.onDomainChanged(change))
    if (this.config.mode === 'embedding') this.reconcileAtStartup()
  }

  /**
   * The synchronous, identity-only change listener. It reacts only to
   * canonical `idea`/`ideas` writes (never `resurfacing_budgets`), reads
   * only `change.key`/`change.operation`, and never awaits, fetches,
   * throws, or mutates anything authoritative.
   */
  private onDomainChanged(change: DomainChanged): void {
    if (this.config.mode !== 'embedding') return
    if (change.domain !== ideaDomainSpec.name || change.table !== 'ideas') return
    this.pending.set(IdeaId(change.key), true)
    this.scheduleWorker()
  }

  /** Chain one drain onto the worker tail; at most one drain runs at a time. */
  private scheduleWorker(): void {
    if (this.pending.size === 0) return
    this.workerTail = this.workerTail.then(() => this.drainPending())
  }

  /**
   * Drain coalesced identities in batches. Ids leave the pending map when
   * their batch is dispatched; the canonical re-read inside the batch is
   * what decides what actually happens, so coalescing makes event order
   * irrelevant — the latest canonical state always wins.
   */
  private async drainPending(): Promise<void> {
    try {
      while (this.pending.size > 0) {
        const ids = [...this.pending.keys()].slice(0, this.config.batchSize)
        for (const id of ids) this.pending.delete(id)
        await this.indexBatch(ids)
      }
    } catch (error) {
      // The worker must never poison: a fault drops only its own batch's
      // work, state stays untouched, and recovery waits for a later Idea
      // change or the next startup reconciliation — never a retry daemon.
      this.ctx.logger.warn(`idea semantic indexing paused after fault: ${errorMessage(error)}`)
    }
  }

  /** Resolve, batch, and persist — with the canonical re-reads at both ends. */
  private async indexBatch(ids: readonly IdeaId[]): Promise<void> {
    const documents: string[] = []
    const targets: Extract<IndexTarget, { ideaId: IdeaId }>[] = []
    for (const ideaId of ids) {
      try {
        const target = this.resolveIndexTarget(ideaId)
        if (target === 'remove') {
          await this.removeRecord(ideaId)
          continue
        }
        if (target === 'skip') continue
        targets.push(target)
        documents.push(target.document)
      } catch {
        // Canonical state unreadable for this identity: best-effort cleanup,
        // never a failure of the batch.
        await this.removeRecord(ideaId)
      }
    }
    if (targets.length === 0) return
    let vectors: readonly number[][]
    try {
      vectors = await this.provider!.embed(documents)
    } catch (error) {
      // Provider failure: Idea and budget data untouched, diagnostics
      // bounded and secret-free, no retry — the record stays missing/stale
      // until a later change or the next startup reconciliation.
      this.ctx.logger.warn(`idea semantic indexing deferred: ${errorMessage(error)}`)
      return
    }
    for (const [index, target] of targets.entries()) {
      if (!this.canPersist(target)) continue
      const vector = vectors[index]
      if (vector === undefined) continue
      const record: SemanticEmbeddingRecord = {
        ideaId: target.ideaId,
        versionId: target.versionId,
        embeddingProfileId: this.profile!.embeddingProfileId,
        documentVersion: IDEA_SEMANTIC_DOCUMENT_VERSION,
        contentHash: target.contentHash,
        dimensions: this.config.expectedDimensions,
        vector,
        createdAt: Date.now(),
      }
      await this.embeddings!.put(target.ideaId, record)
    }
  }

  /**
   * Re-read canonical state for one pending identity before dispatching:
   * deleted → best-effort record removal; archived/dormant → no rebuild and
   * no removal (a restored Idea may reuse the surviving record); active →
   * the current version's deterministic document.
   */
  private resolveIndexTarget(ideaId: IdeaId): IndexTarget {
    let aggregate: IdeaAggregate
    try {
      aggregate = this.ctx.ideaService.get(ideaId)
    } catch {
      return 'remove'
    }
    if (aggregate === undefined) return 'remove'
    if (aggregate.idea.status !== 'active') return 'skip'
    const currentVersion = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
    if (currentVersion === undefined) return 'skip'
    const document = buildSemanticDocument(currentVersion.draft)
    return {
      ideaId,
      versionId: currentVersion.versionId,
      profileId: this.profile!.embeddingProfileId,
      document,
      contentHash: hashSemanticDocument(document),
    }
  }

  /**
   * The post-I/O stale-result guard: immediately before persisting, every
   * fact the embedding was computed against must still hold. Otherwise the
   * result is dropped — an old vector is never relabeled as the current
   * version, and a deleted Idea never gains an orphan record.
   */
  private canPersist(target: { ideaId: IdeaId; versionId: IdeaVersionId; profileId: string; contentHash: string }): boolean {
    try {
      const aggregate = this.ctx.ideaService.get(target.ideaId)
      if (aggregate === undefined || aggregate.idea.status !== 'active') return false
      if (aggregate.idea.currentVersionId !== target.versionId) return false
      if (this.profile === undefined || this.profile.embeddingProfileId !== target.profileId) return false
      const currentVersion = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
      if (currentVersion === undefined) return false
      if (semanticContentHash(currentVersion.draft) !== target.contentHash) return false
      return true
    } catch {
      return false
    }
  }

  /** Best-effort record removal; orphaned derived records are harmless. */
  private async removeRecord(ideaId: IdeaId): Promise<void> {
    try {
      await this.embeddings!.delete(ideaId)
    } catch (error) {
      this.ctx.logger.warn(`idea semantic cleanup skipped: ${errorMessage(error)}`)
    }
  }

  /**
   * Startup reconciliation (embedding mode only): enumerate active Ideas,
   * build the current document/hash, and reuse an exactly-valid record or
   * coalesce the identity into pending work. Provider work proceeds
   * asynchronously and never blocks readiness; this runs once per process —
   * there is no polling and no query-time repair.
   */
  private reconcileAtStartup(): void {
    void Promise.resolve().then(() => {
      for (const view of this.ctx.ideaService.list()) {
        if (view.idea.status !== 'active') continue
        const contentHash = semanticContentHash(view.currentVersion.draft)
        const record = this.embeddings!.get(view.idea.ideaId)
        const reusable = record !== undefined
          && record.versionId === view.idea.currentVersionId
          && record.embeddingProfileId === this.profile!.embeddingProfileId
          && record.documentVersion === IDEA_SEMANTIC_DOCUMENT_VERSION
          && record.contentHash === contentHash
        if (!reusable) this.pending.set(view.idea.ideaId, true)
      }
      this.scheduleWorker()
    }).catch(error => {
      this.ctx.logger.warn(`idea semantic reconciliation failed: ${errorMessage(error)}`)
    })
  }

  /** The verified credential seam, resolved fresh per operation. */
  private async resolveApiKey(): Promise<string | undefined> {
    const resolved = await this.ctx.credentials.resolve(credentialRef(this.config.apiKeyEnv))
    return resolved?.value
  }

  /**
   * The semantic branch of hybrid resurfacing retrieval, dispatched by the
   * frozen backend mode. Only caller cancellation propagates out of the
   * dispatcher; every ordinary failure degrades to an empty result (lexical
   * continues untouched, budget untouched).
   */
  async semanticResurfacingCandidates(
    request: IdeaSemanticResurfacingCandidatesRequest,
    signal?: AbortSignal,
  ): Promise<IdeaSemanticResurfacingCandidatesResult> {
    if (signal?.aborted) {
      if (this.config.mode === 'llm') {
        throw new IdeaPreparationError('request-cancelled', 'idea preparation was cancelled')
      }
      throw new EmbeddingCancelledError()
    }
    if (this.config.mode === 'off') return { candidates: [] }
    if (this.config.mode === 'embedding') {
      return this.semanticResurfacingViaEmbedding(request, signal)
    }
    return this.semanticResurfacingViaLlm(request, signal)
  }

  /**
   * The accepted T11 embedding branch, unchanged. Every record is validated
   * candidate-locally against canonical state before any provider work;
   * with no eligible records the operation returns empty without paying for
   * a query embedding. One bounded query embedding is requested, scanned
   * exactly against eligible vectors, and ranked deterministically.
   */
  private async semanticResurfacingViaEmbedding(
    request: IdeaSemanticResurfacingCandidatesRequest,
    signal?: AbortSignal,
  ): Promise<IdeaSemanticResurfacingCandidatesResult> {
    if (!this.profile || !this.provider || !this.embeddings) {
      return { candidates: [] }
    }

    const sessionId = request.sessionId
    const bounded = boundSemanticQueryInput(request.currentTurn, request.recentContext)
    const discussionIdeaId = this.ctx.ideaService.findDiscussionByConversationId(sessionId)?.ideaId
    const mutedIds = this.ctx.ideaService.listResurfacingMutedIds()
    const eligible: { record: SemanticEmbeddingRecord; candidate: ResurfacingCandidate }[] = []
    for (const [ideaId, record] of this.embeddings.entries()) {
      try {
        if (record.embeddingProfileId !== this.profile.embeddingProfileId) continue
        if (record.documentVersion !== IDEA_SEMANTIC_DOCUMENT_VERSION) continue
        const aggregate = this.ctx.ideaService.get(ideaId)
        if (aggregate === undefined || aggregate.idea.status !== 'active') continue
        if (aggregate.idea.currentVersionId !== record.versionId) continue
        const currentVersion = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
        if (currentVersion === undefined || semanticContentHash(currentVersion.draft) !== record.contentHash) continue
        if (discussionIdeaId !== undefined && discussionIdeaId === ideaId) continue
        if (aggregate.sourceDiscussions.some(discussion => discussion.sessionId === sessionId)) continue
        // T13.1 D6: a muted Idea never enters the eligible set — with an
        // empty eligible set no query embedding is requested at all.
        if (mutedIds.has(ideaId)) continue
        eligible.push({
          record,
          candidate: candidateOf({ idea: aggregate.idea, currentVersion }, aggregate, sessionId),
        })
      } catch {
        // Candidate-local validation: one missing or stale record drops
        // alone and never fails its siblings.
        continue
      }
    }
    if (eligible.length === 0) return { candidates: [] }

    const queryText = buildSemanticQueryText(bounded.currentTurn, bounded.recentContext)
    let queryVector: readonly number[]
    try {
      const vectors = await this.provider.embed([queryText], signal)
      queryVector = vectors[0]!
    } catch (error) {
      if (error instanceof EmbeddingCancelledError) throw error
      this.ctx.logger.warn(`idea semantic retrieval degraded: ${errorMessage(error)}`)
      return { candidates: [] }
    }

    // T13.1 R1-C: post-I/O mute revalidation — the preference may have
    // changed while the query embedding was in flight; a muted Idea never
    // enters the scored results.
    const mutedAfter = this.ctx.ideaService.listResurfacingMutedIds()
    const liveEligible = eligible.filter(entry => !mutedAfter.has(entry.record.ideaId))

    const scored: SemanticScoredRecord[] = []
    for (const { record, candidate } of liveEligible) {
      // Defensive re-validation of persisted vectors before comparison.
      if (record.dimensions !== this.profile.expectedDimensions) continue
      if (!record.vector.every(Number.isFinite)) continue
      if (!(dotProduct(record.vector, record.vector) > 0)) continue
      scored.push({
        record,
        similarity: dotProduct(queryVector, record.vector),
        updatedAt: candidate.updatedAt,
        ideaId: record.ideaId,
      })
    }
    const candidatesById = new Map(eligible.map(entry => [entry.record.ideaId, entry.candidate]))
    return {
      candidates: selectSemanticTopK(scored).map((entry, index) => {
        const candidate = candidatesById.get(entry.record.ideaId)!
        return {
          ideaId: entry.record.ideaId,
          // The exact indexed version that was scored — validated equal to
          // canonical current, never relabeled.
          evaluatedVersionId: entry.record.versionId,
          title: candidate.title,
          core: candidate.core,
          possibleValue: candidate.possibleValue,
          useWhen: candidate.useWhen,
          currentConclusion: candidate.currentConclusion,
          semanticRank: index + 1,
        }
      }),
    }
  }

  /**
   * The Harness-LLM selector branch: the canonical current-version corpus is
   * built with candidate-local exclusions, the frozen broad pool bounds the
   * selector input, and exactly one Session-model call ranks semantic
   * relatedness. Every ordinary failure — missing lazy service, unservable
   * route, stream failure, non-success finish, malformed output — degrades
   * to an empty result; only cancellation propagates.
   */
  private async semanticResurfacingViaLlm(
    request: IdeaSemanticResurfacingCandidatesRequest,
    signal?: AbortSignal,
  ): Promise<IdeaSemanticResurfacingCandidatesResult> {
    const sessionQuery = this.ctx.get('sessionQuery')
    const agentDefaultModel = this.ctx.get('agentDefaultModel')
    const llm = this.ctx.get('llm')
    if (sessionQuery === undefined || agentDefaultModel === undefined || llm === undefined) {
      return { candidates: [] }
    }

    const sessionId = request.sessionId
    const bounded = boundSemanticQueryInput(request.currentTurn, request.recentContext)
    const discussionIdeaId = this.ctx.ideaService.findDiscussionByConversationId(sessionId)?.ideaId
    const mutedIds = this.ctx.ideaService.listResurfacingMutedIds()
    const corpus: ResurfacingCandidate[] = []
    for (const view of this.ctx.ideaService.list()) {
      try {
        if (view.idea.status !== 'active') continue
        const aggregate = this.ctx.ideaService.get(view.idea.ideaId)
        if (aggregate === undefined || aggregate.idea.status !== 'active') continue
        if (discussionIdeaId !== undefined && discussionIdeaId === view.idea.ideaId) continue
        if (aggregate.sourceDiscussions.some(discussion => discussion.sessionId === sessionId)) continue
        // T13.1 D6: a muted Idea never enters the selector corpus — with an
        // empty corpus the selector call is never dispatched at all.
        if (mutedIds.has(view.idea.ideaId)) continue
        corpus.push(candidateOf(view, aggregate, sessionId))
      } catch {
        // Deleted between list and get: the Idea is gone candidate-locally.
        continue
      }
    }
    if (corpus.length === 0) return { candidates: [] }

    const features = extractSelectorQueryFeatures(
      buildSemanticQueryText(bounded.currentTurn, bounded.recentContext),
    )
    const pool = selectSelectorPool(corpus, features)
    if (pool.length === 0) return { candidates: [] }

    try {
      checkCancelled(signal)
      const route = await resolveModelRoute(sessionQuery, agentDefaultModel, sessionId, signal)
      checkCancelled(signal)
      const prompt = buildSelectorPrompt({
        currentTurn: bounded.currentTurn,
        recentContext: bounded.recentContext,
        candidates: projectSelectorCandidates(pool),
      })
      const options: GenerateOptions = {
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort !== undefined ? { reasoningEffort: ReasoningEffortId(route.reasoningEffort) } : {}),
        messages: [createUserMessage({
          content: [{ type: 'text', text: prompt.user }],
          source: { kind: 'plugin', plugin: 'dsh-idea' },
        })],
        system: prompt.system,
        sessionId: SessionId(sessionId),
        ...(signal !== undefined ? { signal } : {}),
      }
      const text = await extractModelText(llm, options, sessionId, signal)
      checkCancelled(signal)

      const selected = parseSelectorIdeaIds(text, new Set(pool.map(candidate => candidate.ideaId)))
      // T13.1 R1-C: post-I/O mute revalidation — the preference may have
      // changed while the selector call was in flight; a muted candidate
      // never reaches the Judge.
      const mutedAfter = this.ctx.ideaService.listResurfacingMutedIds()
      const filtered = this.revalidateSelectorPicks(selected, pool, sessionId)
        .filter(candidate => !mutedAfter.has(IdeaId(candidate.ideaId)))
      return { candidates: filtered }
    } catch (error) {
      if (error instanceof IdeaPreparationError && error.code === 'request-cancelled') throw error
      if (signal?.aborted) {
        throw new IdeaPreparationError('request-cancelled', 'idea preparation was cancelled', { cause: error })
      }
      this.ctx.logger.warn(`idea semantic selector degraded: ${errorMessage(error)}`)
      return { candidates: [] }
    }
  }

  /**
   * Post-selector canonical revalidation: every model-selected id is
   * re-read from canonical state and dropped individually when missing,
   * inactive, no longer on its pinned version, discussion-descendant
   * excluded, or provenance-excluded; a stale pin is never remapped to a
   * newer version, and valid siblings survive. Model order is preserved and
   * every projected field comes from canonical data.
   */
  private revalidateSelectorPicks(
    selected: readonly string[],
    pool: readonly ResurfacingCandidate[],
    sessionId: string,
  ): IdeaSemanticResurfacingCandidatesResult['candidates'] {
    const poolById = new Map(pool.map(candidate => [candidate.ideaId as string, candidate]))
    const discussionIdeaId = this.ctx.ideaService.findDiscussionByConversationId(sessionId)?.ideaId
    const candidates: IdeaSemanticResurfacingCandidate[] = []
    for (const ideaId of selected) {
      const pinned = poolById.get(ideaId)
      if (pinned === undefined) continue
      try {
        const aggregate = this.ctx.ideaService.get(IdeaId(ideaId))
        if (aggregate === undefined || aggregate.idea.status !== 'active') continue
        if (aggregate.idea.currentVersionId !== pinned.evaluatedVersionId) continue
        if (discussionIdeaId !== undefined && discussionIdeaId === aggregate.idea.ideaId) continue
        if (aggregate.sourceDiscussions.some(discussion => discussion.sessionId === sessionId)) continue
        const currentVersion = aggregate.versions.find(version => version.versionId === aggregate.idea.currentVersionId)
        if (currentVersion === undefined) continue
        candidates.push({
          ideaId: pinned.ideaId,
          evaluatedVersionId: pinned.evaluatedVersionId,
          title: currentVersion.draft.title,
          core: currentVersion.draft.core,
          possibleValue: currentVersion.draft.possibleValue,
          useWhen: [...currentVersion.draft.useWhen],
          currentConclusion: currentVersion.draft.currentConclusion,
          semanticRank: candidates.length + 1,
        })
      } catch {
        // Candidate-local revalidation: one unreadable Idea drops alone.
        continue
      }
    }
    return candidates
  }
}
