# DSH Idea T13.1 — Resurfacing Preference Implementation Acceptance Report

- Outcome: **`T13_1_RESURFACING_PREFERENCE_IMPLEMENTED — ALL_GATES_GREEN`**
- Date: 2026-10-02
- Baseline: origin/main `afa6ae2e570b36241503008d52e7f3e165021d10` (T12.4 CLOSED at `61e1eed…`); Harness `ddefc45…` read-only, tracked diff zero throughout.
- Architecture authority: `docs/architectue/DSH_IDEA_T13_RESURFACING_PREFERENCE_ARCHITECTURE_FREEZE.md` (D1–D10).
- **Tested executable (this task): implementation commit `c001a4b92a47e292571e12a654f8361f39130070`** (= this commit's built `lib/` state; zero post-Full drift).

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
3. **Architecture / Scope Audit** — 22 files changed (20 modified + 2 new test files), +537/−45, all inside `packages/dsh-idea/` plus the freeze doc; no Harness/migration/domain-bump/Quick-Cache/T12 R1-R10/T9-codec/T11-ranking changes.
4. **Static Gates** — typert regenerated (`setResurfacingMuted` wire shape), `tsc --noEmit` zero errors, host build + client build successful.
5. **Canonical Full (exactly one fresh run)** — `vitest run --no-file-parallelism`: **57 files / 866 tests, all green** (includes the new preference/suppression/reminder-control specs), executed after the final build with **zero executable drift** after it (lib mtime unchanged post-Full).

## 3. Change list

Modified (20): `src/schema.ts`, `src/spec.ts`, `src/types.ts`, `src/service.ts`, `src/resurfacing/{types,service}.ts`, `src/semantic/service.ts`, `src/remote-host/{types,service}.ts`, `src/client/{resurfacing-state,IdeaResurfaceStrip,IdeaSection,index,locales,styles,read-state,state}.tsx/ts`, and 8 spec files.
New (2): `tests/resurfacing-preference.spec.ts`, `tests/resurfacing-mute-suppression.spec.ts`.
Docs: the freeze doc + this report. Build artifacts (`lib/`) remain gitignored.

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

## 5. Git state

- Implementation commit: `c001a4b92a47e292571e12a654f8361f39130070` (= Tested SHA; docs-only report commit follows).
- Harness tracked diff: 0. User docs drift: 17 items preserved. No reset/clean/git add .; no real Provider; T13.2/T14 not started.
