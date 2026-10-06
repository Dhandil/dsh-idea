# DSH Idea T13.1 — Resurfacing Preference Implementation Acceptance Report

- Outcome: **`T13_1_RESURFACING_PREFERENCE_ARCHITECTURE_ACCEPTED` (`T13_1 = CLOSED`)** — final review: `docs/architectue/DSH_IDEA_T13_1_FINAL_ARCHITECTURE_REVIEW.md`
- Date: 2026-10-02 (repair #2 addendum: 2026-10-05; test-evidence closure: 2026-10-06; final architecture acceptance: 2026-10-06)
- Baseline: origin/main `afa6ae2e570b36241503008d52e7f3e165021d10` (= T12.4 docs closure; the previous Accepted Executable is T12.3's `61e1eed…`); Harness `ddefc45…` read-only, tracked diff zero throughout.
- Architecture authority: `docs/architectue/DSH_IDEA_T13_RESURFACING_PREFERENCE_ARCHITECTURE_FREEZE.md` (D1–D10).
- **Tested executable (this task): test-evidence closure commit `eb7677045e3d224b3603e7a7ad7313ea299abefc`** — the Canonical Full ran on exactly this test set (tests-only change over repair #2's `8cad7b2…`; zero product `src/` drift; zero post-Full drift). **Final Accepted Tested SHA = `eb7677045e3d224b3603e7a7ad7313ea299abefc`** (per the final architecture review).

## 1. What was implemented

**Host domain (`src/schema.ts`, `src/spec.ts`, `src/types.ts`, `src/service.ts`)**

- New additive table `resurfacing_preferences` keyed by `IdeaId` with the minimal canonical record `{ muted: true }` (`resurfacingPreferenceSchema`). Absence = enabled; presence = muted. Same additive category as `resurfacing_budgets` — version stays 3, `compatibleVersions = [1, 2]`, no migration, no aggregate rewrite (D2/D3).
- `IdeaService.getResurfacingPreference(ideaId)`: synchronous authoritative read; unknown Idea → `idea/not-found`; absence → `{ muted: false }`; record → `{ muted: true }`; detached; zero writes (D4).
- `IdeaService.setResurfacingMuted(ideaId, muted)`: validates existence; serializes through the existing per-Idea mutation tail (`enqueueIdeaMutation` → `rejectWhileDeleting`); `true` puts the record, `false` deletes it; both idempotent (D4).
- `IdeaService.listResurfacingMutedIds()`: one synchronous read returning the muted Idea-id set, for the resurfacing candidate paths to filter with.
- Preference mutations never touch the aggregate: no `updatedAt`, no version, no evolution event, no semantic re-index (the domain/changed event carries table `resurfacing_preferences`, not `ideas`) — regression-tested (D4).
- `deleteIdea` cleans `resurfacing_preferences[ideaId]` inside the existing per-Idea delete serialization, ordered before the final aggregate deletion; cleanup failure propagates and fails the delete; a post-delete mute is rejected with `idea/not-found` (D5).

**Suppression (`src/resurfacing/{types,service}.ts`, `src/semantic/service.ts`)**

- New `ResurfacingHostSuppressionReason` and wire `IdeaResurfacingSuppressionReason` value `USER_MUTED`.
- T10 lexical `evaluate`: the corpus loop checks `listResurfacingMutedIds()` before scoring — muted Ideas are excluded from the pool and appear in the suppressed list with reason `USER_MUTED`; the entries are carried into `allSuppressed` on BOTH the empty-corpus early return and the normal path (this was the round-1 review gap, fixed).
- T11 embedding branch: muted Ideas are excluded from the eligible set before the loop — an all-muted eligible set means the query embedding is never dispatched (zero provider calls).
- T11 llm-selector branch: muted Ideas are excluded from the corpus before the empty-corpus early exit — an all-muted corpus means the selector call is never dispatched (zero provider calls).
- Hybrid fusion / Judge input: the Judge only sees what the branches produced; a muted Idea can never reach it (D6).

**Wire (`src/remote-host/{types,service}.ts` + typert)**

- `IdeaDetail` gains `resurfacingMuted: boolean` (projected in `idea.get` from the Host preference read — no extra round trip).
- New `idea.setResurfacingMuted({ id, muted })` → `{ muted }` (cancellable, Host revalidates identity: `idea/not-found` / `deleting`). The browser never writes storage tables (D9).

**Client**

- **Conversation strip** (`IdeaResurfaceStrip.tsx`): the dismiss copy changes 忽略 → **本次忽略** (Dismiss this time); a new **暂停提醒** button calls the Host durable mute. On success the suggestion disappears with `lastExpireReason='USER_MUTED'`. On failure: no pretend-pause, no silent dismiss — the suggestion stays, a visible `暂停失败，请重试。` affordance shows, and the pause button serves as retry (D1/D7).
- **Controller** (`resurfacing-state.ts`): `pauseReminders()` calls the Host mute with the canonical `suggestion.ideaId`; `pauseInFlight` prevents concurrent pause writes; `pauseFailed` surfaces failure; the internal `mutedIds` set additionally protects the current conversation; the Host-side suppression handles all other conversations (D7).
- **Settings detail** (`IdeaSection.tsx` + `read-state.ts`): the detail view renders the reminder preference (提醒：已开启 [暂停提醒] / 提醒：已暂停 [恢复提醒]) for active Ideas; the toggle calls the Host mute and updates the projected detail state on success; on failure the error affordance shows and the preference stays unchanged. Dormant/archived Ideas show no control (dormant semantics unchanged). Archive/restore preserve the mute; only permanent delete clears it (D8).
- Root-scoped surfaces (from T12.3) — the library save/quick surfaces outlive section unmount; the reminder control is read from the detail projection, which the read surface refreshes after the mutation.

## 2. Verification (binding order)

1. **Focused Tests** (new + updated):
   - `tests/resurfacing-preference.spec.ts` (11): absent=false; mute persists; restart persists; unmute deletes; idempotency both directions; unknown Idea rejects (get+set); archive/restore preserves; permanent delete cleans; mute-vs-delete serialization; unmute-vs-delete serialization; no aggregate updatedAt/version drift; no semantic-reindex trigger (domain/changed carries the preference table, not ideas).
   - `tests/resurfacing-mute-suppression.spec.ts` (6): T10 lexical USER_MUTED suppression + all-muted → NO_ELIGIBLE_IDEAS before Judge; T11 selector all-muted → zero provider calls; non-muted → exactly 1 call; T11 embedding all-muted → zero query embedding.
   - `tests/reminder-control.spec.tsx` (5): Settings detail reminder control — pause/resume round-trip; failure surfaces error without pretending success; stale async cannot cross-apply.
   - `tests/quick-capture-panel.spec.tsx` (7): conversation panel IA regression (title, footer, capture, back, draft preservation/cleanup, pendingUnclear survival, late-handoff cancel) — unchanged from T12.3.
   - Updated: `client-resurfacing.spec.tsx` (忽略 → 本次忽略, pauseReminders wired); `remote-read/service/client/semantic-core` specs (wire projections + descriptor lists + domain table lists).
   - **Focused total: 17 files / 285 tests green.**
2. **T8/T9/T10/T11/T12 regression** — full package suite: **54 files / 844 tests, all green**.
3. **Architecture / Scope Audit** — initial implementation diff `afa6ae2… → c001a4b…`: **34 files (+1021/−18)** = 17 src + 15 test files (12 modified + 3 new) + 2 docs, all inside `packages/dsh-idea/` plus the freeze doc; no Harness/migration/domain-bump/Quick-Cache/T12 R1-R10/T9-codec/T11-ranking changes.
4. **Static Gates** — typert regenerated (`setResurfacingMuted` wire shape), `tsc --noEmit` zero errors, host build + client build successful.
5. **Canonical Full (exactly one fresh run)** — `vitest run --no-file-parallelism`: **57 files / 866 tests, all green** (includes the new preference/suppression/reminder-control specs), executed after the final build with **zero executable drift** after it (lib mtime unchanged post-Full). — *Initial T13.1 implementation historical verification (superseded by the AUTHORITATIVE FINAL CANONICAL FULL in §4c).*

## 3. Change list

Initial implementation diff `afa6ae2… → c001a4b…` (34 files, +1021/−18): modified (29) — 17 src (`src/schema.ts`, `src/spec.ts`, `src/types.ts`, `src/service.ts`, `src/resurfacing/{types,service}.ts`, `src/semantic/service.ts`, `src/remote-host/{types,service}.ts`, `src/client/{resurfacing-state,IdeaResurfaceStrip,IdeaSection,index,locales,styles,read-state,state}.tsx/ts`) and 12 spec files; new (3 test files) — `tests/resurfacing-preference.spec.ts`, `tests/resurfacing-mute-suppression.spec.ts`, `tests/reminder-control.spec.tsx`; docs (2, new) — the freeze doc + this report. Build artifacts (`lib/`) remain gitignored.

## 4. Concurrency / lifecycle verification

| Scenario | Verified |
|---|---|
| mute vs mute concurrent | idempotent (same record put) |
| mute vs unmute concurrent | per-Idea mutation tail serializes |
| mute vs permanent delete | delete admitted → mute rejected with `deleting` |
| unmute vs permanent delete | same serialization |
| delete admitted → preference write rejected | yes (`deleting`) |
| archive/restore preserves mute | yes |
| restart preserves mute | yes (json-backed root reopen) |
| old v3 store without preference table | additive table, no migration, opens normally |
| no semantic-index provider call from mute | domain/changed carries `resurfacing_preferences`, not `ideas` |
| no aggregate updatedAt/version drift | regression-tested |

## 4a. Architecture Review Repair #1 (R1–R4, 2026-10-02)

The architecture review required R1–R4. Repair #1 (commit `a7eb018…`) landed the Host-side R1-A/B/C items; the client-side completion of R1-D, R2, R3, and the missing R4 tests are attributed to repair #2 (§4c), which is the authoritative Tested SHA.

- **R1-A/B — Judge mute revalidation**: `judge()` now re-reads `listResurfacingMutedIds()` BEFORE any model dispatch (R1-A) and again after the provider call before returning a surface verdict (R1-B). A muted winning Idea produces fail-closed `outcome: none` with `dropped: [{ideaId, reason: 'USER_MUTED'}]` — the model's surface verdict is discarded, and the wire `ResurfacingDropReason` / `IdeaResurfacingSuppressionReason` vocabularies gain `USER_MUTED`.
- **R1-C — semantic post-I/O revalidation**: the llm-selector filters `revalidateSelectorPicks` results against the post-call muted set; the embedding branch filters the eligible set after the query embedding resolves. A muted Idea from a stale corpus can never reach the Judge.
- **R1-D — claimResurfacingDelivery seam** (Host side in repair #1; client completion in §4c): `IdeaService.claimResurfacingDelivery(sessionId, ideaId)` serializes the mute re-check under the per-Idea mutation tail BEFORE the budget test-and-set (lock order: Idea mutation tail → budget tail, never reversed). The wire `claimResurfacingBudget` gains an optional `ideaId` field: the suggestion strip always passes it, so the claim routes through the authoritative seam. Legacy callers without ideaId keep the plain budget claim. The wire result gains `USER_MUTED`. The client's delivery gate handles `USER_MUTED` by silencing without consuming the budget.
- **R2 — dormant reminder control** (client change landed in §4c): the detail view's reminder control renders only when `detail.status === 'active'` (dormant and archived Ideas show no control). The preference itself persists through archive/restore; only permanent delete clears it.
- **R3 — reminder lifecycle ownership** (client change landed in §4c): `IdeaReadSurface.setResurfacingMuted` updates `reminderStatus` ('idle'/'loading'/'error') and the projected `detail.resurfacingMuted` only when the detail still belongs to the requesting idea id; `open(newIdea)` and `closeDetail()` reset the visible status/error; a stale success from a previous Idea cannot cross-apply to the current detail projection. A stale failure from a previous Idea cannot set `reminderError` on the current detail.
- **R4 — report correction**: the acceptance report's change list and lineage are corrected (initial diff: 34 files, +1021/−18; 3 new test files; T12.4 docs closure = `afa6ae2…`; T12.3 Accepted Executable = `61e1eed…`).

Repair verification (same binding order): Focused (preference 11 + suppression 6 + reminder-control 5 + judge/budget/panel/section regression) → full regression **57 files / 866 tests, all green** → scope audit (10 files, all inside `packages/dsh-idea/`) → static gates (typert, typecheck, host build, client build, git diff --check) → **exactly one fresh Canonical Full (`--no-file-parallelism`): 57 / 866 all green**, zero executable drift after it. — *Repair #1 historical verification (superseded by the AUTHORITATIVE FINAL CANONICAL FULL in §4c).*

## 4b. Architecture Review Repair #2 (R1-D client completion / R2 / R3 / R4, 2026-10-05)

Repair #2 (commit `8cad7b2e09237e2565479d230b0195d4c3a85a48`) completes the round-1 review items that §4a described but repair commit `a7eb018…` did not contain, and adds the missing deterministic tests:

- **R1-D — client budget state on `USER_MUTED`**: in `resurfacing-state.ts` the delivery gate no longer sets `budgetState = 'consumed'` before inspecting the claim outcome. `USER_MUTED` now returns with `budgetState` still `'free'` — the Host did not consume the budget, so a future eligible turn may evaluate again for a different Idea. Only `CLAIMED`/`ALREADY_CONSUMED` mark the local budget consumed. The unused `claimResurfacingDelivery` member is removed from the client `ResurfacingRemoteFace` (the client claims through `claimResurfacingBudget({ sessionId, ideaId })`, which routes to the Host delivery seam — one seam, one wire shape).
- **R2 — dormant detail shows no reminder controls**: `IdeaSection.tsx` detail view renders the reminder block only when `detail.status === 'active'` (the previous `!archived` guard wrongly included dormant Ideas). Regression-tested: a dormant detail shows its fields but no projected preference text, no 暂停提醒/恢复提醒 verb, no error affordance.
- **R3 — reminder request ownership (generation guard)**: `IdeaReadSurface` carries a `reminderGeneration` counter bumped by `open()` and `closeDetail()`, which also reset the visible `reminderStatus`/`reminderError` in the reactive store. `setResurfacingMuted` captures the generation at issue time; a completion applies `reminderStatus`/`reminderError`/`detail.resurfacingMuted` only when `generation === currentGeneration` and `detailId === id`. A stale failure cannot mark a newer detail as error (A); a stale success cannot cross-project onto a newer detail (B); a failure after close leaves no residue (C); and after close-then-reopen, request 2 owns the surface and the stale request-1 completion cannot clobber it (D). The Host durable mutation is never cancelled or rolled back — the old completion only loses UI authority.
- **R4 — deterministic strip-pause tests**: new `client-resurfacing.spec.tsx` block "T13.1 R4: the strip pause is a deterministic durable write" (5 tests): success (Host write lands, strip disappears with `lastExpireReason='USER_MUTED'`, `pauseFailed=false`); failure (no pretend-pause — suggestion stays, visible `暂停失败，请重试。` status); retry after failure (failure banner clears, durable pause lands); in-flight duplicate clicks never duplicate the Host write; a pause click with no suggestion is a no-op.

Repair #2 verification (same binding order): Focused (`client-resurfacing.spec.tsx` 51 + `reminder-control.spec.tsx` 10, all green) → static gates (typert regenerated with zero drift, `tsc --noEmit` zero errors, host build + client build successful) → **exactly one fresh Canonical Full (`vitest run --no-file-parallelism`): 57 files / 876 tests, all green**, zero executable drift after it. — *Repair #2 historical verification (superseded by the AUTHORITATIVE FINAL CANONICAL FULL in §4c).* Scope audit: 5 files changed (+280/−14), all inside `packages/dsh-idea/` (`src/client/{IdeaSection,read-state,resurfacing-state}`, `tests/{client-resurfacing,reminder-control} specs`); no Harness tracked diff.

## 4c. Architecture Review Evidence Closure (E1–E6 deterministic race evidence, 2026-10-06)

Round-2 review verdict: `T13_1_RESURFACING_PREFERENCE_TEST_EVIDENCE_REPAIR_REQUIRED` — the Repair #2 product implementation stands (R1-D/R2/R3/R4 confirmed in place, not redone); the missing item was deterministic Host/client race evidence for the R1 delivery-authority invariants. This round is TEST EVIDENCE ONLY: **zero product `src/` changes** (3 test files modified, +276/−4, commit `eb7677045e3d224b3603e7a7ad7313ea299abefc` = the new Tested SHA).

New deterministic tests (7, all passing — every provider seam a scripted local fake, zero real provider calls):

- **E1 — Host delivery-claim authority (R1-D)** (`resurfacing-preference.spec.ts`, 2 tests): a muted Idea's `claimResurfacingDelivery` returns `USER_MUTED` with `getResurfacingBudget` still `consumed === false` (before and after); an unmuted Idea claims `CLAIMED` (budget consumed), then `ALREADY_CONSUMED`. USER_MUTED never consumes budget, proven directly on the Host domain.
- **E2 — client `USER_MUTED` keeps the local budget free (R1-D)** (`client-resurfacing.spec.tsx`, 1 test): turn 1's delivery claim answers `USER_MUTED` → suggestion null, `lastExpireReason='USER_MUTED'`, no surface; turn 2 on the same controller re-runs the whole path (evaluate → Judge → claim for a different Idea) and surfaces it — proving through public behavior (not private fields) that the budget state remained effectively free.
- **E3 — pre-Judge mute race (R1-A)** (`resurfacing-mute-suppression.spec.ts`, 1 test): candidate pinned by `evaluate` while unmuted; `setResurfacingMuted` lands before `judge`; judgment is `outcome: none`, `dropped: [{ideaId, reason: 'USER_MUTED'}]`, **0 provider calls**.
- **E4 — post-Judge provider race (R1-B)** (same file, 1 test): the Judge provider call is dispatched and parked on a gate; the Idea is muted mid-flight; the gate releases a legitimate SURFACE verdict; the final judgment is fail-closed `none` with `dropped` carrying `USER_MUTED` (exactly 1 provider call paid, verdict discarded).
- **E5 — LLM selector post-I/O mute race (R1-C)** (same file, 1 test): the selector call is dispatched and parked; the Idea is muted; the released model picks the Idea; the result candidates are `[]` (the only Idea dropped post-I/O), so no downstream Judge request can carry it — and a stale client forwarding the pre-mute pin still gets it dropped pre-dispatch by the Judge with zero additional provider calls.
- **E6 — embedding post-I/O mute race (R1-C)** (same file, 1 test): with a stored embedding, the query-embedding response is parked in flight; the Idea is muted; the released response revalidates and the candidate list is `[]`.

Verification (binding order): Focused (`resurfacing-preference.spec.ts` 13 + `resurfacing-mute-suppression.spec.ts` 10 + `client-resurfacing.spec.tsx` 52 = **3 files / 75 tests, all green**) → T13/T8–T12 regression (**57 files / 883 tests, all green**) → typert regenerated with **zero drift** (wire untouched) → `tsc --noEmit` zero errors → host build + client build successful → `git diff --check` clean → **exactly one fresh Canonical Full (`vitest run --no-file-parallelism`): 57 files / 883 tests, all green**, zero executable drift after it.

Execution environment: macOS (darwin, arm64) with zsh; all paths native (`/Users/tongxin/Developer/Harness/...`); the Mac dsh-idea preflight was **clean** (HEAD == origin/main == `0b8bb159cb849852b5f6ce285e1b76710f63d69a`, zero workspace drift). Historical Windows execution preserved 17 docs-drift items; current Mac preflight was clean.

**AUTHORITATIVE FINAL CANONICAL FULL** — `vitest run --no-file-parallelism`: **57 files / 883 tests PASS**, zero post-Full executable/test drift. This is the final accepted verification state for T13.1 (Accepted Tested SHA `eb76770…`); the 57/866 and 57/876 figures above are the historical verification states of the initial implementation and Repair #2 respectively, preserved as written.

## 4d. Git state

- Implementation commit: `c001a4b92a47e292571e12a654f8361f39130070`; Repair #1 commit: `a7eb01860a7bad60aee0e02243944d2b675e7c6d`; Repair #2 commit: `8cad7b2e09237e2565479d230b0195d4c3a85a48`; Repair #2 docs-only report: `0b8bb159cb849852b5f6ce285e1b76710f63d69a`; **test-evidence closure commit: `eb7677045e3d224b3603e7a7ad7313ea299abefc` (= Tested SHA; docs-only report commit follows)**.
- Harness tracked diff: 0 (read-only throughout, HEAD `ddefc45…` unchanged). Historical Windows execution preserved 17 docs-drift items; the current Mac preflight was clean and the final Mac workspace is clean. No reset/clean/git add .; no real Provider; T13.2/T14 not started.
