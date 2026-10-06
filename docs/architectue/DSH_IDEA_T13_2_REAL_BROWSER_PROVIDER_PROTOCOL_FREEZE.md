# DSH Idea T13.2 — Real Browser / Real Provider Durable Reminder Preference Validation Protocol Freeze

> **AMENDMENT (2026-10-06, follow-up freeze repair)**: the isolation clauses below requiring the real `~/.dsh` to stay byte-identical during validation, and any derived requirement that the user's normal Harness (HOME `~/.dsh`, port 3080) be stopped/quiesced for validation to proceed, are **SUPERSEDED** by `docs/architectue/DSH_IDEA_T13_2_FOLLOWUP_FREEZE_REPAIR.md`. The acceptance object is now **attribution** — "T13.2-originated processes MUST NOT write to the real user DSH_HOME" — not global quiescence; the normal instance may keep running and its own writes are never T13.2-attributable. Provider configuration is sourced through the repository-external read-only template contract defined in that repair. Everything else in this freeze (cap discipline, guard, attribution fingerprint, real-browser requirement, defect/stop rules, docs-only delivery) remains in force. Original frozen text follows, preserved as written.

Status: **`T13_2_PROTOCOL_FROZEN`**
Date: 2026-10-06
Scope: VALIDATION ONLY for T13.1 Resurfacing Preference Memory & Reminder Controls — real disposable Harness Host, real Harness Web, real Chromium, real dsh-idea plugin, real configured DeepSeek provider, real durable storage. No product implementation is authorized; T13.1 stays **`T13_1_RESURFACING_PREFERENCE_CLOSED`**.

## Baselines

- dsh-idea closure baseline: `5ee162ffb56ebef444038d9d77f672af39f5900f` (= `origin/main` at freeze; only docs closures above the Accepted Tested SHA).
- T13.1 Final Accepted Tested SHA: **`eb7677045e3d224b3603e7a7ad7313ea299abefc`** — the disposable rig mounts exactly this code state (the on-disk built `lib/` is the accepted build; no rebuild that could produce tracked executable drift).
- Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887`, source repo strictly READ-ONLY, tracked diff zero; the prebuilt CLI (`apps/cli/lib/bin.js`) is used as-is (missing artifact ⇒ STOP, no in-round Harness build).
- The user's normal Harness (HOME `~/.dsh`, web on port 3080, PID-owned) is never disturbed; the disposable instance uses its own HOME and port.

## Isolation

- Disposable runtime: `/Users/tongxin/Developer/Harness/.t13-2-runtime-<RUN_ID>/` with `home/` (disposable `DSH_HOME`), `workspace/`, `evidence/`, `rig/` — outside both repositories, non-nested.
- Idea store starts EMPTY; no user Idea data, sessions, conversations, workspace state, or browser state is copied. Workspace created through the official Host Remote (`workspace/create`), never by hand-editing tracked config.
- Credential/config transfer: verbatim copy of `~/.dsh/settings.yaml` and `~/.dsh/.credentials.yaml` into the disposable home ONLY (no parsing, no printing, source untouched; destination `.credentials.yaml` mode `0600`; deleted at cleanup; never committed, never in evidence/logs/report).
- Real `~/.dsh` protection: a secret-safe filesystem manifest (path + size inventory; credential content compared by boolean equality only — no hashes or bytes of secret-bearing files in any artifact) is captured before boot and re-verified after cleanup: `REAL_DSH_HOME_UNCHANGED = TRUE` required.
- Provider credential: consumed only through the Harness credentials seam. No secret, prefix, suffix, hash, fingerprint, byte length, or Authorization header may be printed, logged, screenshotted, or committed. Unavailable ⇒ STOP `T13_2_BLOCKED_PROVIDER_CONFIGURATION`.

## Provider request guard (repository-external)

- Installed as a Node `--import` preload from `rig/` wrapping `globalThis.fetch` in the single Host process — no Harness repo modification.
- **Hard cap = 12 real public provider requests**, atomic reserve BEFORE network dispatch; would-be request #13 is DENIED pre-dispatch (`T13_2_PROVIDER_REQUEST_CAP_REACHED` ⇒ STOP). The normal path is not expected to trigger the denial.
- Counted: external provider endpoints only. Not counted: localhost/browser/static assets/Harness RPC.
- Redacted ledger per request: ordinal, timestamp, scenario (timeline attribution), logical stage, provider, model, safe endpoint host/path, delivered/failed/denied, status, redacted fingerprint (system/message lengths, bounded marker hits). NEVER: API key, Authorization, raw headers, raw credential, full secret-bearing bodies.
- **Stage attribution**: `RESURFACING_JUDGE` requests are identified by a bounded fingerprint marker from the frozen T10 Judge prompt vocabulary (`DECISION: NONE|SURFACE`) in the request body; selector calls would carry the frozen `ideaIds` selector vocabulary (semantic is expected disabled). Everything else external = `AGENT`/other-Host stage. If Agent vs Judge attribution is not reliably distinguishable ⇒ STOP `T13_2_PROVIDER_ATTRIBUTION_INSUFFICIENT` (do not guess).

## Unique marker

`DSH_IDEA_T13_2_<timestamp>` — the target Idea (and any created test data) carries it. No existing user data is used.

## Semantic configuration

T13.2 validates durable mute authority, not T11 semantic retrieval. The disposable profile keeps its natural/default semantic configuration (expected disabled); no tracked or rig config is changed to enable embedding/selector. R1-C races are already accepted as T13.1 deterministic evidence (E5/E6). Report records `Semantic branch = disabled for T13.2 isolation` with proof (zero semantic-vocabulary provider requests in the ledger).

## Scenarios (all UI steps = REAL browser interaction; persistence = official read-only Host Remote `idea/list` / `idea/get` only — never raw storage files as the sole proof)

- **A — Create target + active Settings control (Δ0)**: create active Idea `TARGET_A_<MARKER>` via Settings → Ideas → 新建 Idea → **Direct Save** (never AI organize; provenance stays normal Direct-Save semantics; reminder initial state = enabled). Settings → target detail must show 提醒：已开启 + [暂停提醒], NOT 恢复提醒. Provider Δ0. Screenshots.
- **B — Real unmuted resurfacing (≥1 REAL Judge request)**: fresh conversation, strong frozen trigger: 「我准备重新做一个塔防游戏，但核心差异化还没有决定。我应该从哪里切入？」; wait for the real Assistant reply to complete (real Agent turn allowed and ledgered as AGENT). The suggestion strip must appear for the seeded canonical IdeaId showing 查看 / 引用 / 本次忽略 / 暂停提醒. If the Judge legitimately returns NONE, retry with the frozen alternate strong trigger 「我现在正在重新设计塔防玩法，尤其在想攻击范围和角色构筑怎么做出差异化，之前有没有值得重新拿出来的方向？」 in a NEW disposable conversation — max **3 natural trigger attempts** (never resend an identical request to grind the model; hard cap still applies). All three fail to surface ⇒ STOP `T13_2_REAL_VALIDATION_INCONCLUSIVE_JUDGE` (not a defect; no UI hacking/injection).
- **C — Pause from the real strip (Δ0)**: click 暂停提醒 on the real strip: Host durable mutation success, strip disappears, no pretend success, no visible error, Provider Δ0; official `idea/get` read-back `resurfacingMuted = true`. Screenshots before/after.
- **D — Cross-conversation suppression (Judge Δ0)**: second fresh conversation with equally strong relevant trigger semantics; TARGET_A must not enter any visible suggestion and must not trigger any `RESURFACING_JUDGE` request (Agent calls may exist and are ledgered separately). With no other eligible Idea: `RESURFACING_JUDGE delta = 0`. A muted Idea producing a Judge call ⇒ STOP `T13_2_REAL_VALIDATION_PRODUCT_DEFECT_FOUND`.
- **E — Settings projection + browser reload (Δ0)**: Settings → TARGET_A shows 提醒：已暂停 + [恢复提醒]; browser reload; re-enter: still 提醒：已暂停 + [恢复提醒]. Provider Δ0.
- **F — Host restart persistence (Δ0)**: stop the disposable Host (port released), keep the disposable DSH_HOME, restart with the SAME home/workspace, fresh browser page, TARGET_A detail still 提醒：已暂停 + [恢复提醒], `resurfacingMuted = true`. Provider Δ0.
- **G — Real Agent turn while muted**: fresh conversation, strong relevant user turn, real Agent responds (≥1 real AGENT request recorded; actual count recorded honestly if the Agent runtime uses a multi-call strategy). TARGET_A stays muted, does not surface, and dispatches zero `RESURFACING_JUDGE` requests. Core criterion: Agent works ≠ muted Idea triggers Judge.
- **H — Archive / restore preserves mute (Δ0)**: archive TARGET_A → archived detail shows NO reminder pause/resume control; restore → active detail shows 提醒：已暂停 + [恢复提醒]. Archive/restore never auto-unmutes. Provider Δ0.
- **I — Resume + resurfacing restored (≥1 REAL Judge request)**: Settings → 恢复提醒: Host success, read-back `resurfacingMuted = false`, UI 提醒：已开启 + [暂停提醒], Provider Δ0. Then a fresh conversation with a new strong opportunity context — max 3 natural trigger attempts (Scenario B rules): TARGET_A may enter candidate/Judge/delivery again; ≥1 real Judge request; on surface the strip shows 查看 / 引用 / 本次忽略 / 暂停提醒. Then click **本次忽略**: strip closes, and Settings → TARGET_A still shows 提醒：已开启 — proving dismiss ≠ durable mute (Provider Δ0 for the dismiss). Three legitimate NONEs ⇒ STOP `T13_2_REAL_VALIDATION_INCONCLUSIVE_JUDGE`.

## Provider accounting (frozen per-stage deltas)

Direct Save Δ0; Pause Δ0; Settings reads Δ0; Reload Δ0; Host restart/read Δ0; Archive Δ0; Restore Δ0; Muted conversation `RESURFACING_JUDGE` Δ0; Resume Δ0; 本次忽略 Δ0; each successful unmuted resurfacing opportunity ≤ 1 T10 Judge call; Semantic provider = 0; total real public provider requests ≤ 12 (guard-enforced).

## Browser error audit

Real Chromium via browser-use. Capture page errors, unhandled rejections, console.error, failed Idea RPC, UI-visible errors; if no native console stream exists, use the T12.4 approach (in-page collector + UI-visible errors + Host logs) and disclose the limitation. Required: `DSH_IDEA_RELEVANT_BROWSER_ERRORS = 0` (a legitimate Judge NONE is not a browser error). No browser capability ⇒ STOP `T13_2_BLOCKED_REAL_BROWSER_UNAVAILABLE`.

## Product defect rule (any ⇒ immediate STOP, no in-round fixes, report `T13_2_REAL_VALIDATION_PRODUCT_DEFECT_FOUND` with exact scenario/marker/expected/actual/ledger/browser observation/SHA)

Pause reports success but read-back false; reload or Host restart loses the pause; archive/restore clears it; muted Idea surfaces cross-conversation; muted Idea reaches the Judge; resume leaves suppression permanent; Host writes the wrong Idea; archived/dormant exposes reminder controls; pause/resume/dismiss actions produce provider requests; relevant browser/runtime error; Harness tracked mutation; dsh-idea executable/test mutation.

## Delivery / discipline

Two docs-only commits ONLY: (1) this Protocol Freeze (`T13_2_PROTOCOL_COMMIT`), committed and pushed BEFORE any real validation; (2) the Validation Report `docs/report/DSH_IDEA_T13_2_REAL_BROWSER_PROVIDER_VALIDATION.md`. No packages/, tests/, Harness, config, lockfile, generated-file, screenshot, or raw-trace content in commits. Precise staging; never `git add .`/reset/clean/stash. Canonical Full and the unit suite are NOT re-run (T13.1 acceptance 57/883 stands; any executable change ⇒ protocol broken ⇒ STOP). Cleanup after every ending: stop Host, release port, close disposable browser, delete disposable home/workspace/rig incl. copied credentials and the raw ledger (safe summary lives only in the report); evidence screenshots may remain repository-external, secret-free. Final: real `~/.dsh` unchanged, Harness tracked diff = 0, dsh-idea executable/test drift = 0, push + fetch verify HEAD == origin/main. Then STOP — no Final Architecture Review from this round; await independent review. T13.3/T14 NOT_STARTED.
