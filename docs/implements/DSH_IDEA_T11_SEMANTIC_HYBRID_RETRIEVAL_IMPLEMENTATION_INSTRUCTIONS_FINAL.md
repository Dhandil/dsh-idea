# DSH Idea T11 — Semantic / Hybrid Idea Retrieval Implementation Instructions

**Status:** FROZEN IMPLEMENTATION INSTRUCTIONS — Final Baseline Sync after T10 Persistence Repair  
**Task:** T11 — Semantic / Hybrid Idea Retrieval  
**Repository:** `D:\Harness\harness-plugin\dsh-idea`  
**Remote:** `Dhandil/dsh-idea`  
**Harness checkout:** `D:\Harness\deepseek-harness`  
**This task is T11 only. Do not enter T12.**

This document supersedes the earlier T11 Implementation Instructions. It is synchronized with:

```text
DSH_IDEA_T11_ARCHITECTURE_FROZEN
CLARIFICATION_AMENDMENT=1
T10_PERSISTENCE_BASELINE_SYNC=1
```

The accepted T10 Persistence Repair is now a mandatory preserved invariant.

The synchronization does not change T11's core architecture. It clarifies:

```text
pending work = coalescing per-Idea identity map/set
missed-event recovery = next startup reconciliation
no periodic or query-time reconciliation
query context = existing T10 bounded visible context
stale semantic candidate failure = candidate-local only
evaluatedVersionId = exact indexed version
T10 Judge input structure = unchanged
post-fusion surface/dismiss/reference = existing T10 path
```

---

## 0. Authoritative Baselines

Before changing executable code, verify:

```text
DSH_IDEA_BASELINE=
f972c962f1e093536b39e538095874ebbe1969e4

PRE_T11_TESTED_EXECUTABLE=
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

T10_PERSISTENCE_REPAIR=
ACCEPTED
```

Required repository state:

```text
git rev-parse HEAD
git rev-parse origin/main
```

must both resolve to:

```text
f972c962f1e093536b39e538095874ebbe1969e4
```

Harness must resolve to the frozen Harness baseline above and is **read-only**.

If any baseline differs unexpectedly:

```text
STOP
DSH_IDEA_T11_BASELINE_DRIFT
```

Do not hide drift with reset, clean, rebase, merge, stash, or checkout-overwrite.

Known user docs reorganization and supplied T11 architecture/instruction documents may be preserved as task-owned docs-only drift if they match the frozen inputs. No unexplained executable drift is allowed.

---

## 1. Architecture Authority

Read and obey:

```text
docs/architecture/DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_ARCHITECTURE_FREEZE.md
```

Also treat the accepted T10 persistence report as a baseline invariant:

```text
docs/report/DSH_IDEA_T10_PERSISTENCE_REPAIR_ACCEPTANCE.md
```

Core architecture:

```text
durable T10 budget read == free
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
       durable T10 budget claim
                   ↓
            CLAIMED only
                   ↓
        existing resurfacing UI
```

If implementation requires changing a frozen architecture decision, stop with:

```text
DSH_IDEA_T11_ARCHITECTURE_DECISION_REQUIRED
```

Do not silently redesign.

---

## 2. T11 Product Scope

T11 adds semantic recall only to **T10 proactive resurfacing candidate generation**.

It must improve recall for semantically related Ideas whose words differ from the current conversation.

T11 does not take ownership of:

```text
durable resurfacing budget
Opportunity detection
final resurfacing usefulness judgment
Final Delivery Gate
UI rendering
Reference attachment
Idea lifecycle
Search
Related Ideas
Continue Discussion
dismiss behavior
```

Those remain accepted T9/T10 paths.

---

## 3. Hard Non-Goals

Do not implement or alter:

```text
T9 Search semantic retrieval
T9 Related Ideas semantic retrieval
T9 Reference behavior
automatic Save
automatic Reference
automatic Continue Discussion
Idea Graph
Vector DB / ANN
feedback learning
dismiss-based ranking
learned personalization
cross-conversation behavioral ranking
historical-version semantic retrieval
full-conversation embedding
PAH integration
generic Harness embedding infrastructure
periodic semantic reconciliation
query-time semantic reconciliation
durable indexing event log
T10 resurfacing_budgets schema
T10 budget read-before-evaluate
T10 budget claim semantics
T10 per-conversation budget mutation tail
T10 claim ordering
T10 budget cleanup policy
T12 work
```

Do not modify Harness.

---

## 4. Preserve the Accepted T10 Persistence Repair

Before implementing semantic retrieval, inspect and preserve the accepted T10 path:

```text
idea/v3.resurfacing_budgets

IdeaService:
getResurfacingBudget
claimResurfacingBudget
budgetTails / per-conversation serialization

Remote:
idea/getResurfacingBudget
idea/claimResurfacingBudget

Client:
durable budget read before evaluation
fail closed while loading/failed/consumed
Final Delivery Gate before claim
claim before UI publication
surface only on CLAIMED
```

T11 must not:

```text
run semantic embedding while durable budget is unknown/consumed/failed
bypass Host claim
claim before existing Final Delivery Gate
surface before CLAIMED
delete budget on session/disposed/api-session/removed
replace Host budget authority with client state
```

Add regression tests proving T11 integration preserves this invariant.

### Expected implementation surface

The exact file decomposition may follow repository conventions, but implementation should remain close to this minimal shape:

```text
packages/dsh-idea/src/semantic/
  index.ts
  config.ts
  types.ts
  schema.ts
  spec.ts
  document.ts
  profile.ts
  vector.ts
  provider.ts
  openai-compatible.ts
  service.ts
  retrieval.ts

packages/dsh-idea/src/resurfacing/
  candidate.ts              # optional semantics-preserving projection extraction
  hybrid.ts                 # pure RRF merge helper

packages/dsh-idea/src/client/resurfacing-state.ts
packages/dsh-idea/src/remote-host/types.ts
packages/dsh-idea/src/remote-host/service.ts
packages/dsh-idea/src/remote-host/index.ts
packages/dsh-idea/src/index.ts
packages/dsh-idea/package.json
packages/dsh-idea/cordis.patch.yml
packages/dsh-idea/scripts/setup-dev.mjs

generated Typert output
focused T11 tests / narrowly affected T10 client tests
```

Do not perform unrelated refactors.

---

## 5. Semantic Storage Domain

Create a new storage-domain declaration:

```text
name: idea_semantic
version: 1
layout: per-record
invalidRecords: backup-and-skip
```

with table:

```text
embeddings
```

The table is keyed by `IdeaId`.

Do **not** change:

```text
ideaDomainSpec.version
idea/v3 existing tables
resurfacing_budgets
Idea aggregate schema semantics
Idea lifecycle storage
```

No `idea/v4` migration.

### 5.1 Record

A record represents only the currently indexed exact Idea version:

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

Use existing Idea/Version identity schemas/types where possible.

Require durable schema validation for:

- valid Idea id;
- valid Version id;
- exact `documentVersion = 1`;
- deterministic hash/profile id format;
- positive bounded `dimensions`;
- valid vector representation;
- vector decodes/validates to exactly `dimensions` finite numeric elements;
- valid non-negative finite timestamp.

Do not store the semantic document text in this domain.

The physical vector serialization is an **implementation detail**. Prefer the repository's simplest validated JSON-compatible representation unless measurements justify something more complex. Do not introduce a binary/base64 codec merely for speculative compactness.

---

## 6. Derived-Data Semantics

`idea_semantic/v1` is a disposable cache/index, never business truth.

The following must remain true:

```text
delete all semantic data
→ Ideas still work
→ T9 still works
→ T10 lexical resurfacing still works
→ T10 durable resurfacing budget still works
```

A missing, stale, corrupt, or unavailable semantic record must never mutate or invalidate an Idea or resurfacing-budget record.

The `backup-and-skip` record policy is intentional for this derived domain.

---

## 7. Deterministic Idea Semantic Document

Implement one pure deterministic builder over the exact current `IdeaVersion`.

The document contains, in a fixed stable format and order:

```text
Title
Core
Motivation
Current Conclusion
Possible Value
Use When
Open Questions
```

Requirements:

- no LLM;
- no source-discussion transcript;
- no full Conversation history;
- no historical Idea versions;
- no T10 Judge output;
- no resurfacing-budget data;
- no behavioral data;
- deterministic separators/newlines;
- same version content + same document version → byte-identical document.

Set:

```text
IDEA_SEMANTIC_DOCUMENT_VERSION = 1
```

Compute:

```text
contentHash = SHA-256(exact UTF-8 document bytes)
```

Test byte-level determinism.

---

## 8. Embedding Profile

Define one deterministic active profile from:

```text
adapter
canonicalBaseURL
model
expectedDimensions
documentVersion
normalizationVersion
```

Use a stable normalization version such as:

```text
l2-v1
```

Canonicalize `baseURL` deterministically before hashing, at minimum:

- require `http:` or `https:`;
- parse as URL;
- remove trailing `/` from the effective base form;
- reject embedded username/password credentials.

Compute:

```text
embeddingProfileId = SHA-256(stable profile representation)
```

Do not include:

```text
apiKey
apiKeyEnv
timeoutMs
batchSize
```

Two different profile ids must never share vector comparisons.

The T11 V1 active profile is a static immutable snapshot for the lifetime of the service instance. Hot reload is out of scope.

---

## 9. T11 Host Configuration

Add static host configuration for the semantic plugin.

Frozen fields:

```text
enabled
baseURL
model
apiKeyEnv
expectedDimensions
timeoutMs
batchSize
```

Recommended V1 defaults/bounds:

```text
enabled = false
apiKeyEnv = DSH_IDEA_EMBEDDING_API_KEY
timeoutMs = 30000
batchSize = 32

expectedDimensions:
  required when enabled
  positive integer
  bounded to a defensible finite maximum

timeoutMs:
  positive integer
  bounded

batchSize:
  integer >= 1
  bounded
```

When `enabled = true`, initialization must fail loud for structurally invalid configuration such as:

```text
missing/invalid baseURL
blank model
invalid expectedDimensions
invalid timeoutMs
invalid batchSize
```

When `enabled = false`, provider-required fields may remain absent and:

```text
provider calls = 0
startup backfill calls = 0
T10 behavior = pre-T11 behavior
```

No Settings UI or hot reload work in T11.

---

## 10. Credential Boundary

Add:

```text
@deepseek-ai/dsh-credentials
```

at the Harness-compatible peer range:

```text
^0.1.6-alpha.2
```

and add its local development junction:

```text
packages/credentials/credentials
```

Use only the verified credential reference seam:

```text
credentialRef(config.apiKeyEnv)
ctx.credentials.resolve(ref)
```

Do not persist or log the resolved key.

Do not default to `DEEPSEEK_API_KEY`.

Do not directly treat `process.env` as the authoritative T11 credential source.

If the semantic feature is enabled but the credential is unavailable at operation time, semantic work degrades without breaking lexical resurfacing.

---

## 11. Embedding Provider Abstraction

Create a plugin-owned abstraction, conceptually:

```text
IdeaEmbeddingProvider
```

with a bounded batch operation accepting:

```text
readonly string[]
AbortSignal?
```

and returning one vector per input.

V1 adapter:

```text
OpenAICompatibleEmbeddingProvider
```

Endpoint:

```text
POST <canonicalBaseURL>/embeddings
```

Request concept:

```json
{
  "model": "<configured model>",
  "input": ["...", "..."]
}
```

Expected response concept:

```json
{
  "data": [
    { "index": 0, "embedding": [0.1, 0.2] }
  ]
}
```

Do not send a provider-specific `dimensions` request field in V1.

`expectedDimensions` is a validation contract, not a required wire field.

No provider retries/backoff scheduler in T11 V1.

A failed indexing attempt may remain missing/stale until a later Idea change or the next startup reconciliation.

---

## 12. HTTP / Provider Safety

Use native `fetch` and explicit cancellation/timeout handling.

Requirements:

```text
method = POST
redirect = error
content-type = application/json
accept = application/json
authorization = Bearer <resolved key>
```

Do not leak secrets into errors, logs, request recording, or diagnostics.

Treat as provider failure:

```text
network error
non-2xx HTTP
429
unparseable JSON
malformed data[]
missing/duplicate indices
wrong result count
wrong dimensions
NaN / Infinity
zero norm
timeout
```

Caller cancellation must remain distinguishable from ordinary provider failure.

---

## 13. Vector Validation / L2 Normalization

Provider output is valid only when:

```text
result count == input count
indices are unique
indices cover exactly 0..N-1
each embedding length == expectedDimensions
all values are finite
L2 norm > 0
```

Normalize every accepted vector:

```text
v' = v / ||v||
```

Persist only normalized vectors.

Normalize query vectors identically.

Semantic similarity:

```text
dot(normalizedQuery, normalizedCandidate)
```

Do not add a global cosine threshold.

---

## 14. Semantic Service

Create a Host service conceptually named:

```text
IdeaSemanticService
ctx.ideaSemantic
```

It owns:

```text
idea_semantic domain handle
active embedding profile
provider adapter
coalescing pending identity map/set
worker lifecycle
startup reconciliation
semantic exact-scan retrieval
```

It must not own Idea business writes or resurfacing-budget claims.

Expected injection requirements include:

```text
ideaService
storageDomain
```

Credential resolution may use the verified `ctx.credentials` seam at operation time.

The service must remain mountable while semantic retrieval is disabled.

---

## 15. Index Maintenance Trigger

Listen only to canonical Idea-record changes:

```text
change.domain === ideaDomainSpec.name
change.table === 'ideas'
```

Do **not** react to:

```text
resurfacing_budgets
```

The `domain/changed` callback itself must be synchronous.

It may only use the event to identify work, primarily `change.key` / `change.operation`.

Do **not** build embeddings from `change.value`.

The asynchronous worker must re-read canonical Idea state through the existing Idea service.

The callback must not:

```text
await embedding
perform fetch
throw provider failures
mutate Idea
mutate resurfacing budget
```

Do not modify authoritative Idea write paths to await semantic operations.

---

## 16. Pending Work Model — Synchronized Clarification

Do **not** implement a fixed-capacity FIFO queue.

Use a coalescing identity structure:

```text
Map<IdeaId, PendingIdentity>
```

or equivalent semantics.

Requirements:

```text
at most one pending entry per Idea
repeated events for the same Idea coalesce
worker resolves the latest canonical state when processing
no drop-oldest policy
no drop-newest policy
no blocking of authoritative Idea writes
```

Example:

```text
A v1 event
A v2 event
A v3 event

pending = { A }

worker processes A
→ reads canonical current version
→ indexes v3
```

The pending set is bounded by distinct Idea identities, not event count.

---

## 17. Startup Reconciliation

When semantic retrieval is enabled:

1. enumerate canonical current active Ideas;
2. deterministically build current semantic document/hash;
3. inspect the semantic record by `ideaId`;
4. if exact current version/profile/hash is valid, reuse it;
5. otherwise coalesce the Idea identity into pending work.

External provider work proceeds asynchronously and must not block plugin readiness.

When semantic retrieval is disabled:

```text
no reconciliation provider work
```

No periodic interval/polling loop.

No query-time lazy reconciliation.

No durable indexing-event log.

---

## 18. Missed Event / Crash Recovery — Synchronized Clarification

`domain/changed` is a real-time acceleration path, not durable truth.

If:

```text
event is missed
process crashes
provider call fails
pending work disappears
```

the semantic record may remain:

```text
missing
or
stale
```

for the rest of the current process lifetime.

That is acceptable in T11 V1.

Recovery is:

```text
next plugin startup
→ reconciliation against canonical idea/v3
→ missing/stale Idea identities coalesced
→ rebuild
```

During the stale window:

```text
semantic coverage may be partial
lexical T10 remains fully available
durable T10 budget semantics remain unchanged
```

Do not add polling or query-path repair to "fix" this.

---

## 19. Worker Semantics

V1 worker:

```text
concurrency = 1
coalescing by ideaId
batch provider calls up to configured batchSize where appropriate
```

Before dispatching a batch, re-read canonical current state.

For archived/deleted Ideas:

- do not create a new embedding;
- best-effort remove an existing semantic record where appropriate.

A provider failure must:

- leave canonical Idea data untouched;
- leave resurfacing-budget data untouched;
- not poison the worker;
- not retry forever;
- not create a retry daemon;
- produce only secret-free bounded diagnostics.

Recovery can wait for a later Idea change or startup reconciliation.

---

## 20. Post-I/O Stale Result Guard

Immediately before persisting each returned embedding, re-read canonical Idea state.

Write only if all are still true:

```text
Idea exists
Idea status is active
currentVersionId == requested versionId
current deterministic contentHash == requested contentHash
active embeddingProfileId == requested profileId
```

Otherwise:

```text
DROP RESULT
```

Do not silently relabel an old vector as the new current version.

Add focused race tests proving:

```text
v2 request in flight
→ Idea evolves to v3
→ v2 response arrives
→ v2 is not persisted as current semantic state
```

and:

```text
Idea deleted during request
→ late response
→ no orphan current semantic record is created
```

---

## 21. Canonical Candidate Projection

The current T10 Host service owns a private canonical candidate projection helper (`candidateOf`).

Extract the minimum pure/internal helper if needed so lexical and semantic resurfacing use the same canonical business-field projection.

This extraction must be semantics-preserving.

Do not alter T10 lexical scoring, retrieval floor, suppression vocabulary, candidate limit, Judge behavior, or durable budget behavior.

---

## 22. Semantic Query Input — Synchronized Clarification

The semantic candidate operation receives:

```text
sessionId
currentTurn
recentContext
```

Build the semantic query from the **existing T10 bounded visible context contract**.

Frozen bounds:

```text
current triggering user turn:
≤ RESURFACING_TURN_TEXT_LIMIT
currently 2000 chars

recent visible context:
≤ RESURFACING_RECENT_CONTEXT_LIMIT
currently 6 prior visible messages

roles:
user | assistant

per-message / aggregate bounds:
reuse existing T10 extractTurnContext / resurfacing constants
```

Do not define a second 4-message/8000-character semantic context policy.

The triggering Assistant reply must not enter the embedding query.

Earlier Assistant messages may be included only when they already fall inside T10's bounded recent visible context.

Do not read unbounded session history.

---

## 23. Durable Budget Gate Before Semantic Work

The client must not invoke the semantic Remote unless the accepted T10 durable budget state is:

```text
free
```

Prove:

```text
budget loading
budget failed
budget consumed
```

all cause:

```text
0 semantic Remote calls
0 query embedding calls
```

Do not let semantic retrieval begin before durable-budget initialization finishes.

### Semantic retrieval eligibility before query call

Before paying for a query embedding, inspect semantic records and canonical state.

A record is not semantically eligible if canonical validation finds:

```text
Idea missing
Idea status != active
record.versionId != Idea.currentVersionId
record.embeddingProfileId != active profile
record.contentHash != current deterministic contentHash
current discussion descends from this Idea
Idea was created from the current conversation/session
```

Validation is candidate-local.

One invalid/stale semantic record:

```text
→ drop that record
→ continue validating/searching other records
```

It must not fail the whole semantic retrieval operation.

Missing/stale records may be coalesced into pending maintenance work.

If no semantically eligible indexed records remain:

```text
0 query embedding calls
return empty candidates
```

---

## 24. Exact Semantic Scan

For an admitted semantic query:

1. obtain exactly one query embedding;
2. validate and L2-normalize it;
3. calculate dot product with every eligible current-profile vector;
4. sort deterministically:

```text
similarity DESC
Idea.updatedAt DESC
ideaId ASC
```

5. return at most:

```text
SEMANTIC_TOP_K = 12
```

No cosine threshold.

Do not return vectors to the browser.

---

## 25. Exact Evaluated Version Identity — Synchronized Clarification

For every semantic result:

```text
evaluatedVersionId = semanticRecord.versionId
```

It is the exact indexed version that was scored.

Before the result is accepted for fusion, require:

```text
semanticRecord.versionId == canonical Idea.currentVersionId
```

Do not:

```text
take an old semantic record
and replace its evaluatedVersionId with the newer current version
```

If stale:

```text
drop candidate only
```

Other semantic candidates remain valid.

---

## 26. New Semantic Remote

Do not modify the contract of:

```text
idea/evaluateResurfacing
idea/getResurfacingBudget
idea/claimResurfacingBudget
```

It must stay:

```text
deterministic
zero-model
zero-provider-network
```

Add a separate Remote method, naming consistent with the existing service, conceptually:

```text
idea.semanticResurfacingCandidates(...)
```

Request:

```text
sessionId
currentTurn
recentContext
```

Response candidate projection:

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

It may carry only minimal secret-free degradation metadata if strictly useful for tests/diagnostics.

Do not expose:

```text
vector
cosine score
contentHash
provider payload
credential
```

The Remote accepts:

```text
signal?: AbortSignal
```

and must preserve the Typert cancellation descriptor contract.

---

## 27. Semantic Remote Failure Contract

Ordinary semantic failure is not a surfaced product error.

For:

```text
feature disabled
no usable index
missing credential
provider unavailable
timeout
429
invalid provider response
invalid vector
```

return a semantic-empty/degraded result that allows lexical candidates to continue.

Cancellation is different:

```text
caller AbortSignal
→ preserve gateway/cancelled semantics
```

Do not convert caller cancellation into a generic empty semantic result.

Do not touch durable resurfacing budget on semantic failure.

---

## 28. Client Parallel Retrieval

Keep the existing trigger:

```text
appended durable turn/end
reason.kind === completed
```

Only after durable budget state is `free` and the existing deterministic Opportunity Detector admits the turn, start:

```text
existing lexical evaluateResurfacing
+
new semanticResurfacingCandidates
```

for the same bounded trigger context.

They may run concurrently.

Do not move retrieval to `user/message`.

Do not make semantic retrieval affect the Assistant reply that already completed.

Semantic failure must not cancel a valid lexical result.

---

## 29. Client Semantic Cancellation

Extend the structural input face to use the already-public snapshot contract:

```text
getSnapshot()
subscribe()
```

Introduce a **per-evaluation** semantic AbortController.

Abort the in-flight semantic request when:

```text
a newer human user message arrives
input draftRev changes after trigger capture
controller is disposed
```

Dispose the input subscription cleanly.

Do not replace existing final stale/race checks; cancellation is additional cost/control protection, not the sole correctness guard.

Do not misuse the existing lifetime Judge AbortController as the only per-evaluation semantic controller.

---

## 30. Hybrid Rank Fusion

Add a pure deterministic RRF helper.

Inputs:

```text
lexical candidates in their existing order (max 3)
semantic candidates in semantic rank order (max 12)
```

Identity/dedupe key:

```text
ideaId + evaluatedVersionId
```

Frozen constants:

```text
RRF_K = 60
FINAL_JUDGE_POOL_LIMIT = 3
```

Concept:

```text
rrf =
  lexical rank contribution if present
  +
  semantic rank contribution if present

contribution(rank) = 1 / (60 + rank)
```

Ranks are 1-based.

Final deterministic ordering:

1. fused score DESC;
2. when exactly tied, a candidate present in the existing lexical branch sorts first;
3. then best branch rank ASC;
4. then stable `ideaId` ASC;
5. then stable `evaluatedVersionId` ASC if still required.

Do not combine raw lexical score and cosine similarity.

Do not alter T10 lexical score semantics.

---

## 31. Downstream T10 Equivalence — Synchronized Clarification

After RRF, lexical/semantic origin is no longer part of product behavior.

Apply existing client-side runtime suppression to the fused pool, then cap the Judge pool to 3.

The T10 Judge input structure must remain exactly the existing T10 business candidate structure.

Do not add to Judge input:

```text
semanticRank
cosine similarity
RRF score
candidateSource
embeddingProfileId
```

Judge and downstream flow remain:

```text
fused candidate
→ existing runtime suppression
→ existing T10 Judge
→ existing Final Delivery Gate
→ existing claimResurfacingBudget
→ CLAIMED only
→ existing suggestion state/UI
→ existing dismiss behavior
→ existing explicit T9 Reference path
```

T11 must not fork or bypass the durable budget claim.

---

## 32. T10 Judge

Do not change the T10 Judge prompt contract, model-call count, parser vocabulary, candidate business fields, or fail-closed semantics.

The Judge still receives at most 3 exact-version candidate identities/business projections.

It remains the only chat-LLM decision point in resurfacing.

T11 adds embedding calls only.

---

## 33. T10 / T9 Compatibility Gates

Prove no regression in:

```text
T9 Search
T9 Related Ideas
T9 Reference
T9 Continue Discussion

T10 durable budget read
T10 durable budget persistence
T10 same-Host atomic claim
T10 refresh/recreate suppression
T10 dual-controller one-winner behavior
T10 Opportunity Detector
T10 lexical evaluateResurfacing
T10 suppression
T10 Judge
T10 Judge candidate input structure
T10 composer resurfacing strip
T10 surface budget path
T10 dismiss path
T10 explicit Reference path
```

`idea/v3` must remain version 3 and preserve the accepted `resurfacing_budgets` table.

---

## 34. Accepted T10 Persistence Baseline

T10 persistence is no longer an unresolved follow-up. It is an accepted prerequisite at the T11 baseline.

Do not alter:

```text
resurfacing_budgets schema
getResurfacingBudget
claimResurfacingBudget
per-conversation budgetTails serialization
read-before-evaluate fail-closed behavior
Final Delivery Gate → claim ordering
claim → CLAIMED-only UI publication ordering
no-cleanup-on-session/disposed rule
no-cleanup-on-api-session/removed rule
```

Any need to change these requires architecture review, not an incidental T11 edit.

---

## 35. Package / Bundle Wiring

### 35.1 package.json

Add:

```text
@deepseek-ai/dsh-credentials: ^0.1.6-alpha.2
```

to the appropriate host peer dependencies.

Add a semantic package export, following existing subpath conventions:

```text
./semantic
```

Do not add the Host credential package to client injection metadata.

### 35.2 setup-dev.mjs

Add:

```text
['@deepseek-ai/dsh-credentials', 'packages/credentials/credentials']
```

using the existing junction pattern.

### 35.3 cordis.patch.yml

Add one Host row for the semantic service, e.g.:

```text
id: dsh-idea-semantic
name: '@dsh-external/dsh-idea/semantic'
config:
  enabled: false
```

Do not enable external embedding by default.

The existing remote service may depend on the semantic service through Cordis service injection once the new Remote method exists.

Row order is not lifecycle authority; service availability/injection remains the contract.

---

## 36. Generated Typert

After Remote types/methods are complete:

```text
pnpm generate:typert
```

Generated Typert changes are expected only because the new semantic Remote is added.

Never hand-edit generated Typert output.

Inspect the generated diff.

Require:

- one new cancellable semantic Remote descriptor;
- no unexpected changes to existing Remote descriptors;
- existing T9/T10 Remote shapes unchanged.

---

## 37. Tests — Pure Semantic Core

Add focused tests for at least:

### Deterministic document
- exact field order;
- deterministic output;
- list rendering;
- same content → same hash;
- semantic content change → changed hash.

### Profile
- canonical base URL normalization;
- embedded URL credentials rejected;
- stable profile id;
- different model/baseURL/dimensions/document/normalization → different profile id;
- secret/timeout/batch changes do not change profile id.

### Vector validation
- valid output;
- wrong count;
- duplicate/missing index;
- wrong dimensions;
- NaN/Infinity;
- zero vector;
- L2 normalization;
- dot-product ordering.

### Domain schema
- valid record round-trip;
- malformed/dimension-invalid vector record rejected;
- malformed derived record is backup-and-skip compatible under real storage-domain/json fixtures where available.

---

## 38. Tests — Provider Adapter

Use a local fake/mock HTTP endpoint only.

Prove:

```text
POST /embeddings
model/input payload
credential resolved per operation
redirect policy
timeout
AbortSignal cancellation
HTTP error
429
malformed JSON
malformed data/index
no secret in thrown/logged diagnostics
batch order reconstructed by response index
no retry/backoff loop
```

Do not make a real provider call.

---

## 39. Tests — Pending Work / Recovery / Index Lifecycle

Prove:

```text
enabled=false → zero provider calls
create event → Idea identity coalesced/indexed
manualEdit/evolve → same Idea identity coalesces; latest canonical version wins
multiple same-Idea changes do not create multiple pending work items
different Idea identities coexist independently
no fixed FIFO overflow/drop policy exists
archive → semantic retrieval excludes Idea
restore with valid same profile/hash → reusable record
delete → candidate excluded even if cleanup fails
startup reconciliation fills missing records
startup reconciliation detects stale version/profile/hash
valid record is not unnecessarily rebuilt
provider failure never changes Idea success
provider failure does not create an infinite retry loop
resurfacing_budgets writes do not enqueue semantic indexing
```

Also prove the recovery contract:

```text
simulate stale/missing record with no live event
→ next startup reconciliation detects it
→ pending work is restored
```

Do not add polling/timer tests because polling is forbidden.

Do not add query-time reconciliation tests because query-time repair is forbidden.

---

## 40. Tests — Post-I/O Race / Concurrency

Mandatory proofs:

```text
late old-version response cannot persist after version advance
late response cannot recreate a semantic current record after Idea deletion
```

Also cover:

```text
profile identity checked before persist
contentHash checked before persist
candidate-level stale validation does not fail unrelated candidates
```

---

## 41. Tests — Semantic Retrieval

Prove:

```text
no eligible index records → zero query embedding calls
disabled → zero query embedding calls
current discussion descendant excluded
current-conversation-created Idea excluded
archived Idea excluded
stale version excluded individually
stale profile excluded individually
stale contentHash excluded individually
one stale candidate does not fail other semantic candidates
semantic exact scan topK <= 12
similarity ordering deterministic
equal similarity tie = updatedAt DESC → ideaId ASC
evaluatedVersionId == exact semantic record.versionId
old semantic record is never relabeled as current version
```

### Query-context contract

Prove:

```text
current turn bounded by existing T10 turn limit
recent context bounded by existing T10 message-count/text limits
roles may include prior user and prior assistant messages
triggering Assistant reply is absent from embedding query
no independent 8k/4-message policy exists
```

### Semantic-only recall

Use deterministic fake vectors:

```text
little/no lexical overlap
semantic vector ranks intended Idea
candidate reaches hybrid pool
```

Do not depend on an actual embedding model.

---

## 42. Tests — RRF / Downstream Equivalence / Client Integration

### Pure RRF

Prove:

```text
lexical-only preserves lexical order
semantic-only uses semantic order
candidate present in both receives both contributions
dedupe uses ideaId + evaluatedVersionId
max final pool = 3
raw lexical/cosine values are not numerically mixed
ties follow frozen ordering
```

### Durable budget pre-gate

Prove:

```text
budget loading → semantic Remote 0
budget failed → semantic Remote 0
budget consumed → semantic Remote 0
budget free + detector rejects → semantic Remote 0
budget free + detector admits → lexical + semantic paths start
```

### Client/controller

Prove:

```text
semantic failure → lexical path still proceeds
lexical empty + semantic success → semantic candidate can reach Judge
both branches → fused pool sent to Judge
composer draftRev change aborts semantic request
new user message aborts semantic request
dispose aborts semantic request
late semantic result is ignored
```

### Durable downstream equivalence

For lexical-only, semantic-only, and dual-source winners, prove all use the same:

```text
Judge request structure
Final Delivery Gate
claimResurfacingBudget
CLAIMED-only surface
ALREADY_CONSUMED silence
claim failure silence
suggestion state
dismiss()
reference()
T9 attachReference path
```

Judge input must not contain semantic/RRF provenance metadata.

### Refresh/recreate regression remains green

```text
controller #1 consumes budget
controller #2 same SessionId
→ budget read consumed
→ semantic Remote 0
→ lexical evaluate 0
→ Judge 0
→ surface 0
```

### Same-Host dual-controller regression remains green

Two controllers reaching claim for one conversation:

```text
exactly one CLAIMED
exactly one ALREADY_CONSUMED
exactly one surface
```

Semantic origin must not alter this invariant.

---

## 43. Privacy / Data-Egress Tests

Pin the semantic provider inputs.

Indexing request may contain only the deterministic current IdeaVersion semantic document.

It must not contain:

```text
SourceDiscussion capturedContext
historical versions
session transcript
T10 Judge prompt/output
T10 resurfacing budget
credentials
```

Query request may contain only:

```text
bounded current triggering user turn
bounded prior visible T10 context
```

No triggering Assistant reply in query embeddings.

---

## 44. Partial Coverage / Diagnostics

Partial semantic coverage is valid and user-invisible.

Implementation may emit bounded secret-free diagnostics such as:

```text
valid_count
missing_count
stale_count
```

Do not introduce:

```text
new telemetry subsystem
new metrics backend
new user-facing index progress UI
```

No such subsystem is required for T11 acceptance.

---

## 45. Real Provider / Network Governance

Acceptance requires:

```text
REAL_EMBEDDING_PROVIDER_CALLS=0
REAL_CHAT_PROVIDER_CALLS=0
PUBLIC_NETWORK_PROVIDER_CALLS=0
```

Loopback/mock HTTP tests are allowed.

Do not use a user's real API key.

Do not run an exploratory real embedding smoke as part of T11 acceptance.

---

## 46. Required Execution Order

Use this order strictly:

```text
1. Baseline / drift verification
2. Verify accepted T10 persistence baseline before changes
3. Implementation
4. Self / focused pure tests
5. Provider adapter mock tests
6. pending-work / recovery / semantic storage lifecycle tests
7. semantic retrieval + race/concurrency tests
8. RRF + client integration + T10 persistence-preservation tests
9. T9/T10 focused regression
10. Architecture / Contract / Scope Audit
11. Pre-Full quality gates
12. Repair any failures
13. Re-run affected focused tests
14. Canonical Full LAST
15. No executable drift after Canonical Full
16. Acceptance report only
17. Commit/push/remote verification
```

Do not run Canonical Full early as a debugging loop.

---

## 47. Architecture / Contract / Scope Audit

Before Canonical Full, explicitly audit and record:

```text
idea/v3 version remains 3
resurfacing_budgets unchanged
T10 budget read-before-evaluate unchanged
T10 claim per-conversation serialization unchanged
T10 claim-after-final-gate unchanged
T10 claim-before-UI unchanged
no budget cleanup listeners added

idea_semantic/v1 is separate derived domain
no historical semantic candidates
pending work is coalescing per-Idea identity, not fixed-cap FIFO
missed-event recovery is next startup reconciliation only
no periodic reconciliation
no query-time reconciliation

no T9 Search changes
no T9 Related changes
no T9 Reference changes

no T10 trigger change
evaluateResurfacing remains zero-provider
query context reuses T10 bounds
triggering Assistant reply absent from semantic query
evaluatedVersionId is exact indexed version
stale candidate failure is candidate-local
T10 Judge input structure unchanged
T10 Judge unchanged
downstream durable claim path unchanged
no hidden context injection

semantic default-off
no Vector DB
no Harness changes
credentials use ctx.credentials
no secret persistence
no provider call in authoritative Idea transaction
post-I/O stale guard present
semantic failure lexical-fallback semantics present
```

If any item fails, repair before Full.

---

## 48. Pre-Full Quality Gates

Run all repository-native low-cost gates before Canonical Full.

At minimum:

```text
pnpm setup:dev        # against frozen Harness checkout
pnpm generate:typert
git diff --check
pnpm typecheck
pnpm build
pnpm build:client
```

Run package-native lint/format checks if present.

Also verify:

```text
Harness HEAD unchanged
Harness tracked diff = zero
idea/v3 spec version = 3
idea/v3 tables still include ideas, discussions, resurfacing_budgets
idea_semantic spec version = 1
accepted T10 budget Remote descriptors unchanged
generated Typert fresh
only task-owned dsh-idea drift
```

If a static fix changes executable code after a prior test, re-run the affected focused tests before Full.

---

## 49. Canonical Full

The pre-T11 baseline is:

```text
41 test files
625 tests
```

The T11 final count is expected to increase.

Run the complete test suite **once as the final executable acceptance gate after all executable/static repairs are complete**.

Record exact:

```text
test files
tests
exit code
duration if useful
```

After the final passing Canonical Full:

```text
NO EXECUTABLE DRIFT
```

Only acceptance/report documentation may change.

If an executable change is necessary after Full, the previous Full evidence is invalid and a new final Full is required.

---

## 50. Acceptance Criteria

T11 is accepted only if all are true:

```text
baseline starts from f972c962...
pre-T11 tested executable = 4c38e2b...
pre-T11 Full = 41 / 625

T10 durable budget table/schema preserved
T10 read-before-evaluate preserved
T10 semantic calls blocked unless budget free
T10 same-Host atomic claim preserved
T10 refresh/recreate suppression preserved
T10 dual-controller one-winner preserved

semantic domain opens as idea_semantic/v1
idea/v3 remains version 3
default disabled = zero provider work
mock OpenAI-compatible adapter validated
credential seam validated
deterministic document/profile/hash validated
vector validation/L2 validated

pending work coalesces per Idea
startup reconciliation validated
missed-event recovery validated via startup reconciliation
no polling/query-time repair added

domain/changed indexing validated
resurfacing_budgets changes ignored by semantic indexer
late-result race guards validated
semantic candidate-local canonical validation validated
evaluatedVersionId exact indexed-version semantics validated

semantic exact scan validated
semantic topK = 12
RRF_K = 60
final Judge pool <= 3

query context exactly follows existing T10 bounded-context contract
triggering Assistant reply absent from query embedding

lexical fallback validated
semantic-only recall validated
cancellation validated

T10 Judge input structure unchanged
durable budget claim downstream path unchanged
surface/dismiss/reference downstream equivalence validated

T9 regressions green
T10 regressions green
typecheck/build/build:client green
generated Typert fresh
Canonical Full green
real provider calls = 0
Harness tracked diff = zero
```

---

## 51. Commit Structure

Use a clean two-stage acceptance structure.

### 51.1 Executable implementation commit

Commit all T11 executable/test/generated changes.

After final Canonical Full, record the exact tested executable SHA:

```text
T11_TESTED_EXECUTABLE_SHA=<sha>
```

There must be no executable change after this tested SHA.

### 51.2 Docs-only acceptance commit

Create:

```text
docs/DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_ACCEPTANCE.md
```

The acceptance report must be the only post-tested change.

If the revised architecture freeze and synchronized implementation instruction documents were supplied as uncommitted task-owned input documents, include them in a docs-only commit without altering their frozen contents, and prove the executable tested range separately.

---

## 52. Acceptance Report Requirements

The final report must include at least:

1. starting dsh-idea SHA `f972c962...`;
2. pre-T11 tested executable `4c38e2b...`;
3. pre-T11 Full `41/625`;
4. Harness SHA/version;
5. T11 executable implementation SHA;
6. T11 tested executable SHA;
7. docs-only acceptance SHA;
8. exact changed files;
9. `idea/v3` version/table preservation proof;
10. T10 durable-budget regression proof;
11. `idea_semantic/v1` schema/layout/policy;
12. semantic record shape;
13. deterministic document/hash/profile rules;
14. configuration and default-off proof;
15. credential seam proof;
16. provider adapter request/response contract;
17. vector validation/normalization proof;
18. pending-work coalescing semantics;
19. missed-event/crash recovery semantics;
20. startup reconciliation behavior;
21. post-I/O stale-result race proof;
22. semantic canonical validation and candidate-local stale-drop behavior;
23. exact `evaluatedVersionId` semantics;
24. exact scan/topK proof;
25. query-context bound proof;
26. RRF behavior;
27. T10 Judge input unchanged proof;
28. durable-budget downstream equivalence proof;
29. semantic-call budget pre-gate proof;
30. cancellation proof;
31. lexical fallback proof;
32. semantic-only recall proof;
33. refresh/recreate persistence regression proof;
34. dual-controller claim regression proof;
35. T9 regression results;
36. T10 regression results;
37. typecheck/build/build:client/generate results;
38. Canonical Full exact totals;
39. real provider/public network call count;
40. Harness tracked-diff proof;
41. preserved Harness/user docs drift;
42. final dsh-idea git status;
43. origin/main verification;
44. confirmation T12 was not started.

---

## 53. Remote Verification

After acceptance commits:

```text
git fetch
git rev-parse HEAD
git rev-parse origin/main
```

Require equality.

Also prove:

```text
T11_TESTED_EXECUTABLE_SHA..HEAD
```

contains only allowed documentation/report changes.

Do not declare acceptance before remote verification succeeds.

---

## 54. Final Outcome Vocabulary

If all gates pass:

```text
DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_ACCEPTED
```

If implementation exists but a required acceptance gate fails:

```text
DSH_IDEA_T11_IMPLEMENTED_NOT_ACCEPTED
```

If a frozen architecture decision must change:

```text
DSH_IDEA_T11_ARCHITECTURE_DECISION_REQUIRED
```

If baseline drift is detected:

```text
DSH_IDEA_T11_BASELINE_DRIFT
```

If implementation would require Harness changes:

```text
DSH_IDEA_T11_HARNESS_CHANGE_REQUIRED
```

Stop after the final report and remote verification.

Do not enter T12.
