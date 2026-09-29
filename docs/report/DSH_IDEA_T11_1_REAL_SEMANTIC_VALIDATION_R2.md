# DSH Idea T11.1 Real Semantic Validation R2 — Report

- Outcome: **`REAL_SEMANTIC_VALIDATION_R2_PASS`**
- Date: 2026-09-29
- Baseline (verified before any real request): dsh-idea accepted HEAD = `95a4e2347b8222e5e8d20b253bd8333a61c963a1`; T11.1 tested executable = `1afd6f0d5f8adda709709f645918229f59dd575a` (last commit touching `packages/`; working tree under `packages/` has zero drift; built `lib/` contains the T11.1 selector); Harness read-only = `ddefc45fbc7f8e46dd73185e68295696d1297887` with zero tracked diff.
- R1 basis: `DSH_IDEA_T11_1_REAL_SEMANTIC_VALIDATION_R1.md` (`REAL_SEMANTIC_VALIDATION_PARTIAL`, 2026-09-28). R2 addressed both R1 blockers: request budget overrun (no Agent Loop was run at all this time) and Idea-home contamination (storage moved outside any repository tree; no agent existed to traverse it).
- Protocol authority: `docs/architectue/DSH_IDEA_T11_1_REAL_SEMANTIC_VALIDATION_R2_PROTOCOL_FREEZE.md`.

## 1. Result summary

All three R2-A scenarios produced real-provider evidence, and R2-B demonstrated the complete positive delivery chain — real Judge `SURFACE` → Final Delivery Gate → durable `CLAIMED` → visible UI strip — through the explicitly labeled `real-provider + synthetic-event UI integration` path. The shared hard cap of 12 real provider requests was respected: **10 attempted, 10 delivered, 0 denied, 0 failed** (3 of the 10 requests — n=1, n=7, n=8 — came from 2 superseded test runs, disclosed in §5). Isolation, cleanup, and zero-drift checks all passed. No product defect was found; no product or Harness file was modified.

Truthful scope boundary (per freeze): R2-A is a direct Host/Remote validation, **not** a full interactive product smoke test; R2-B used a synthetic completed-turn event feed, **not** an authentic completed Agent turn. Neither claim is made.

## 2. Environment and route (discovered, not assumed)

- Provider route observed on **every** captured request: `POST https://api.deepseek.com/anthropic/v1/messages`, `model: deepseek-flash` (guard ledger fingerprint, all 10 entries). This matches the deployment default `agent-default-model: deepseek-official / deepseek-flash / reasoningEffort: high` (isolated home's verbatim copy of the user's `settings.yaml`). Selector and Judge calls are plugin-source LLM calls (`source.kind: 'plugin'`), routed per-Session through `resolveModelRoute` — no session ever received a user message, and every session was renamed immediately after creation, which pins the title and permanently disables provider title generation (verified: **zero** title requests in the ledger; `session-title-first-prompt-llm` never fired).
- `semantic.mode = llm`: shipped bundle patch (`dsh-idea-semantic` config `mode: llm`) applied verbatim; the disposable profile's own patch layer is empty; no `idea_semantic` storage dir was ever created (the llm-mode signature).

## 3. Hard request budget guard (gate 4/5)

- Implementation: `budget-guard.cjs`, a preload (`NODE_OPTIONS=--require`) installed **only in the disposable server process**. It wraps `globalThis.fetch` synchronously before dispatch; every outbound request whose host is `*.deepseek.com` is atomically reserved against `R2_REAL_PROVIDER_REQUEST_CAP = 12`; a would-be 13th request **throws before the original fetch is invoked**, so nothing is sent. Every reserve/denial/delivery is appended synchronously to a ledger file; non-provider hosts pass through uncounted but are logged. The ledger stores only redacted fingerprints (model, purpose, message count, body size) — no bodies, no credentials.
- Coverage: the Harness server composes in a single Node process (CLI → profile boot → webserver → LLM adapters); the deepseek adapter and the title generator both dispatch through `globalThis.fetch`, so chat steps, title, selector, Judge, and any internal retry all cross the guard. Internal retries were additionally disabled at the rig layer: the isolated home's `settings.yaml` (rig-only) sets `llm-deepseek.retryPolicy: { mode: normal, maxRetries: 0 }`.
- Offline self-test (`R2_BUDGET_GUARD_OFFLINE_SELFTEST: PASS`, fake transport, zero network, zero real budget): 12 provider calls pass; would-be calls #13–#15 and a URL-object call are denied pre-dispatch (transport saw exactly 12); a non-provider host passes through uncounted after the cap; ledger shows `attempted=12 delivered=12 denied=4 passthrough=1` and never contains request bodies.
- Runtime proof: boot log line 1 is `[r2-budget-guard] armed: cap=12 …`; final ledger = 10 attempted / 10 delivered / 0 denied / 0 failed (§5). No automatic retry occurred anywhere (each attempted `n` has exactly one terminal `delivered` line).

## 4. Isolation (gate 2/3)

- Disposable home `C:\Users\EDY\dsh-r2-home` and test workspace root `D:\dsh-r2-ws` sit on **different drives** — disjoint roots, neither an ancestor of the other, unreachable by relative traversal from any project workspace. The home is outside every repository tree (fixing R1's `build/r1-home` flaw). No full-agent experiment was run (R2-A forbids `user/message`; R2-B has no agent at all), so no agent tool could ever touch the Idea home.
- Contents: `settings.yaml` (user's file copied verbatim + rig-only retry-disable block), `.credentials.yaml` copied verbatim (never printed), disposable profile `dsh-idea-t11-r2` (bundle list `dsh-base`, `dsh-web-app`, `dsh-idea`; junction `node_modules/@dsh-external/dsh-idea` → the tested `packages/dsh-idea`), and 7 synthetic Ideas.
- Ideas were seeded through the canonical `IdeaService.create` path (vitest rig over the real storage stack, storage root = the isolated home's `storages/`), zero model calls. Seed manifest: `rag-chunking` (`idea_d34979b2-e24b-4383-b45d-49906980e740`), `postgres-notes`, `rogue-values`, `platformer-feel`, `windows-env` (`idea_0c7bd1c1-70ba-4c34-b812-9da90027e187`), `seam-taping`, `crossborder-pricing` — all synthetic content, synthetic source session ids.
- Sessions: 4 (R2-A) + 1 (R2-B rig), all created via `session/create` and pinned via `session/rename`. Legal identities; no user data; no real `~/.dsh` mount or write (§8).
- No FakeLlm anywhere: the selector/Judge calls ran through the real `IdeaSemanticService` / `IdeaResurfacingService` in the real server process against the real provider.

## 5. Real request ledger (the decisive numbers)

Guard ledger, verbatim mapping (all `attempted` lines are pre-dispatch reservations; every one has exactly one terminal `delivered` line; `denied=0`, `failed=0`):

| n | UTC time | Stage | Session | System len | Body bytes | Delivered | Result |
|---|---|---|---|---|---|---|---|
| 1 | 01:26:36.577 | A-selector (pre-corpus-fix, **superseded**) | session-4023a63c | 816 | 15981 | 200 | rag-chunking v1, semanticRank 1 |
| 2 | 01:29:39.040 | A-selector (valid run) | session-3acb34b6 | 816 | 15931 | 200 | rag-chunking v2, semanticRank 1 |
| 3 | 01:29:40.277 | A-judge | session-3acb34b6 | 1162 | 14339 | 200 | `surface / RESTORES_FORGOTTEN_DIRECTION` |
| 4 | 01:29:41.904 | B-selector | session-43a5c0ee | 816 | 16005 | 200 | windows-env, semanticRank 1 |
| 5 | 01:29:42.998 | B-judge | session-43a5c0ee | 1162 | 14553 | 200 | `surface / ADDS_MISSING_OPTION` |
| 6 | 01:29:45.049 | C-selector | session-255befec | 816 | 15915 | 200 | `[]` (Judge correctly skipped, 0 model) |
| 7 | 01:33:39.796 | R2-B selector (first rig run, **superseded**) | (rig session) | 816 | 15943 | 200 | rag-chunking v2 recalled |
| 8 | 01:33:41.090 | R2-B judge (first rig run, **superseded**) | (rig session) | 1162 | 14339 | 200 | `surface` → CLAIMED (test-side assertion failed afterwards) |
| 9 | 01:34:24.921 | R2-B selector (final) | session-4063bfa7 | 816 | 15943 | 200 | rag-chunking v2, semanticRank 1 |
| 10 | 01:34:25.825 | R2-B judge (final) | session-4063bfa7 | 1162 | 14339 | 200 | `surface / RESTORES_FORGOTTEN_DIRECTION` |

**Total: 10 attempted / 10 delivered ≤ 12 cap.** The 2 superseded test runs consumed 3 real provider requests (n=1, n=7, n=8); they are validation-driver corrections, not product events: n=1 ran before a synthetic-corpus repair (below), and n=7/8 belonged to a rig run whose React assertion (`getByText` on a text node split across elements) failed after the product behavior had already completed correctly; the run was repeated on a fresh session rather than repaired in place. Budget reads: `getResurfacingBudget` was `consumed: false` before and after every R2-A stage, and `false` before the R2-B claim.

## 6. R2-A — scenario evidence (direct Host/Remote calls; no Agent Loop, no title)

Offline prechecks were run first over the same Remote API (deterministic, zero model): they establish each scenario's lexical expectation before any real spend.

- **A — lexical miss / semantic hit** (initial corpus made the query lexically positive — the seeded `rag-chunking` text echoed the query phrase, `score 129` above floor; corrected via the canonical `idea/manualEdit` product path, zero model, new pinned version `idea_ver_42faf704-6aba-431e-bdaf-eb2f5ab3fad3`). After the fix: `evaluateResurfacing` → `stop: NO_ELIGIBLE_IDEAS`, all 7 ideas `BELOW_RETRIEVAL_FLOOR` → lexical branch empty. Real selector: exactly `idea_d34979b2` (`rag-chunking` v2) at `semanticRank 1`, `evaluatedVersionId` pinned to the current version, revalidation survived. This replicates R1-A2's core result (lexical-empty corpus, semantic rank-1 recall) with a different disposable profile and a clean corpus. Targeted real Judge: **`surface / RESTORES_FORGOTTEN_DIRECTION`** — the positive verdict R1 could not obtain (R1's Judge saw agent-self-discovered content; no agent exists here).
- **B — hybrid** (fresh session): `evaluateResurfacing` → 3 lexical candidates above floor: `windows-env` score 102 (rank 1), `seam-taping` 15, `rag-chunking` 14. Real selector: `windows-env` at `semanticRank 1` (pinned `idea_ver_6f0d6ffa-…`); the two distractors were not recalled. Targeted real Judge over the pool: **`surface / ADDS_MISSING_OPTION`**. Lexical and semantic branches agree on identity and rank; the disagreement case (model rejecting a lexically strong candidate) did not arise and none was forced.
- **C — unrelated context** (fresh session, detector-admitted DECISION_POINT turn about bread fermentation): `evaluateResurfacing` → `NO_ELIGIBLE_IDEAS` (all 7 below floor); real selector returned `[]`; per protocol no Judge input existed and none was manufactured. The product-level expectation (no inappropriate surface) holds: with an empty fused pool the client trigger is dropped.

All calls went through the existing `IdeaRemoteService` endpoints (`/api/idea/evaluateResurfacing`, `/api/idea/semanticResurfacingCandidates`, `/api/idea/judgeResurfacing`) — canonical eligibility, version pinning, and validation were never bypassed.

## 7. R2-B — positive delivery (`real-provider + synthetic-event UI integration`)

Rig: the real client controller `IdeaResurfacingController` (unmodified product code, imported from the tested build tree) in a jsdom harness, with the same `FakeWindow` event-window shape as the accepted client test suite, and the `ResurfacingRemoteFace` wired over authenticated HTTP to the real running server — so the budget read, lexical evaluation, T11.1 llm selector, T10 Judge, and the durable claim are all genuine Host operations. **The `user/message` + `turn/end completed` + settled-reply feed is synthetic; this is not an authentic completed Agent turn.** No Idea storage was exposed to any tool (there is no agent); the settled reply is natural conversational text containing none of the target Idea's content.

Sequence on fresh session `session-4063bfa7`:

1. `getResurfacingBudget` → `consumed: false`.
2. Synthetic trigger: detector-admitted memory-gap user turn + `turn/end completed`; the Assistant reply settles **after** the completed turn (exercising the settlement path).
3. Controller ran the hybrid branches: lexical `NO_ELIGIBLE_IDEAS` (empty), real selector (n=9) → `rag-chunking` v2 `semanticRank 1`; fused pool non-empty → Judge (n=10) independently returned **`surface / RESTORES_FORGOTTEN_DIRECTION`** (a genuine provider decision — no verdict was forced, no rule weakened).
4. Final Delivery Gate passed → `claimResurfacingBudget` → **`CLAIMED`** → suggestion published with the pinned reference (`@[长文档语义分块与召回策略](dsh-idea:…)` encoded descriptor, version `idea_ver_42faf704-…`).
5. UI: `IdeaResurfaceStrip` rendered; `section.dsh-idea-resurface` present in the DOM with visible text 「💡 以前保存过一个可能相关的 Idea：「长文档语义分块与召回策略」 查看引用/忽略」.
6. Exactly-one consumption: post-claim `getResurfacingBudget` → `consumed: true`; a second direct `claimResurfacingBudget` → **`ALREADY_CONSUMED`** — both with zero model calls.

The latest-trigger/draft-version gate and revalidation races are covered by the accepted unit suite; this run exercised the real end-to-end positive path over them.

## 8. Untouched-data and drift proofs

- Real `~/.dsh`: full recursive manifest (29,111 entries: name/size/mtime) captured before boot and re-captured after cleanup — **byte-identical diff, empty**; `settings.yaml` SHA-256 unchanged (`C1833470B2B6…E4EFB` both times). The isolated home never mounted or wrote it.
- dsh-idea `packages/` tracked drift: **zero** (all rig files lived under gitignored `packages/dsh-idea/build/r2/`, deleted at cleanup). The only working-tree changes remain the user's pre-existing docs reorganization.
- Harness tracked diff: **zero** (`git status --porcelain` clean apart from pre-existing untracked logs).
- No commit, no push, no T12 work, Canonical Full not rerun (R1's 49 files / 776 tests stand as the executable baseline).

## 9. Cleanup (all R2-owned, verified after attribution)

Server stopped; port 18791 verified released (no TCP connection); no surviving rig process. Deleted: `C:\Users\EDY\dsh-r2-home` (isolated home incl. profile, junction, ideas, session transcripts, logs), `D:\dsh-r2-ws`, `packages/dsh-idea/build/r2/` (seed rig, detect rig, client rig, vitest configs), offline self-test temp dirs, and the rig directory `D:\Harness\r2-rig` (guard, drivers, ledger, manifests, boot log — contents quoted in this report). Pre-existing user files elsewhere untouched.

## 10. Findings handed to architecture review (non-defects)

1. **Corpus-authoring hazard in scenario design**: a validation corpus that echoes its own query phrase silently turns a "lexical miss" scenario into a hybrid one. The offline precheck caught it before real spend beyond one call (n=1). Future rigs should assert lexical-floor expectations before the first real selector call (R2's driver now does; R1's did not).
2. **R1's Judge-redundancy finding stands clarified**: with no agent in the loop (direct or synthetic-event path), the real Judge accepts the same target (`RESTORES_FORGOTTEN_DIRECTION`) that R1 saw rejected as `REDUNDANT_WITH_CONTEXT`. The R1 rejection was an artifact of agentic self-discovery filling the assistant context, not of Judge miscalibration.
3. The budget guard is a rig-only preload over `globalThis.fetch`; product behavior is unchanged and uninstrumented. Any future full-agent real-provider validation must reuse this pattern (proven atomic interception + per-step budgeting), since this Harness build's agent loop costs ~6 requests per message plus a title.

## 11. Verdict

`REAL_SEMANTIC_VALIDATION_R2_PASS` — scenarios A, B, and C have documented real-provider evidence through the existing Host/Remote path with hard-cap compliance (10/12, zero overrun, zero retries); the positive chain (real Judge `SURFACE` → Final Delivery Gate → durable `CLAIMED` → visible UI strip → `ALREADY_CONSUMED` on second claim) was demonstrated through the disclosed `real-provider + synthetic-event UI integration` seam with no forged verdict and no product or Harness modification. Isolation, cleanup, and zero-drift proofs are complete. No product defects found. This report is final for R2: no commit, no push, no T12 — awaiting architecture review.
