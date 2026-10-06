# DSH Idea T13.2 — Real Browser / Real Provider Durable Reminder Preference Validation Report

- Outcome: **`T13_2_PROVIDER_REQUEST_CAP_REACHED`** — Scenarios A–H all **PASS** (with Scenario D/G executed as one combined muted conversation); Scenario I **PARTIAL** (resume half PASS; the resurfacing-restoration half and the dismiss-non-durable proof are NOT_EXECUTABLE because the frozen provider cap was reached). **No product defect found** (`T13_1_PRODUCT_DEFECT = NONE_ESTABLISHED` stands; `T13_2_REAL_VALIDATION_PRODUCT_DEFECT_FOUND` was never triggered).
- Date: 2026-10-06
- Protocol freeze: `docs/architectue/DSH_IDEA_T13_2_REAL_BROWSER_PROVIDER_PROTOCOL_FREEZE.md` — **Protocol Freeze SHA `79ef3c46bdf6e8dcc15875bfe17b9d5a1e7ee608`**, committed and pushed before any real validation.
- Accepted Tested SHA under validation: `eb7677045e3d224b3603e7a7ad7313ea299abefc` (unchanged; zero executable/test drift).
- Baselines: dsh-idea `5ee162ffb56ebef444038d9d77f672af39f5900f` (HEAD == origin/main, clean); Harness `ddefc45fbc7f8e46dd73185e68295696d1297887` (read-only, tracked diff 0 throughout; prebuilt `apps/cli/lib/bin.js` used as-is, no in-round build).

## 1. Mac environment

macOS (darwin, arm64), zsh, Node v24.21.0. Disposable Host: `DSH_HOME=<runtime>/home`, `node --import <rig>/provider-guard.mjs apps/cli/lib/bin.js web --port 18795 --no-open` (boot ×3: initial profile bootstrap, post-plugin-install restart, Scenario F restart). Real user Harness (port 3080) untouched and never disturbed. Web UI reported `0.1.6-alpha.2-ddefc45` (matches the Harness SHA).

## 2. Isolation

Disposable runtime `/Users/tongxin/Developer/Harness/.t13-2-runtime-20261006_163753/` (`home/`, `workspace/`, `evidence/`, `rig/`) — outside both repositories, non-nested. Idea store started EMPTY (verified by real UI "No saved Ideas yet" and read-only `idea/list` → `[]`). Workspace created through the official Host Remote (`POST /api/workspace/create`). Credential transfer: verbatim copy of `~/.dsh/settings.yaml` + `~/.dsh/.credentials.yaml` into the disposable home only (destination mode 0600; source untouched; deleted at cleanup; never read, parsed, printed, or committed). The user's normal session/user data was never copied.

## 3. Unique marker

`DSH_IDEA_T13_2_20261006_163753`. Canonical TARGET_A IdeaId: **`idea_feacb80f-b341-4bd0-abdc-6bc324ce7acd`** (active; created via Settings → Ideas → ＋ New idea → **Save directly**, Provider Δ0).

## 4. Provider ledger (safe summary; no secrets, keys, Authorization headers, or raw bodies recorded)

| Metric | Value |
|---|---|
| Delivered (real network dispatch) | **12** (= frozen hard cap) |
| — `RESURFACING_JUDGE` stage | **1** |
| — `AGENT_OR_OTHER` stage | 11 |
| — Semantic selector / embedding | **0** |
| Denied pre-dispatch | **6** (all at the would-be ordinal #13 slot) |
| Failed | **0** |
| Endpoint | `api.deepseek.com/anthropic/v1/messages` only |
| Models observed | `deepseek-flash`, `deepseek-v4-flash` (Session model configured as DeepSeek-V41-Flash) |

- **Judge attribution**: `RESURFACING_JUDGE` identified by the bounded fingerprint marker (`DECISION: NONE|SURFACE`, the frozen T10 Judge answer vocabulary) inside the request body — ledger #9, 200 DELIVERED, immediately after Conversation #1's Assistant reply settled. Agent vs Judge attribution was reliable at every point; `T13_2_PROVIDER_ATTRIBUTION_INSUFFICIENT` never applied.
- **Semantic branch = disabled for T13.2 isolation — proof**: zero `SEMANTIC_SELECTOR`-staged requests and zero embedding endpoints across the entire ledger; the disposable profile kept its natural/default semantic configuration.
- **Cap enforcement (the frozen safety boundary worked)**: after the muted conversation's Agent turn had already completed normally (12 delivered), the Harness issued a post-turn housekeeping request at 08:56:29Z (~2 s after the last delivered call); the guard DENIED it pre-dispatch and denied 5 backoff retries over ~16 s — zero network dispatch for every denial. The browser showed no error (collector clean); the turn result was unaffected. Per protocol this stops the validation; no request #13 was ever dispatched and nothing was bypassed to "finish the tests".
- **Agent multi-call honesty**: Conversation #1's turn consumed 8 Agent-side requests (normal strategy: thinking rounds, a web-search tool round, ask-user-question rounds); the muted conversation's turn consumed 3 (direct answer + title generation). Actual counts recorded, not forced to 1.

## 5. Scenario results

- **A — PASS (Δ0)**: TARGET_A Direct-Saved (no AI organize); detail shows **Reminders: on** + **[Pause reminders]**, no Resume control (evidence `A-settings-active-reminders-on.png`); ledger empty at this point.
- **B — PASS (1 natural trigger attempt; ≥1 REAL Judge call)**: fresh conversation, frozen trigger 「我准备重新做一个塔防游戏，但核心差异化还没有决定。我应该从哪里切入？」; real Agent reply completed (5m40s); the real suggestion strip appeared for TARGET_A showing **View / Reference / Dismiss this time / Pause reminders** (evidence `B-resurfacing-strip-conversation1.png`); ledger #9 = `RESURFACING_JUDGE` 200 DELIVERED. The Judge returned a positive verdict on the first attempt.
- **C — PASS (Δ0)**: clicked **Pause reminders** on the real strip → strip disappeared, no pretend success, no visible error (evidence `C-after-pause-strip-gone.png`); read-only `idea/get` read-back **`resurfacingMuted = true`**; ledger unchanged.
- **D — PASS (muted Judge Δ0)**: second fresh conversation with the frozen alternate strong trigger while TARGET_A was muted. TARGET_A never entered a visible suggestion; the conversation produced **zero `RESURFACING_JUDGE` requests** (deterministic suppression ended before provider dispatch). Agent calls were ledgered separately (`AGENT_OR_OTHER`).
- **G — PASS (Agent calls = 3; muted Judge Δ0)**: the same muted conversation executed a REAL Agent turn end-to-end (3 delivered Agent-side requests, reply completed, "1 turns 3 steps"). Core criterion proven: the Agent works normally ≠ the muted Idea triggers a Judge. Scenario D and G were deliberately executed as ONE combined muted conversation (identical preconditions; both scenarios' criteria independently verified) to respect the frozen 12-request budget — disclosed here as a protocol-execution note, not a protocol change.
- **E — PASS (Δ0)**: Settings → TARGET_A shows **Reminders: paused** + **[Resume reminders]**; browser reload → re-entered detail → still **Reminders: paused** (evidence `E-settings-paused-pre-reload.png`, `E-settings-paused-post-reload.png`).
- **F — PASS (Δ0)**: Host stopped (port 18795 released to 0 listeners), the SAME disposable `DSH_HOME` restarted, a fresh browser page opened: TARGET_A detail still **Reminders: paused** + **[Resume reminders]** (evidence `F-settings-paused-after-host-restart.png`). Real cross-restart persistence proof.
- **H — PASS (Δ0)**: Archive → archived detail shows **no reminder pause/resume control** (only Restore/Delete; evidence `H-archived-no-reminder-control.png`); Restore → active detail shows **Reminders: paused** + **[Resume reminders]** (evidence `H-restored-still-paused.png`). Archive/restore did not clear the preference.
- **I — PARTIAL**: Resume click (Δ0): **Reminders: on** + **[Pause reminders]** restored; read-only read-back **`resurfacingMuted = false`**, status active (evidence `I-resumed-reminders-on.png`). The remaining halves — a fresh conversation re-surfacing TARGET_A (≥1 further real Judge call) and the dismiss-non-durable proof (本次忽略 leaves reminders enabled) — are **NOT_EXECUTABLE**: they require further real provider dispatch, and the frozen cap had been reached (would-be #13 denied pre-dispatch). Under Judge-nondeterminism accounting these halves consumed 0 of their allowed 3 attempts.

## 6. Persistence read-back (official read-only Host Remote only)

`idea/get(idea_feacb80f…)` across the journey: created active `resurfacingMuted=false` → after strip pause `true` → after browser reload `true` → after Host restart `true` → after archive/restore `true` → after resume `false` (final). Every projection matched the real UI state at the same moment. No raw storage file was used as a business proof.

## 7. Browser error audit

Real Chromium (ZCode In-app Browser). In-page collectors (errors: pageerror / unhandledrejection / console.error; failed `/api/` RPCs) installed immediately after each page load — including after reload and on the fresh post-restart page — plus UI-visible error surfaces and Host logs. Result: **`DSH_IDEA_RELEVANT_BROWSER_ERRORS = 0`**, failed Idea RPC = 0, across the entire run including the guard-denial window. (The IAB facade exposes no native console stream; the collector + UI-visible errors + Host logs constitute equivalent evidence — disclosed limitation, same as T12.4. A guard denial is a protocol safety event, not a browser error; none surfaced in the UI.)

## 8. Cleanup and integrity

Host stopped, port 18795 released (0 listeners), both validation browser pages closed. Disposable `home/` (including the copied credentials), `workspace/`, and `rig/` (guard, ledger, manifests, tarball, cookies) **deleted**. Evidence screenshots (9, non-secret) remain at the repository-external `…/.t13-2-runtime-20261006_163753/evidence/`. Screenshots contain no credentials or tokens.

**Real `~/.dsh` integrity — precise accounting**: the recursive path+size inventory (captured before boot; content-compared without emitting any hash or byte of the credential file) is NOT byte-identical at cleanup: the diff consists exclusively of the **user's own concurrently running normal Harness instance** (port 3080) — a `dsh-risk-advisor-ux-review` session's `sessions/…/session.lock` + `session.v3.jsonl.zstd`, its `storages/session_projcache/…` entry, `storages/workspace.json`, and a `settings.yaml` rewrite (52 → 150 bytes by that instance). **Zero T13.2-related paths appear anywhere in the diff**; every write of this validation targeted the disposable home exclusively (all processes ran with `DSH_HOME=<runtime>/home`). Honest verdict: `UNCHANGED_BY_T13_2 = TRUE`; literal byte-identity failed for reasons outside this validation's isolation boundary.

- Harness tracked diff: **0**. dsh-idea `git status`: **clean** — executable/test drift **0** (no Canonical Full, no unit suite re-run, per protocol §32). Credential exposure incidents: **0**.

## 9. Evidence limitations

1. IAB exposes no native console stream — mitigated as in §7 (disclosed).
2. Scenario D/G shared one muted conversation (precondition-identical; both criteria verified) to respect the frozen cap — disclosed in §5.
3. Scenario I's resurfacing-restoration and dismiss-non-durable halves are NOT_EXECUTABLE (cap), with 0 of 3 Judge attempts consumed — they remain covered by T13.1's accepted deterministic evidence (E2: USER_MUTED keeps the budget free; E1/authority) and can be closed by a follow-up validation round with a fresh cap.
4. UI locale rendered English (`Reminders: on/paused`, `Pause/Resume reminders`, `View/Reference/Dismiss this time`); these are the shipped locale counterparts of the frozen Chinese copy 提醒：已开启/已暂停, 暂停提醒, 恢复提醒, 查看/引用/本次忽略 — disclosed as a locale observation, not a copy defect.

## 10. Verdict

**`T13_2_PROVIDER_REQUEST_CAP_REACHED`** — every scenario that could execute within the frozen 12-request safety boundary **passed with real browser, real Host, real provider, and real durable storage**: natural resurfacing with a real Judge call, durable cross-conversation suppression with Judge Δ0, cross-restart durability, archive/restore preservation, and resume restoration of the enabled state. No product defect was established; T13.1 remains CLOSED at Tested SHA `eb76770…`. Awaiting independent architecture review for disposition (accept A–H+partial-I evidence, or budget a follow-up round for Scenario I's remaining halves). T13.3/T14 NOT_STARTED.
