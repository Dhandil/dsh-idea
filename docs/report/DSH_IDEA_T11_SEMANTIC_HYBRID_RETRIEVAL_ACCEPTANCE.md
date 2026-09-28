# DSH Idea T11 — Semantic / Hybrid Idea Retrieval Acceptance Report

Final acceptance record for the `dsh-idea` external Harness plugin, T11 scope
(semantic retrieval as a disposable derived accelerator over the canonical
`idea/v3` domain, fused with the unchanged T10 lexical branch through pure
reciprocal-rank fusion behind the unchanged durable budget, Judge, and claim
path), per
`docs/implements/DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_IMPLEMENTATION_INSTRUCTIONS_FINAL.md`
and the frozen architecture
`docs/architectue/DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_ARCHITECTURE_FREEZE_FINAL.md`.

## 1. Frozen identities (§52.1–§52.8)

| Item | Value |
| --- | --- |
| Starting dsh-idea SHA (§52.1) | `f972c962f1e093536b39e538095874ebbe1969e4` — `docs: record dsh-idea t10 persistence repair acceptance` (= `origin/main` at T11 start; verified at start) |
| Pre-T11 tested executable (§52.2) | `4c38e2b38cb7167be0af62f309cdb8817347846d` — `fix: make dsh-idea resurfacing budget durable (T10 persistence repair)` |
| Pre-T11 Canonical Full (§52.3) | **41 test files / 625 tests, all passing** |
| Harness read-only SHA (§52.4) | `ddefc45fbc7f8e46dd73185e68295696d1297887` (Harness `0.1.6-alpha.2`; verified at start and at acceptance; tracked diff zero) |
| T11 executable implementation SHA (§52.5) | `a03e5029e16961dc00b7b9291bac8e57313deec1` — `feat: add dsh-idea semantic hybrid retrieval (T11)` |
| `T11_TESTED_EXECUTABLE_SHA` (§52.6) | `a03e5029e16961dc00b7b9291bac8e57313deec1` (same commit — the Canonical Full ran on the exact tree content that became this commit; see §10) |
| Docs-only acceptance SHA (§52.7) | the documentation-only commit that carries this file; diff `T11_TESTED_EXECUTABLE_SHA..HEAD` touches only allowed `docs/` paths (§13) |
| Repository | `Dhandil/dsh-idea` (public), branch `main` |
| Canonical domain | `idea` (`packages/dsh-idea/src/spec.ts`), version `idea/v3` — unchanged by T11 (§3) |
| Derived domain | `idea_semantic`, version `1`, `compatibleVersions: []` (`src/semantic/spec.ts`) |
| Storage layout | derived domain `per-record`, table `embeddings`, `invalidRecords: 'backup-and-skip'` |

**Pre-Full representation disclosure.** An earlier, never-pushed commit
(`b94115e361c77f7f8aeb6193f52d81573cf81c47`) held the `identityKey` separator
in `src/resurfacing/hybrid.ts` as a raw `U+0000` byte inside the template
literal — runtime-identical to the frozen `ideaId + evaluatedVersionId`
identity, but it made git classify the `.ts` source as binary (opaque diffs
forever). Before any push, the commit was amended to the canonical `\x00`
escape sequence (the evaluated string is byte-for-byte identical at
runtime). After the amendment, every static gate and the Canonical Full were
re-run on the amended tree; `a03e5029…` is the tested content, and the first
Full (on the pre-amendment tree) had also passed 46/712.

**No Harness modification**: the Harness checkout at
`D:\Harness\deepseek-harness` was used read-only. No file under the Harness
tree was created, modified, or deleted by this task; tracked diff is zero
(`git status --porcelain | grep -v '^??'` → 0 lines) and the only untracked
files are the six pre-existing T0-era scratch files (`build.log`,
`install.log`, `t0-*.txt`), preserved untouched (§52.40–§52.41).

## 2. What T11 shipped (§52.8 — exact changed files)

38 files, +3556/−51 (see `git show --stat T11_TESTED_EXECUTABLE_SHA`):

**Server side — `src/semantic/` (new module, 12 files)**
- `types.ts` — frozen vocabulary: `IDEA_SEMANTIC_DOCUMENT_VERSION = 1`,
  `SEMANTIC_NORMALIZATION_VERSION = 'l2-v1'`, `SEMANTIC_ADAPTER =
  'openai-compatible'`, `SEMANTIC_TOP_K = 12`, `SEMANTIC_DIMENSIONS_MAX =
  10_000`, `SEMANTIC_TIMEOUT_MS_MAX = 120_000`, `SEMANTIC_BATCH_SIZE_MAX =
  128`, defaults (`DSH_IDEA_EMBEDDING_API_KEY`, 30 s, 32); the disposable
  `SemanticEmbeddingRecord`, the immutable `EmbeddingProfile` /
  `ResolvedEmbeddingProfile`, and `NormalizedVector`.
- `spec.ts` — the `idea_semantic` domain declaration: version `1`,
  `compatibleVersions: []`, `per-record` layout, one `embeddings` table keyed
  by `IdeaId`, `invalidRecords: 'backup-and-skip'` (§52.11).
- `schema.ts` — the durable zod record schema: `ideaId`/`versionId` through
  the canonical Idea transforms, `embeddingProfileId`/`contentHash` as
  SHA-256 hex, `documentVersion` literal 1, positive bounded integer
  `dimensions`, `vector` refined to exactly `dimensions` numbers,
  non-negative `createdAt` (§52.12).
- `document.ts` — the deterministic document: frozen field order (Title,
  Core, Motivation, Current Conclusion, Possible Value, Use When, Open
  Questions), `Label: content` lines, `; ` list joins, one trailing newline;
  `hashSemanticDocument` = SHA-256 over the exact UTF-8 bytes (§52.13).
  Transcript-free by construction: no LLM text, no source-discussion
  context, no conversation history, no judge output, no budget data.
- `profile.ts` — strict deterministic base-URL canonicalization (http/https
  only, embedded credentials rejected, trailing slashes stripped) and the
  profile id = SHA-256 of the fixed-order JSON array `[adapter,
  canonicalBaseURL, model, expectedDimensions, documentVersion,
  normalizationVersion]` — deliberately excluding key, key-env name,
  timeout, and batch size (§52.13).
- `vector.ts` — full batch validation (count, unique indices covering
  exactly `0..N-1`, per-vector dimensions, finiteness, positive norm) and
  L2 normalization; similarity is the plain dot product of normalized
  vectors; no cosine threshold exists anywhere (§52.17).
- `provider.ts` — the plugin-owned `IdeaEmbeddingProvider` seam; closed
  secret-free rejection vocabulary (`credential-missing`, `network-failed`,
  `timeout`, `http-error`, `invalid-json`, `malformed-payload`,
  `vector-invalid`); `EmbeddingCancelledError` kept distinct so cancellation
  stays cancellation end to end; no retry, no backoff anywhere (§52.16).
- `openai-compatible.ts` — the V1 adapter: one `POST <canonicalBase
  URL>/embeddings` per batch over native `fetch`, `redirect: 'error'`, JSON
  content negotiation, Bearer credential resolved fresh per operation
  through the injected seam, explicit timeout plus caller-cancellation
  propagation; request body carries only `{model, input}` (no
  provider-specific `dimensions` field — `expectedDimensions` is a response
  validation contract); HTTP errors surface status only, never the body
  (§52.16).
- `config.ts` — static schemastery `SemanticConfig` +
  `resolveSemanticConfig`: `const enabled = raw.enabled === true`; disabled
  always mounts with inert placeholders and validates nothing (§52.14);
  enabled requires non-empty `baseURL`/`model`, a required positive integer
  `expectedDimensions ≤ 10_000`, bounded `timeoutMs ≤ 120_000` and
  `batchSize ≤ 128`, and an identifier-shaped `apiKeyEnv`; every violation
  fails loud at construction with a closed secret-free `SemanticConfigError`
  reason.
- `service.ts` — the `ideaSemantic` service: opens the domain, closes over
  the effect lifetime, subscribes `domain/changed` filtered to
  `domain === 'idea' && table === 'ideas'` (resurfacing_budgets and foreign
  domains are ignored — §52.18 test), identity-only coalescing pending map
  (`Map<IdeaId, true>`) drained by a concurrency-1 worker tail (§52.18);
  `reconcileAtStartup` is the ONLY recovery path, called exactly once from
  `[Service.init]` and only when enabled — no periodic timer, no cleanup
  listener on session/disposed/api-session/removed anywhere (§52.19);
  per-record write path with post-I/O stale guards (§52.21); the
  `semanticResurfacingCandidates` operation: bound query input → one query
  embedding paid only when candidate-locally valid records exist (§52.24) →
  exact scan → defensive re-validation per record → top-K projection.
- `retrieval.ts` — `boundSemanticQueryInput` (exactly the T10 bounds:
  current turn ≤ 2000 chars, recent context ≤ 6 messages × ≤ 400 chars,
  empty texts dropped, unknown roles dropped), `buildSemanticQueryText`
  (`[...recent, 'user: ' + turn].map('role: text').join('\n')` — prior
  visible context then the user turn, nothing else), `selectSemanticTopK`
  over the exact scan (§52.24–§52.25).
- `index.ts` — the plugin public surface; default export
  `IdeaSemanticService`, mounted by the Host loader as
  `@dsh-external/dsh-idea/semantic`.

**Server side — `src/resurfacing/`**
- `candidate.ts` (new) — `candidateOf` extracted verbatim from
  `resurfacing/service.ts` (semantics-preserving refactor; the lexical
  evaluate remains zero-provider) so the client can score the same lexical
  order twice without duplicating logic.
- `hybrid.ts` (new) — pure `fuseHybridCandidates`: identity key
  `` `${ideaId}\x00${evaluatedVersionId}` ``, per-branch positional ranks,
  contribution `1 / (RRF_K + rank)` with frozen `RRF_K = 60`, summed exactly
  once for dual-branch identities; ordering fusedScore DESC →
  lexical-present first → `bestBranchRank` ASC → `ideaId` ASC →
  `evaluatedVersionId` ASC; input entries are consumed as identities only —
  no raw score material of either branch participates; no cap applied here
  (the caller owns `FINAL_JUDGE_POOL_LIMIT = 3`) (§52.26).
- `service.ts` (modified) — the extraction site only; `evaluate`/`judge`
  semantics, the Judge prompt/parser path, and the durable claim path are
  byte-identical to the T10 Persistence Repair state (§52.27–§52.28).

**Wire — `src/remote-host/`**
- `service.ts` — one new `@Remote` verb `idea/semanticResurfacingCandidates`
  (client-cancellable, trailing `signal?: AbortSignal`, pre-aborted
  `gateway/cancelled` guard; `EmbeddingCancelledError` maps to
  `gateway/cancelled`; every ordinary semantic failure degrades to
  `{ candidates: [] }` so the hybrid branch can never break the lexical
  surface). Generated descriptors mark exactly this verb cancellable;
  `result.mode` stays `strict` for all.
- `types.ts` — `IdeaSemanticResurfacingCandidatesRequest` (`sessionId`,
  `currentTurn`, `recentContext`) / `...Result` / `...Candidate` wire
  shapes; the candidate projection carries exactly `ideaId`,
  `evaluatedVersionId`, `title`, `core`, `currentConclusion`,
  `possibleValue`, `useWhen`, `semanticRank` (§52.23).

**Client — `src/client/`**
- `resurfacing-state.ts` — the `IdeaResurfacingController` runs both branches
  concurrently on the SAME bounded T10 context after the durable budget reads
  free and the detector admits the turn: lexical `evaluate` (zero-provider,
  unchanged) + `semanticResurfacingCandidates` (one paid call with a fresh
  non-aborted `AbortSignal`, aborted on composer change, newer user message,
  and dispose via a dedicated per-evaluation `AbortController`); both
  branches never throw; fusion via `fuseHybridCandidates` → the unchanged
  suppression filters → `.slice(0, FINAL_JUDGE_POOL_LIMIT)` → the unchanged
  T10 Judge (candidates carry ONLY `{ideaId, evaluatedVersionId}`) → the
  unchanged Final Delivery Gate → the unchanged durable claim → CLAIMED-only
  surface; semantic failure at any point degrades to the lexical-only
  pipeline silently (§52.29–§52.32).

**Package glue**
- `src/index.ts` — additive exports (semantic remote types,
  `fuseHybridCandidates`/`FINAL_JUDGE_POOL_LIMIT`/`RRF_K`, `candidateOf`).
- `package.json` — `"./semantic"` export path (`lib/semantic/index.js`).
- `cordis.patch.yml` — `dsh-idea-semantic` contribution registration.
- `scripts/setup-dev.mjs` — semantic plugin registration for dev setup.

**Task-owned input documents (docs-only acceptance commit, frozen contents
unaltered)**
- `docs/architectue/DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_ARCHITECTURE_FREEZE_FINAL.md`
- `docs/implements/DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_IMPLEMENTATION_INSTRUCTIONS_FINAL.md`

**Tests**
- New: `tests/semantic-core.spec.ts` (19),
  `tests/semantic-provider.spec.ts` (16), `tests/semantic-index.spec.ts`
  (15), `tests/semantic-retrieval.spec.ts` (17),
  `tests/resurfacing-hybrid.spec.ts` (11),
  `tests/helpers/semantic.ts` (loopback-only fake OpenAI-compatible
  `/embeddings` server + semantic harness with a stubbed credential seam).
- Extended: `tests/client-resurfacing.spec.tsx` (+8 — the T11 hybrid
  orchestration block; the 38 pre-existing T10 tests are untouched),
  `tests/package.spec.ts` (+1 — the `/semantic` subpath export; 14 total),
  `tests/client.spec.tsx` (+1 — the new descriptor id in the descriptor-list
  assertion), `tests/remote-service.spec.ts` (the `ideaSemantic` throwing
  stub, the new descriptor id, and the cancellable-set pin),
  `tests/remote-{continue,evolution,lifecycle,read,related,search}.spec.ts`
  (each remote-suite harness now provides an `ideaSemantic` throwing stub —
  the same pattern as the existing `ideaResurfacing` stub — because the
  remote controller's inject list gained the dependency).

## 3. `idea/v3` preservation (§52.9)

`src/spec.ts` and `src/schema.ts` are absent from the commit's file list
(the only `spec.ts`/`schema.ts` entries are the NEW
`src/semantic/spec.ts` and `src/semantic/schema.ts` of the separate derived
domain). `idea/v3` keeps version 3 with no schema change, no migration, and
no new table; `idea_semantic/v1` is a fully separate derived domain whose
full deletion must not — and per the disposable-domain tests does not —
damage Ideas, T9 Search/Related/Reference, or any T10 behavior.

## 4. T10 durable-budget regression (§52.10)

The T10 Persistence Repair invariants are pinned by the untouched
pre-existing suites, all green at the tested SHA: `read-before-evaluate`,
fail-closed loading/failed/consumed states, durable budget == free before
any evaluation begins, Final Delivery Gate before claim, CLAIMED-only UI
surface, silent `ALREADY_CONSUMED`/claim failure, no budget cleanup
listeners, and the refresh/recreate + same-Host dual-controller
single-winner regressions (see §8). The T11 block adds the explicit
semantic pre-gate (§7).

## 5. Semantic record, document, and profile (§52.11–§52.13)

- **Record shape (§52.12)** — exactly eight fields: `ideaId`, `versionId`
  (the exact indexed `IdeaVersion`), `embeddingProfileId`, `documentVersion`
  (literal 1), `contentHash`, `dimensions`, `vector` (length == dimensions),
  `createdAt`. Any structural drift fails the record at the durable read
  boundary and `backup-and-skip` retires it as absent — a derived cache
  never blocks a domain open.
- **Document (§52.13)** — deterministic fixed-order projection of one exact
  draft; same draft content + same document version → byte-identical UTF-8;
  `contentHash` = SHA-256 over the exact bytes; the document text itself is
  never persisted (only the hash, vector, and identity/profile metadata).
- **Profile (§52.13)** — SHA-256 over `[adapter, canonicalBaseURL, model,
  expectedDimensions, documentVersion, normalizationVersion]`; vector
  compatibility is exact-profile equality; secrets, timeout, and batch size
  are excluded by construction.

## 6. Configuration, credentials, provider contract, vectors (§52.14–§52.17)

- **Default off (§52.14)** — `resolveSemanticConfig`: `const enabled =
  raw.enabled === true`; with the Host-loader default `enabled: false` the
  service mounts inert (placeholders, no validation, zero provider calls,
  zero reconciliation) and T10 behavior is byte-identical to pre-T11 —
  pinned by `semantic-index` ("enabled=false makes zero provider calls and
  writes zero records") and `semantic-retrieval` ("returns empty with zero
  provider traffic while disabled") and the client test "semantic starts
  only after budget free".
- **Credential seam (§52.15)** — the service resolves
  `ctx.credentials.resolve(credentialRef(config.apiKeyEnv))` fresh for every
  provider operation; an unconfigured credential fails closed to
  `credential-missing` BEFORE any wire traffic (test: remount without key →
  empty result with zero new requests).
- **Provider contract (§52.16)** — `POST <canonical>/embeddings`,
  `redirect: 'error'`, `{model, input}` only, Bearer from the seam, JSON
  content negotiation, explicit timeout, caller-cancellation propagation;
  complete-batch response validation; closed rejection vocabulary; no retry
  and no backoff anywhere in T11.
- **Vectors (§52.17)** — acceptance requires the full batch (one entry per
  input, unique indices covering exactly `0..N-1`), exact expected
  dimensions, all-finite values, positive norm; accepted vectors are
  L2-normalized and only normalized vectors are persisted or compared;
  similarity = dot product; scan-time defensive re-validation additionally
  drops any stored record whose dimensions drifted, whose vector contains a
  non-finite value, or whose norm is zero (test: a schema-valid zero vector
  is excluded at scan; a NaN vector fails the schema at open and reads back
  absent).

## 7. Index lifecycle: coalescing, recovery, reconciliation, races (§52.18–§52.21)

- **Coalescing (§52.18)** — the pending structure is an identity-only map
  (`Map<IdeaId, true>`); rapid same-idea writes coalesce latest-wins into
  one final record (test: ≤2 requests for create+edit, final record carries
  the second document's hash and vector); every provider request is capped
  at `batchSize` documents; drained by a concurrency-1 worker tail; the
  `domain/changed` callback is synchronous and enqueues identity only.
- **Missed-event/crash recovery (§52.19)** — startup reconciliation is the
  ONLY recovery path: called exactly once from `[Service.init]` (when
  enabled); there is no periodic rescan and no session/disposed/
  api-session/removed cleanup listener anywhere in the module.
- **Reconciliation behavior (§52.20)** — an exactly-valid record is reused
  verbatim with zero provider calls; a stale (hash/profile) or missing
  record is rebuilt; an archived idea is never rebuilt even with a stale
  record (tests over a persisted root with remounts).
- **Post-I/O stale guards (§52.21)** — a late response for an old version is
  dropped instead of persisted (race test: batch 1 delayed + batch 2 failed
  → no record ever exists); a late response cannot recreate a record after
  deletion (race test: request in flight + delete + late success → record
  stays deleted). Stale work is never relabeled: guards compare canonical
  version identity after the I/O, before any put.

## 8. Retrieval semantics (§52.22–§52.25)

- **Candidate-local validation and stale-drop (§52.22)** — every stored
  record is validated candidate-locally against canonical state at retrieval
  time: lifecycle active, the current conversation is neither the idea's
  source discussion nor a hosted continuation, profile id equal, content
  hash equal to the current version's document hash, document version
  current, vector re-validated; any mismatch silently drops exactly that
  candidate (tests: foreign profile / stale hash exclude the broken idea
  without failing its sibling; a failed rebuild leaves the stale version
  excluded; archived ideas excluded). The remount-based corruption pattern
  (dispose → corrupt-on-disk → remount with indexing failing but queries
  served) proves the guards fire on the stored bytes, not on repaired state.
- **`evaluatedVersionId` (§52.23)** — the projection sets it to
  `record.versionId`, the exact indexed version identity that was actually
  embedded; the ranking test pins it to the aggregate's `currentVersionId`
  at index time.
- **Exact scan / top-K (§52.24)** — all eligible records are scored by dot
  product (no ANN, no approximation); ordering: similarity DESC →
  `updatedAt` DESC → `ideaId` ASC; capped at `SEMANTIC_TOP_K = 12` with
  `semanticRank` = 1-based position (test: 3 pinned + 14 fillers → exactly
  12 returned in similarity order, exact-tie broken by updatedAt DESC).
- **Query bounds (§52.25)** — the query input applies exactly the T10 bounds
  (turn ≤ 2000; ≤ 6 recent messages × ≤ 400 chars; empties and unknown
  roles dropped); the query text is the prior visible context then the
  user turn joined as `role: text` lines — nothing else (exact-string
  tests).

## 9. Hybrid fusion and T10 invariants (§52.26–§52.29)

- **RRF (§52.26)** — frozen `RRF_K = 60`; contribution `1/(60+rank)` per
  branch per identity, summed exactly once for dual-branch identities;
  ordering fusedScore DESC → lexical-present first → `bestBranchRank` ASC →
  `ideaId` ASC → `evaluatedVersionId` ASC; dedupe on
  `ideaId + evaluatedVersionId` (same idea, two versions = two entries); no
  raw score of either branch participates (rigged-input test); fusion
  applies no cap — the caller slices `FINAL_JUDGE_POOL_LIMIT = 3`.
- **Judge input unchanged (§52.27)** — judge request candidates carry only
  `{ideaId, evaluatedVersionId}` (test pins the exact per-entry keys and
  that the serialized request contains no `semanticRank`, `fusedScore`,
  `presentInLexical`, or any score); the Judge prompt/parser/service path
  has zero behavioral diff (the only `resurfacing/service.ts` change is the
  verbatim `candidateOf` extraction).
- **Durable-budget downstream equivalence (§52.28)** — budget read →
  detector → evaluate → Judge → Final Delivery Gate → durable claim →
  CLAIMED-only surface is byte-identical to the T10 Persistence Repair
  state; the 38 pre-existing client-resurfacing tests and the judge/
  detector/retrieval-suppression suites pass unchanged.
- **Semantic-call budget pre-gate (§52.29)** — the paid semantic call starts
  only after the durable budget reads free AND the detector admits the turn
  (client test: deferred budget → 0 semantic calls; consumed/failed rigs →
  0 semantic calls; a detector-rejected turn still evaluates lexical with
  exactly the T10 behavior).

## 10. Cancellation, fallback, recall, regressions (§52.30–§52.36)

- **Cancellation (§52.30)** — provider-level: pre-aborted signals throw
  `EmbeddingCancelledError` before any traffic and mid-flight cancellation
  propagates through the timeout controller (never misclassified as an
  ordinary failure); the Remote verb maps it to `gateway/cancelled`.
  Client-level: a composer revision aborts the in-flight semantic call
  (dedicated per-evaluation `AbortController`, distinct from the controller
  lifetime signal; test: `capturedSignal.aborted === true` after
  `notifyInput`, and a late semantic resolution judges nothing); a newer
  user message aborts with expiry `TRIGGER_TURN_NO_LONGER_CURRENT`; dispose
  aborts immediately.
- **Lexical fallback (§52.31)** — a semantic rejection (or any semantic
  failure) surfaces the lexical-only pipeline silently (client test).
- **Semantic-only recall (§52.32)** — with an empty lexical branch, the
  semantic winner flows through the unchanged Judge → claim → surface; with
  `ALREADY_CONSUMED` the surface is silent (client test + variant).
- **Refresh/recreate regression (§52.33)** — the pre-existing persistence
  regressions (reload/recreate flows over the durable `idea/v3.resurfacing_budgets`)
  pass unchanged at the tested SHA.
- **Dual-controller regression (§52.34)** — same-Host dual-controller
  single-winner passes unchanged, plus the new T11 variant where both
  controllers run their semantic branches: exactly one CLAIMED and one
  surface.
- **T9 regressions (§52.35)** — all search/related/reference/read suites
  green; their only diff is the harness-level `ideaSemantic` throwing stub
  (no T9 semantics test modified).
- **T10 regressions (§52.36)** — detector (21), retrieval-suppression (12),
  judge (27) and the 38 pre-existing client-resurfacing tests green and
  untouched.

## 11. Test totals (§52.35–§52.38)

| Bucket | Total | File |
| --- | --- | --- |
| Semantic core (domain/schema/document/profile/vector units) | 19 | `tests/semantic-core.spec.ts` |
| Provider adapter contract | 16 | `tests/semantic-provider.spec.ts` |
| Index lifecycle / coalescing / reconciliation / races | 15 | `tests/semantic-index.spec.ts` |
| Semantic retrieval over the real service | 17 | `tests/semantic-retrieval.spec.ts` |
| Pure RRF fusion | 11 | `tests/resurfacing-hybrid.spec.ts` |
| Client hybrid orchestration (new T11 block) | 8 | `tests/client-resurfacing.spec.tsx` |
| Package exports (+ `/semantic` subpath) | +1 | `tests/package.spec.ts` (14 total) |
| **T11 total** | **87** | 6 new files + 3 extended |

- **Full-suite totals**: pre-T11 **41 files / 625 tests** → at
  `T11_TESTED_EXECUTABLE_SHA` **46 files / 712 tests** (625 + 87).
- Offline seams only: every semantic test runs against the loopback fake
  `/embeddings` server (`127.0.0.1`, ephemeral port) and a stubbed
  credential seam; hybrid/client suites use the existing scripted fakes.

## 12. Static / pre-Full gate results (§52.37)

| Gate | Result |
| --- | --- |
| format/lint | no format/lint script exists in this package (N/A) |
| `generate:typert` | regenerated; zero drift (idempotent output) |
| `typecheck` | clean (0 errors) |
| `build` (host, `tsconfig.build.json`) | clean |
| `build:client` (tsdown) | clean (lib/client.js + map) |
| `git diff --check` | clean (CRLF conversion warnings only) |
| domain/schema drift | zero — `src/spec.ts` / `src/schema.ts` untouched, `idea/v3` unchanged |
| Harness SHA check | `ddefc45fbc7f8e46dd73185e68295696d1297887`, tracked diff zero |

All static gates were executed on the exact amended tree that became
`T11_TESTED_EXECUTABLE_SHA` (see the disclosure in §1).

## 13. Canonical Full (§52.38)

`pnpm test` (vitest, full suite) at the tested tree: **Test Files 46 passed
(46); Tests 712 passed (712)** (27.86 s). This was the last executable
gate; no executable file changed after it (§15).

Disclosure (§1): the first Canonical Full, run on the pre-amendment tree of
the never-pushed commit `b94115e…` (raw-NUL identity-key separator,
runtime-identical), had also passed **46/712**; after the representation
fix, the static gates and this Canonical Full were re-run on the amended
tree, which is the recorded tested content.

## 14. Real provider / public network call count (§52.39)

**Zero.** No real embedding, provider, model, or public-network call was
made anywhere in T11: all suites run against the loopback-only fake
`/embeddings` server bound to `127.0.0.1` on an ephemeral port, the Judge
suite keeps its scripted `FakeLlm`, and no smoke or E2E stage is defined by
the T11 instruction document (none was improvised). No real API key exists
or was used; the credential seam is stubbed in every suite.

## 15. Post-Full executable drift and final git status (§52.42)

**None.** After the Canonical Full the only commits are
`T11_TESTED_EXECUTABLE_SHA` itself (the tested working tree committed
verbatim) and the documentation-only acceptance commit carrying this file
plus the two task-owned T11 input documents. `git diff --stat
T11_TESTED_EXECUTABLE_SHA..HEAD` lists only
`docs/report/DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_ACCEPTANCE.md`,
`docs/architectue/DSH_IDEA_T11_…_ARCHITECTURE_FREEZE_FINAL.md`, and
`docs/implements/DSH_IDEA_T11_…_IMPLEMENTATION_INSTRUCTIONS_FINAL.md`.

Preserved user drift, untouched and unstaged by both commits (§52.41): the
five deleted `docs/DSH_IDEA_*.md` files (moved by the user to
`docs/report/`), the pre-existing `docs/architectue/` and other untracked
`docs/implements/`/`docs/report/` files from earlier rounds.

## 16. origin/main verification (§52.43)

After the acceptance commit, `main` was pushed to `origin` and re-verified:
`git fetch`; `git rev-parse HEAD` == `git rev-parse origin/main`; the
pushed tip is the docs-only acceptance commit whose parent is
`T11_TESTED_EXECUTABLE_SHA` (`a03e5029…`), whose parent is the starting SHA
(`f972c962…`), and `T11_TESTED_EXECUTABLE_SHA..origin/main` contains only
the allowed documentation/report changes.

## 17. Known limitations

- The semantic branch is an accelerator, not a requirement: with the feature
  disabled (the shipped default) or the provider unreachable, resurfacing
  falls back to the T10 lexical-only behavior with a smaller recall radius.
- No cosine threshold, no learned ranking, no ANN index — the exact scan is
  O(records) per retrieval and bounded by top-12 only after scoring.
- Reconciliation runs once at startup; a record that goes stale while the
  Host stays open remains stale (excluded from retrieval) until the next
  Idea change or Host restart.
- No Settings UI and no hot reload for the semantic configuration in T11;
  the config is consumed once into an immutable per-instance snapshot.
- A provider timeout is bounded per request (`timeoutMs ≤ 120_000`); a
  failed indexing attempt is not retried until the next Idea change or
  startup reconciliation.

## 18. Verdict (§52.44)

All required executable gates passed and the final remote verification is
clean:

```text
DSH_IDEA_T11_SEMANTIC_HYBRID_RETRIEVAL_ACCEPTED
```

T11 stops here. T12 is not started.
