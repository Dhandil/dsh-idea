# DSH Idea T11 — Semantic / Hybrid Idea Retrieval Architecture Freeze

**Status:** FROZEN — Clarification Amendment 1 + T10 Persistence Baseline Sync  
**Task:** T11 — Semantic / Hybrid Idea Retrieval  
**Repository baseline:** `f972c962f1e093536b39e538095874ebbe1969e4`  
**Pre-T11 tested executable:** `4c38e2b38cb7167be0af62f309cdb8817347846d`  
**Harness baseline:** `ddefc45fbc7f8e46dd73185e68295696d1297887` (`dsh-v0.1.6-alpha.2`)  
**Idea source-of-truth domain:** `idea/v3`  
**Semantic derived domain:** `idea_semantic/v1`  
**Pre-T11 Canonical Full:** `41 files / 625 tests`  
**T10 Persistence Repair:** `ACCEPTED`  
**Preflight result:** `PASS_WITH_REQUIRED_REVISIONS`

This document supersedes the earlier T11 architecture freeze by integrating Clarification Amendment 1 and synchronizing the accepted T10 Persistence Repair baseline. T11's product goal and semantic-retrieval architecture are unchanged; the durable per-conversation resurfacing-budget gate is now an accepted prerequisite that T11 must preserve.

---

## 1. Product Goal

T11 adds semantic recall to T10 candidate generation so a historical Idea can be retrieved even when the current wording shares few or no lexical terms with the saved Idea.

T11 answers only:

> Which historical Ideas are worth entering the candidate pool?

T11 does **not** decide whether the conversation still has durable resurfacing budget, whether now is an opportunity to resurface, whether a candidate should finally be shown, how the suggestion is rendered, or whether an Idea is automatically attached to model context. Those remain accepted T10/T9 responsibilities.

---

## 2. Primary Consumer

T11 V1 serves only `T10 Contextual Resurfacing`.

It does not modify T9 Search, T9 Related Ideas, or T9 Reference.

---

## 3. Frozen Pipeline

```text
controller created / reconnected
        ↓
load durable T10 resurfacing budget
        │
        ├── consumed / loading / failed
        │      ↓
        │    SILENT
        │
        └── free
               ↓
      turn/end(completed)
               ↓
      T10 Opportunity Detector
               ↓
        ┌──────────────────────┐
        │                      │
        ▼                      ▼
T10 lexical              T11 semantic
evaluation               query embedding
        │                      │
        │                 exact vector scan
        │                      │
        └──────────┬───────────┘
                   ▼
                 RRF
                   ↓
        canonical/runtime gates
                   ↓
              T10 Judge
                   ↓
        existing Final Delivery Gate
                   ↓
   Host durable resurfacing-budget claim
        │
        ├── CLAIMED
        │      ↓
        │   existing resurfacing UI
        │
        └── ALREADY_CONSUMED / failure
               ↓
             SILENT
```

T10 trigger semantics do not move earlier to `user/message`.

T11 must never bypass, weaken, reorder, or duplicate the accepted durable budget read/claim path.

---

## 4. Source of Truth and Derived Storage

Business truth remains `idea/v3`.

The accepted T10 baseline already includes the additive durable table:

```text
idea/v3
├─ ideas
├─ discussions
└─ resurfacing_budgets
```

`resurfacing_budgets` remains authoritative for the one-surface-per-conversation budget and is not semantic-index data.

T11 introduces a separate derived domain:

```text
name: idea_semantic
version: 1
layout: per-record
invalidRecords: backup-and-skip

table:
embeddings
```

The name uses `_`, not `-`, because Harness domain names must satisfy `^[a-z][a-z0-9_]*$`.

`idea/v4` is not required.

Semantic data is disposable derived retrieval data. Deleting `idea_semantic/v1` must not damage Ideas, any T9/T10 lexical behavior, or the accepted durable T10 resurfacing budget.

---

## 5. Semantic Record Identity

Each Idea has at most one current semantic record. Table key is `ideaId`.

```text
SemanticEmbeddingRecord {
    ideaId
    versionId
    embeddingProfileId
    documentVersion
    contentHash
    dimensions
    vector
    createdAt
}
```

Embedding identity is bound to the exact current `IdeaVersion`, not to a naked Idea. Historical versions are never independent semantic candidates.

`evaluatedVersionId` returned by semantic retrieval is the exact `versionId` from the semantic record that was actually evaluated.

---

## 6. Deterministic Semantic Document

Embedding input is a deterministic projection of the current IdeaVersion:

```text
Title
Core
Motivation
Current Conclusion
Possible Value
Use When
Open Questions
```

No LLM summarization is permitted before embedding.

The semantic domain does not persist a second copy of the full semantic document. It persists only `contentHash`, vector, and identity/profile metadata.

Frozen `documentVersion = 1`.

`contentHash` is SHA-256 over the exact deterministic document representation.

---

## 7. Embedding Profile

Vector compatibility is determined by:

```text
adapter
canonicalBaseURL
model
expectedDimensions
documentVersion
normalizationVersion
```

`embeddingProfileId` is derived deterministically from those values.

It does not include API key, `apiKeyEnv`, timeout, or batch size.

Vectors from different profiles must never be compared.

T11 V1 configuration is static for the service lifetime. Hot reload is out of scope.

---

## 8. Provider Architecture

Harness `0.1.6-alpha.2` has no verified public generic embedding service.

T11 therefore owns:

```text
IdeaEmbeddingProvider
        ↓
OpenAICompatibleEmbeddingProvider
```

V1 uses `POST <baseURL>/embeddings`.

No Harness modification is allowed. No generic Harness embedding seam is introduced by T11.

---

## 9. Configuration

Semantic retrieval is default-off.

```text
enabled
baseURL
model
apiKeyEnv
expectedDimensions
timeoutMs
batchSize
```

Default:

```text
enabled = false
apiKeyEnv = DSH_IDEA_EMBEDDING_API_KEY
```

Do not automatically reuse `DEEPSEEK_API_KEY`.

When disabled:

```text
0 embedding provider calls
0 semantic backfill calls
existing T10 behavior unchanged
```

No Settings UI or hot reload in T11 V1.

---

## 10. Credential Boundary

Use:

```text
credentialRef(...)
ctx.credentials.resolve(...)
```

The embedding API key must never be persisted in `idea/v3`, `idea_semantic/v1`, session history, or resurfacing state.

Do not make direct environment access the authoritative T11 credential path.

---

## 11. Vector Validation and Normalization

Provider output must be rejected unless:

```text
response count == request count
indices are unique and complete
vector length == expectedDimensions
all values are finite
norm > 0
```

Vectors and query vectors are L2-normalized.

Similarity is the dot product of normalized vectors, equivalent to cosine similarity.

No Vector DB or ANN index is introduced in T11 V1.

The physical serialization of `vector` is an implementation detail, provided schema validation and rebuildability are preserved.

---

## 12. Exact Vector Scan

T11 V1 uses persistent embedding records plus in-process exact scan.

No `pgvector`, Qdrant, Milvus, Pinecone, FAISS, sqlite-vss, or sqlite-vec.

---

## 13. Index Maintenance

T11 does not modify authoritative Idea write paths to make them await embedding.

Instead:

```text
Idea durable write
        ↓
domain/changed
        ↓
enqueue ideaId
```

Index maintenance uses event-driven updates plus startup reconciliation.

No periodic polling daemon is allowed.

The `domain/changed` callback remains synchronous and only enqueues identity. It must not perform provider I/O.

The event is an acceleration path, not durable truth.

---

## 14. Pending Work Semantics — Clarification Amendment 1

T11 does **not** use a fixed-capacity FIFO queue.

The pending structure is a coalescing identity map/set:

```text
Map<IdeaId, PendingIdentity>
```

or an equivalent structure with the same semantics.

Rules:

```text
one pending identity per ideaId
repeated changes coalesce
worker re-reads canonical current state at execution time
no drop-oldest policy
no drop-newest policy
no business-write blocking
```

Example:

```text
Idea A v1 queued
Idea A evolves to v2
Idea A evolves to v3

pending:
A
```

When A is processed, the worker reads the then-current canonical Idea and indexes v3.

The pending set is bounded by the number of distinct Ideas, not by the number of domain-change events.

---

## 15. Missed-Event / Crash Recovery — Clarification Amendment 1

`domain/changed` is not a durable event log.

If an event is missed, the process crashes, provider work fails, or pending semantic work disappears, the semantic record may remain missing/stale.

Recovery is:

```text
next plugin startup
        ↓
startup reconciliation
        ↓
compare idea/v3 current state against idea_semantic/v1
        ↓
enqueue missing/stale Ideas
```

T11 V1 explicitly does **not** add:

```text
periodic polling
query-time lazy reconciliation
background conversation scanning
durable indexing event log
T10 budget redesign
T10 budget cleanup
```

During the stale window, lexical T10 remains fully available.

Therefore the semantic index is:

> eventually repairable, not continuously guaranteed up-to-date.

---

## 16. Worker Model

V1 worker semantics:

```text
concurrency = 1
coalescing by ideaId
batch provider calls where appropriate
```

Startup reconciliation scans canonical current active Ideas, but external provider work proceeds asynchronously and does not block plugin readiness.

Provider failure does not retry forever, block Idea writes, poison the worker, or make lexical T10 unavailable.

A later Idea change or future startup reconciliation is sufficient recovery for V1.

No separate rate-limiter, scheduler, or retry daemon is required by the architecture.

---

## 17. Lifecycle Semantics

Create:

```text
Idea durable commit succeeds
→ enqueue current Idea identity
```

Manual Edit / Evolve:

```text
new current version committed
→ old semantic record becomes ineligible immediately
→ enqueue Idea identity
```

Archive: no embedding rebuild is required; canonical validation excludes archived Ideas.

Restore: reuse an existing semantic record only if version/profile/hash still match.

Delete: best-effort semantic-record deletion is allowed; orphan records remain harmless because canonical validation rejects them.

---

## 18. Stale Async Result Guard

Immediately before persistence, re-read canonical state.

Write only if:

```text
Idea still exists
Idea status is active
currentVersionId == requestedVersionId
current deterministic contentHash == requestedContentHash
active embeddingProfileId == requestedProfileId
```

Otherwise `DROP RESULT`.

A late old-version vector must never become current semantic state.

---

## 19. Query Document — Clarification Amendment 1

T11 semantic query construction reuses the **existing T10 bounded visible context contract**.

Frozen bounds:

```text
Current triggering user turn:
≤ 2000 characters

Recent visible context:
≤ 6 prior visible messages
roles = user | assistant

Per-message / aggregate bounding:
reuse existing T10 extractTurnContext / resurfacing constants
```

The query contains the current triggering user turn plus bounded recent visible context.

The query does **not** contain the triggering Assistant reply.

Prior Assistant messages may be present when they are part of the existing bounded recent visible context.

The triggering Assistant reply remains input only to the existing T10 Judge.

Do not introduce an independent 8k/4-message query-context policy in T11.

---

## 20. Opportunity Detector

The T10 deterministic Opportunity Detector remains unchanged and never reads the Idea corpus or vectors.

It is reached only after the accepted durable T10 budget state is known to be `free`.

If budget state is `loading`, `failed`, or `consumed`:

```text
0 Opportunity Detector evaluation
0 lexical retrieval
0 semantic query embedding calls
0 Judge calls
```

If the detector itself rejects:

```text
0 semantic query embedding calls
0 Judge calls
```

---

## 21. T10 Evaluate Contract

Existing `idea/evaluateResurfacing` remains deterministic, zero-model, and zero-provider-network.

Embedding I/O must not be inserted into this Remote.

T11 adds a separate cancellable semantic-candidate Remote.

The accepted T10 persistence Remotes remain independent and unchanged:

```text
idea/getResurfacingBudget
idea/claimResurfacingBudget
```

---

## 22. Semantic Candidate Output

The browser never receives raw vectors.

Semantic candidate output contains only the canonical projection needed for fusion/Judge:

```text
ideaId
evaluatedVersionId
title
core
possibleValue
useWhen
currentConclusion
semanticRank
```

No raw vector, hash, credential, or provider payload crosses the Remote boundary.

---

## 23. Candidate Canonical Validation — Clarification Amendment 1

Each semantic candidate is independently validated against canonical `idea/v3`.

At minimum reject when:

```text
Idea missing
Idea status != active
record.versionId != Idea.currentVersionId
record.embeddingProfileId != active profile
record.contentHash != current deterministic contentHash
current discussion descends from candidate Idea
Idea was created in current conversation
```

Rules:

```text
one stale candidate
→ DROP THAT CANDIDATE

one stale candidate
≠ fail whole semantic retrieval
```

No stale record is silently remapped from an old version to a newer version.

`evaluatedVersionId` remains the exact indexed version identity that was actually evaluated.

---

## 24. Hybrid Merge

Do not combine raw lexical and cosine scores.

Frozen V1:

```text
semantic topK = 12
RRF_K = 60
dedupe key = ideaId + evaluatedVersionId
Judge pool max = 3
```

Conceptually:

```text
RRF =
(lexicalRank ? 1/(60+lexicalRank) : 0)
+
(semanticRank ? 1/(60+semanticRank) : 0)
```

No global cross-model cosine threshold.

Deterministic ties preserve an existing lexical candidate first when otherwise exactly tied, followed by stable rank/identity ordering.

---

## 25. Downstream T10 Equivalence — Clarification Amendment 1

After RRF fusion, candidate source is no longer product-visible.

A candidate from lexical only, semantic only, or both branches enters the same existing T10 downstream pipeline.

The T10 Judge input structure remains unchanged from T10 V1.

The Judge must not receive:

```text
semantic score
cosine similarity
RRF score
candidate source label
embedding metadata
```

After fusion:

```text
existing runtime suppression
→ existing Judge
→ existing Final Delivery Gate
→ existing Host claimResurfacingBudget
→ CLAIMED only
→ existing suggestion UI
→ existing dismiss behavior
→ existing explicit T9 Reference path
```

T11 does not own or fork budget, surface, dismiss, reference, or delivery behavior.

---

## 26. Failure Semantics

Semantic failure degrades to existing lexical T10 behavior.

Examples:

```text
missing credential
provider unavailable
timeout
429
invalid response
invalid vector
partial semantic index
```

Result:

```text
semantic branch unavailable
→ lexical retrieval continues
```

No user-facing resurfacing error/toast is required.

T11 V1 does not require provider retry/backoff machinery.

The accepted T10 durable-budget read/claim failures retain their existing fail-closed semantics and are never converted into semantic fallback behavior.

---

## 27. Partial Coverage

Partial semantic coverage is valid.

Indexed Ideas may be searched while missing/stale Ideas remain recoverable through lexical retrieval.

Partial semantic coverage is not user-facing.

Secret-free internal diagnostics may report bounded counts such as `valid`, `missing`, and `stale`, but T11 does not introduce a metrics/telemetry/UI subsystem.

---

## 28. Cancellation

The new semantic Remote accepts `signal?: AbortSignal`.

The client may extend its structural input face to the already-public `getSnapshot()` + `subscribe()` contract.

Use a per-evaluation AbortController.

Abort semantic work when:

```text
new human user message arrives
composer draftRev changes
controller is disposed
```

Late results remain subject to stale-result checks.

Cancellation does not replace correctness revalidation.

---

## 29. T10 Trigger Timing

Do not move retrieval ahead of `turn/end(completed)` and do not move it ahead of the durable budget-free gate.

Frozen timing:

```text
durable budget == free
→ turn/end(completed)
→ opportunity detection
→ lexical + semantic retrieval
→ hybrid merge
→ Judge
→ Final Delivery Gate
→ durable Host budget claim
→ surface only on CLAIMED
```

Changing the trigger to `user/message` is out of scope.

---

## 30. Frozen T9/T10 Boundaries

T11 must not change:

```text
T9 Search product behavior
T9 Related Ideas behavior
T9 Reference admission
T9 exact-version references
T9 Continue Discussion

T10 resurfacing_budgets schema/authority
T10 read-before-evaluate durable budget gate
T10 fail-closed loading/read-failure behavior
T10 per-conversation Host atomic claim
T10 claim-after-Final-Delivery-Gate ordering
T10 claim-before-UI ordering
T10 CLAIMED-only surface behavior
T10 no-cleanup-on-session/disposed rule
T10 no-cleanup-on-api-session/removed rule

T10 Opportunity Detector
T10 deterministic lexical evaluateResurfacing contract
T10 Semantic Judge contract
T10 Judge candidate input structure
T10 resurfacing UI
T10 default silence
T10 existing dismiss/reference flow
T10 explicit-reference-only behavior
```

Semantic recall never means automatic context injection.

---

## 31. Accepted T10 Persistence Baseline

T10 Persistence Repair is accepted at the T11 starting baseline.

Accepted invariant:

```text
idea/v3.resurfacing_budgets
key = SessionId / conversationId
value = { surfaceBudgetConsumed: true }

controller:
read-before-evaluate; loading/read-failure/consumed => silent

surface path:
Final Delivery Gate
→ Host per-conversation atomic claim
→ CLAIMED only may publish UI

cleanup:
none in V1
never delete on session/disposed or api-session/removed
```

T11 must preserve this invariant and must not redesign, duplicate, migrate, or clean up the budget state.

---

## 32. Explicit Non-Goals

T11 does not implement:

```text
Vector DB / ANN
Idea Graph
automatic Save
automatic Reference
automatic Continue Discussion
semantic T9 Search
semantic T9 Related Ideas
feedback learning
dismiss-based ranking
cross-conversation behavioral personalization
learned ranking
PAH integration
full conversation embeddings
historical-version semantic retrieval
resurfacing analytics dashboard
generic Harness embedding infrastructure
periodic semantic reconciliation
query-time semantic index repair
durable indexing event log
T10 budget redesign
T10 budget cleanup
```

---

## 33. Repository Preflight Outcome

```text
T11_REPOSITORY_PREFLIGHT
RESULT=PASS_WITH_REQUIRED_REVISIONS

BASELINE_SYNCED_AFTER_T10_PERSISTENCE_REPAIR=YES

DSH_IDEA_ACCEPTED_HEAD=
f972c962f1e093536b39e538095874ebbe1969e4

DSH_IDEA_TESTED_EXECUTABLE=
4c38e2b38cb7167be0af62f309cdb8817347846d

PRE_T11_CANONICAL_FULL=
41 files / 625 tests

T10_PERSISTENCE_REPAIR=
ACCEPTED_AND_REQUIRED_INVARIANT

SECOND_STORAGE_DOMAIN=SUPPORTED
SEMANTIC_DOMAIN=idea_semantic/v1
IDEA_V4_REQUIRED=NO

DERIVED_DATA_POLICY=SUPPORTED
INVALID_RECORD_BACKUP_AND_SKIP=SUPPORTED

VECTOR_DATABASE_REQUIRED=NO
IN_PROCESS_EXACT_SCAN=SUPPORTED

HARNESS_EMBEDDING_SEAM=ABSENT
PLUGIN_OWNED_EMBEDDING_PROVIDER=REQUIRED

CREDENTIAL_SEAM=ctx.credentials
CREDENTIALS_BASE_PROFILE=AVAILABLE

INDEX_TRIGGER=domain/changed + startup reconciliation
INDEX_PENDING_MODEL=coalescing per-Idea identity
EVENT_LOSS_RECOVERY=next startup reconciliation
PERIODIC_RECONCILIATION=NO
QUERY_TIME_RECONCILIATION=NO

IDEA_SERVICE_WRITE_PATH_CHANGES=NOT_REQUIRED

T10_BUDGET_GATE_BEFORE_EVALUATION=PRESERVE
T10_BUDGET_CLAIM_AFTER_FINAL_GATE=PRESERVE
T10_SURFACE_ONLY_ON_CLAIMED=PRESERVE
T10_BUDGET_CLEANUP_CHANGE=NO

T10_TRIGGER_CHANGE=NO
SEMANTIC_START_POINT=after durable-budget-free + existing turn/end opportunity detection

QUERY_CONTEXT=existing T10 bounded visible context
TRIGGERING_ASSISTANT_REPLY_IN_QUERY=NO

T10_EVALUATE_RESURFACING_CHANGED=NO
NEW_SEMANTIC_REMOTE=YES
REMOTE_CANCELLABLE=YES

STALE_CANDIDATE_FAILURE_SCOPE=individual candidate only
EVALUATED_VERSION_IDENTITY=exact indexed semantic record version

JUDGE_INPUT_STRUCTURE_CHANGED=NO
DOWNSTREAM_T10_FLOW_CHANGED=NO

COMPOSER_CANCEL_SEAM=VERIFIED via SnapshotStore.subscribe

T9_SEARCH_CHANGED=NO
T9_RELATED_CHANGED=NO
T9_REFERENCE_CHANGED=NO
T10_JUDGE_CHANGED=NO
T10_UI_CHANGED=NO
T10_PERSISTENCE_CHANGED=NO

HARNESS_CHANGE_REQUIRED=NO
```

---

## 34. Frozen Baseline

```text
DSH_IDEA_T11_ARCHITECTURE_FROZEN
CLARIFICATION_AMENDMENT=1
T10_PERSISTENCE_BASELINE_SYNC=1

DSH_IDEA_BASELINE=
f972c962f1e093536b39e538095874ebbe1969e4

DSH_IDEA_TESTED_EXECUTABLE=
4c38e2b38cb7167be0af62f309cdb8817347846d

HARNESS_BASELINE=
ddefc45fbc7f8e46dd73185e68295696d1297887

HARNESS_VERSION=
0.1.6-alpha.2

IDEA_DOMAIN=
idea/v3

SEMANTIC_DOMAIN=
idea_semantic/v1

PRE_T11_CANONICAL_FULL=
41 files / 625 tests
```

Any implementation requiring a change to these frozen decisions must stop and return for architecture review instead of silently redesigning T11.
