# DSH Idea T8 — Library UX and Lifecycle Acceptance Report

Final acceptance record for the `dsh-idea` external Harness plugin, T8 scope
(library lifecycle UX: tabs, hover preview, manual edit, archive / restore /
permanent delete, related-ideas lifecycle filtering), **as repaired by T8R**
(archived evolution preparation boundary — §6.2) **and T8R2** (per-Idea
mutation serialization — §6.3).

## 1. Frozen identities

| Item | Value |
| --- | --- |
| `T8R2_TESTED_SHA` (= current `T8_TESTED_SHA`) | `f2c61c08ce52fd18b11bf6ca6ad83178042962f4` — `fix: serialize idea lifecycle mutations` |
| Superseded T8R candidate | `547cfc8816e9dba3b8d73c1eb7136dc1248bed74` — `fix: block archived idea evolution preparation` (kept in history, not rewritten) |
| Superseded T8 candidate | `4389b0d7b76aaac39fbe13d55863039f51871ca3` — `fix: lift the idea hover card above the settings modal mask` (kept in history, not rewritten) |
| Preceding feature commit | `7da8da81c4803953022f087d5450c00e0e4cf010` — `feat: refine idea library lifecycle` |
| Harness read-only baseline SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| Repository | `Dhandil/dsh-idea` (public), branch `main` |
| Domain name | `idea` (`packages/dsh-idea/src/spec.ts`) |
| Domain version | **3** (unchanged by T8/T8R/T8R2; no schema change) |
| Storage layout | `per-record`; tables `ideas`, `discussions` |

`T8R2_TESTED_SHA` is the executable candidate that produced every result
below. No executable file changed after the E2E run recorded here; the only
commit that follows it is this documentation-only report.

## 2. What T8 shipped

- **Library rows (§2)**: rows carry only title + one-line core + updated time;
  `[当前]` / `[已归档]` tabs as Harness `Pill`s (current = active + dormant,
  archived = archived only); no deleted view; switching is read-only.
- **Hover preview (§3)**: bounded projection card (title, core, current
  conclusion when non-empty, up to three use-when entries, open-question
  count, updated time) with a genuinely clickable `[编辑]` quick action and no
  Permanent Delete. See §6.1: real testing forced the §3 fallback to a
  feature-owned anchored card; Harness itself was never patched.
- **Manual edit (§5–8)**: exactly the seven IdeaDraft fields; Cancel is
  zero-write; Save appends one version (`reason=manual-edit`,
  `sourceDiscussionIds=[]`, one evolution event from→to, `updatedAt` = commit
  time); a normalized no-op is 0 writes / 0 versions / 0 events with
  `updatedAt` unchanged (client disables Save **and** the domain defends
  independently); concurrency via `expectedCurrentVersionId` (conflict → zero
  writes, edits stay visible); archived rejects.
- **Archive / restore (§9–11)**: status + `updatedAt` only — no version, no
  event; idempotent at the expected version; dormant semantics untouched.
- **Permanent delete (§12–16)**: removes aggregate + versions + snapshots +
  events + discussion bindings; no deleted state, tombstone or trash; Harness
  conversations are never erased; exact `RiskConfirmation` copy
  (永久删除 Idea？…已有 Harness 对话不会被删除。此操作无法恢复。+ acknowledgement
  checkbox gating 永久删除); detail-only; ordering guard → verify → delete
  discussions first → aggregate last → guard released in `finally`; a
  process-local guard rejects competing mutations with `deleting`.
- **Remote API (§17–18)**: `IdeaListRequest {view}` partitioning,
  `IdeaManualEditRequest` with canonical `IdeaManualEditResult` (`committed`
  flag), `IdeaArchiveRequest` / `IdeaRestoreRequest` / `IdeaDeleteRequest`,
  minimum-field list rows, dedicated stable `idea/*` wire errors
  (`idea/archived`, `idea/version-conflict`, `idea/not-found`,
  `idea/invalid-draft`).
- **Archived preparation gate (T8R)**: `IdeaEvolutionService.prepare` rejects
  an archived Idea with `IdeaError('archived')` (→ stable `idea/archived`)
  immediately after resolving the Idea aggregate and **before** the
  base-version check, frozen-context validation, any Session surface read,
  route resolution, provider/model call, or proposal registration. UI hiding
  alone was not sufficient: a crafted Remote caller could previously spend a
  model call and mint an ephemeral proposal for an archived Idea (commit would
  still fail). No new wire code, no migration, no other lifecycle change.
- **Per-Idea mutation serialization (T8R2)**: every lifecycle mutation of
  `IdeaService` (`manualEdit` / `archive` / `restore` / `evolve` /
  `continueDiscussion` / `deleteIdea`) runs its **whole turn** —
  authoritative reads, checks, awaits (including the Host
  `createConversation` call), and writes — inside one per-Idea queue slot
  (a `Map<IdeaId, Promise<void>>` serialization tail; no new dependency, no
  schema change). The `deleting` check is an **admission** check: a mutation
  admitted before a delete finishes its slot and the delete re-evaluates
  canonical state behind it, while a mutation arriving after delete
  admission is rejected immediately with `deleting` instead of being queued
  behind it. Delete marks the guard synchronously at admission and releases
  it in `finally`. Queue tails always settle (one rejected mutation never
  poisons later operations) and idle tail entries are removed. `create`
  stays outside the queue (the id does not exist before creation); reads
  stay synchronous. Process-local only — no cross-process claim.
- **Related ideas (§19)**: lifecycle filtering only — archived ideas no longer
  surface as related; verified by tests.
- **Client state (§20–22)**: per-view load states, edit/delete state machines,
  stale async never cross-applies, archive/restore never optimistic, failures
  keep the visible surface (error copy stays; retry keeps the still-valid
  expected version).

## 3. Automated tests, static and build gates

Run in `packages/dsh-idea` at `T8R2_TESTED_SHA`:

| Gate | Command | Result |
| --- | --- | --- |
| Typert generation | `pnpm generate:typert` | pass (host + remote client regenerated) |
| Type check | `pnpm typecheck` | pass (`tsc --noEmit`) |
| Server build | `pnpm build` | pass |
| Client build | `pnpm build:client` | pass (before the test gate) |
| Whitespace | `git diff --check` | pass |
| Unit/integration suite | `pnpm test` | **390 tests / 27 files passed** |

The suite is fully offline: no real provider, network or model call. T8 added
three spec files — `tests/lifecycle.spec.ts` (domain lifecycle),
`tests/remote-lifecycle.spec.ts` (wire lifecycle), `tests/client-lifecycle.spec.tsx`
(tabs, hover preview, editor, archive/restore, delete) — and grew the read /
package suites for the new descriptors and `status`-carrying projections. New
coverage includes byte-level zero-write proofs (`storedBytes`), the no-op
manual edit, idempotent archive/restore, stale-expectation zero-destructive-work
checks, the synchronous `deleting`-guard rejection of five competing mutations,
and wire-projection leakage checks.

T8R2 added four deterministic race tests (386 → 390; Promise gates, no
timing sleeps) in `tests/lifecycle.spec.ts`, `per-idea mutation serialization`:

- **R1 — Continue admitted before Delete**: continue parks at the Host
  `createConversation` seam holding its queue slot; delete admitted behind it
  provably has not completed; a third mutation after delete admission
  receives `deleting`; after release, both operations succeed, the idea is
  absent and **no orphan IdeaDiscussion** exists by conversation id.
- **R2 — Manual Edit admitted before stale Delete**: with the record update
  gated, the edit commits v2 and the delete (expected v1) rejects with
  `version-conflict`, zero destructive work, idea remains at v2. Verified to
  **fail on the pre-T8R2 implementation** (both operations succeeded there)
  and pass on the repaired serialization.
- **R4 — queue survives failure**: one admitted mutation rejecting with
  `version-conflict` does not poison the tail; the next mutation executes
  normally.
- **R6 — cross-Idea independence**: a slow mutation parked on idea A never
  blocks an immediate mutation on idea B (per-Idea, not global).
- **R3/R5 retained**: delete-admitted-first `deleting` rejection of all five
  competing mutations, and the forced storage-failure proof (rejects, never
  reports success, guard released, retry completes) — both kept from T8/T8R.

T8R added four focused tests (382 → 386):

- **evolution.spec.ts, `prepare archived boundary`**: after Continue
  Discussion → Archive, `prepare` rejects with `archived` while spies on
  `sessionQuery.readSurface` / `observeSession`, `agentDefaultModel.currentSelection`,
  `llm.stream` and `proposals.register` prove **zero** session reads, route
  resolutions, model calls and registrations, with `storedBytes` byte-identical;
  and after Archive → Restore the same valid discussion prepares again
  (archive lifecycle gate, not a poison).
- **remote-evolution.spec.ts**: `idea.prepareEvolution` for an archived Idea
  maps onto `idea/archived` with zero model calls and zero durable writes.
- **lifecycle.spec.ts, deleteIdea**: a forced discussion-store delete failure
  (one rejected call on the instance's table handle — no production change)
  makes `deleteIdea` reject instead of reporting success, leaves the Idea
  intact, releases the `deleting` guard in `finally`, and the retry completes.

## 4. Real zero-provider runtime smoke

Re-run fresh at `T8R2_TESTED_SHA` in a separate isolated home/profile
containing **no credentials, no API key and no provider** (profile
`dsh-idea-v1-offline`, bundle list `dsh-base + dsh-web-app + dsh-idea` only),
from a clean offline storage:

- boot: ready marker present; browser opened 设置 → Ideas;
- the two lifecycle tabs rendered (`当前` / `已归档`), no `已删除` tab exists;
- both views showed their empty state (`还没有保存的 Idea…` / `暂无已归档的
  Idea…`), 0 rows each; switching back to 当前 did not refetch the ready view;
- observed activity: `0` model requests, `0` console errors, `0` page errors,
  `0` failed requests; server-side log checked — no model/provider activity.

Result: `ZERO_PROVIDER_SMOKE_PASS`.

## 5. Real-browser / real-model product E2E (§29 A–G, re-run fresh at `T8R2_TESTED_SHA`)

| Item | Value |
| --- | --- |
| Driver | Claude Code → Playwright → Chromium (headless) |
| Target | real Harness `localhost` web app |
| Real E2E profile | `dsh-idea-v1-acceptance` in an isolated `DSH_HOME` |
| Model route | `deepseek-official` / `deepseek-v4-flash` (asserted in-UI) |
| Marker | `DSH_IDEA_T8R2_E2E_2026A1` |
| Storage | fresh isolated acceptance storage reset before the run (server stopped, then sessions / idea storages / workspace store wiped and reseeded) |

Isolation: the E2E used only its isolated home and did **not** use or modify the
user's normal profile; the unrelated plugins (`dsh-better-sidebar`,
`dsh-memory-evolve`, `dsh-super-injector`) were not touched. Temporary E2E
files, browser profiles and auth state live outside the repository and are
**not** committed.

### Scenario results

| # | Scenario | Result |
| --- | --- | --- |
| A | Baseline idea: real conversation → finalized answer → 💡 → extraction → save; library row shows only title / one-line core / 更新于 (no 创建于 / 来源 / conclusion — §2 minimum fields) | **PASS** |
| B | Hover preview: bounded card (title, core, use-when entries ≤ 3, 待解决问题 count, 更新于), no Permanent Delete in the card, and the card's 编辑 quick action opens the editor without row navigation; after the manual edit the card's conclusion line updates | **PASS** |
| C | Manual edit: ≥ 2 fields (title + current conclusion); Save disabled before any edit; v1 kept (初次保存, original title) + v2 appended (手动修改, edited title) shown as 当前版本 v2; content persisted across a full reload | **PASS** |
| D | Archive: detail flips to 已归档 with only 恢复 / 永久删除 (no 编辑 / 继续讨论 / 归档 / 生成演化提案); the row leaves 当前 (empty state) and appears under 已归档 | **PASS** |
| E | Restore: archived detail offers no Edit/Continue; 恢复 returns the idea to 当前; 已归档 becomes empty | **PASS** |
| F | Continue-discussion regression (host-authoritative): the Host created exactly **one** new workspace-attached session (`session-d445535a-…`, verified against the workspace store and the opened URL); the real model answered the frozen-seed marker `DSH_IDEA_T8R2_E2E_2026A1` | **PASS** |
| G | Permanent delete: exact dialog copy (将永久删除该 Idea、所有版本… 已有 Harness 对话不会被删除。此操作无法恢复。); 永久删除 disabled before the acknowledgement checkbox; 取消 = zero mutation (idea still present); after confirmation the idea is absent from both views, and **both** Harness conversations (original + continuation) survive — workspace store keeps both session ids and both conversations still render their content | **PASS** |

### Browser console / network

`consoleErrors: []`, `pageErrors: []`, `failedRequests: []` — an entirely clean
final run across all scenarios.

### Execution notes (§31: repair history and T8R/T8R2 re-runs disclosed)

1. **T8 runs 1–6 (at `7da8da8` → `4389b0d`)** — run 1 exposed the hover-card
   product defect (§6.1), repaired in `4389b0d`; runs 2–5 were driver- or
   environment-only repeats (idempotent library open, storage reset order,
   tab-pill vs row assertion, delete-cancel landing on the detail); run 6
   passed A–G cleanly at `4389b0d`.
2. **T8R re-run (at `547cfc8`)** — after the archived-prepare repair, the full
   A–G suite was re-run **once**, from a freshly reset isolated acceptance
   storage, against the real model: **every scenario passed on the first
   attempt**; `consoleErrors: []`, `pageErrors: []`, `failedRequests: []`.
   Scenario D additionally verified
   visually that the archived detail exposes only 恢复 / 永久删除 — no 编辑,
   no 继续讨论, no 生成演化提案.
3. **T8R2 re-run (at `f2c61c0`)** — after the per-Idea mutation serialization
   repair (§6.3), the zero-provider smoke and the full A–G suite were re-run
   **once**, from a freshly reset isolated acceptance storage, against the
   real model: **every scenario passed on the first attempt**;
   `consoleErrors: []`, `pageErrors: []`, `failedRequests: []`. All results
   above are from this run. The serialization races themselves are proved by
   the deterministic service tests (§3), not through browser UI.

### Real provider call disclosure

The E2E exercised the real `deepseek-official` route for: conversation replies,
Save-Idea extraction, and the continuation seed answer. The key was read from
the user's existing local credentials file into the process environment for the
acceptance boot only. It was **never** printed, echoed, logged, written to a
file, or committed; boot-log output was redacted (`token=REDACTED`) before any
artifact was stored, and the token-bearing boot logs were deleted at cleanup.

## 6. Defects found and repaired

### 6.1 Hover preview unreachable inside the settings modal (`4389b0d`, T8)

The T8 hover card used the Harness `HoverCard` primitive, whose portaled card
sits at `z-index: 100`. The Ideas library lives inside the settings dialog,
whose Modal layer is `z-index: 1000` with a full-viewport mask — so the card
rendered beneath the mask and its quick action could never receive a press
(found by the real-browser run; a human user would hit the same wall). Per the
T8 instruction the Harness checkout was **not** patched; the §3-sanctioned
fallback shipped: a feature-owned anchored hover card
(`src/client/hover-card.tsx`) that keeps the primitive's interaction contract
(dwell → open, pointer grace → close, fixed placement at the anchor's right
edge with a bottom clamp, press-on-card keeps it mounted) but rides at
`z-index: 1001`, above the modal mask. Covered by two new unit tests (portal +
clickable quick action; grace close); all gates, the suite, the zero-provider
smoke and every E2E scenario were re-run at the repaired SHA.

### 6.2 Archived Idea could still reach model-backed evolution preparation (`547cfc8`, T8R)

Remote review found that the accepted UI correctly hides 生成演化提案 from
archived Ideas and the domain correctly rejects archived commits — but the
Host preparation path (`idea.prepareEvolution` → `IdeaEvolutionService.prepare`)
resolved the discussion and aggregate and then proceeded straight into the
Session read, model-route resolution, real LLM extraction and ephemeral
proposal registration. A crafted Remote caller could therefore spend a model
call and mint a proposal for an archived Idea (commit would still fail). The
repair inserts the lifecycle gate immediately after resolving the Idea
aggregate and before every expensive stage (`archived` → stable
`idea/archived` mapping; no new wire code). Proof: the four focused tests in
§3 (zero session reads / route resolutions / model calls / registrations /
writes on an archived Idea; preparation works again after Archive → Restore;
existing archived-rejection regressions for manualEdit / continue / evolve
commit unchanged), plus the fresh runtime evidence in §4–§5. `4389b0d` is
superseded as the accepted executable candidate; history is kept, not
rewritten.

### 6.3 Lifecycle mutations were not serialized across their whole turn (`f2c61c0`, T8R2)

Remote review found that the T8 process-local `deleting` Set only rejected
mutations that *began* after Delete had acquired the guard — it did not
serialize Delete against mutations admitted immediately before Delete and
still in flight. Two concrete races followed from lifecycle operations
spanning more than one storage job (read → external await → writes) while the
Harness storage domain's per-domain write chain serializes only the
put/delete/update slots themselves:

- **Race A — continue-before-delete orphan**: `continueDiscussion` passed the
  deleting check and then awaited the Host `createConversation`; Delete ran
  to completion in that window (it saw no binding yet), and Continue then put
  an `IdeaDiscussion` from its stale pre-delete snapshot — an orphan binding
  for a deleted Idea.
- **Race B — stale delete erasing a new version**: `manualEdit` enqueued
  `records.update` (v1→v2); Delete read the in-memory v1 snapshot, passed the
  expected-version check, and queued `records.delete` behind the update. Both
  operations succeeded — not a serializable outcome, and optimistic version
  protection did not actually hold across the complete service operation.

The repair encloses the **whole turn** (authoritative reads, checks, awaits —
including the Host `createConversation` call — and writes) of every lifecycle
mutation (`manualEdit` / `archive` / `restore` / `evolve` /
`continueDiscussion` / `deleteIdea`) in one per-Idea serialization tail
(`Map<IdeaId, Promise<void>>`; no new dependency, no schema change). The
`deleting` check is an **admission** check: earlier admitted mutations finish
their slots and Delete re-evaluates canonical state at its own turn (stale
expected version → `version-conflict`, zero destructive work; earlier
binding → enumerated and removed before aggregate deletion), while mutations
arriving after Delete admission are rejected immediately with `deleting`
instead of queueing behind it. Delete marks the guard synchronously at
admission and releases it in `finally`. Tails always settle (one rejected
mutation never poisons later operations), idle tail entries are removed, and
`create` stays outside the queue (the id does not exist before creation);
reads stay synchronous. Process-local only — no cross-process claim.

Proof: the four deterministic race tests added in §3 (R1 continue-before-
delete leaves no orphan binding; R2 stale delete after an admitted edit gets
`version-conflict`, verified to fail on the pre-T8R2 implementation where
both operations succeeded; R4 queue survives a rejected mutation; R6
cross-Idea independence; R3/R5 retained), plus the fresh runtime evidence in
§4–§5. `547cfc8` is superseded as the accepted executable candidate; history
is kept, not rewritten.

`git -C <harness-checkout> rev-parse HEAD` =
`c291e7961a515f6d7af9304e7fd1d257929aef26`, identical before and after
acceptance. No tracked file in the Harness checkout was modified; the only
untracked entries are pre-existing T0 investigation scratch files.

## 8. Runtime cleanup record (§30, re-verified after the T8R2 re-run)

- Acceptance and smoke servers stopped; the listening child on `:3080` was
  force-killed and the port verified released (`PORT_3080_RELEASED`).
- The E2E browser is closed by the driver's `finally` block; no headless
  Playwright/Chromium process remains (verified via command-line inspection).
  Unrelated user browser windows were **not** touched.
- Token-bearing temporary boot logs were deleted; redacted evidence
  (snapshots, screenshots, result JSONs) remains outside the repository and is
  not committed.

## 9. Non-goals respected

No PAH / Memory / Knowledge integration, no cross-sync or auto-detection, no
proactive resurfacing, no embeddings, no Idea Graph, no merge/split, no tags or
folders, no collaboration, no deleted list, no auto Project creation, no auto
editing. The dormant status semantics were not redesigned.
