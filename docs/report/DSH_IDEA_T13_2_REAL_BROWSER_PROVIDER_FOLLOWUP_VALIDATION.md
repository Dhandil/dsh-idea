# DSH Idea T13.2 Follow-up — Real Browser / Real Provider Validation Report

- Outcome: **`T13_2_PROVIDER_REQUEST_CAP_REACHED`** — the frozen 12-request hard cap was reached and would-be request #13 was DENIED pre-dispatch (post-turn housekeeping, backoff-retried). Scenarios **A–H all PASS** on fresh disposable state, **Scenario I partial** (resume half PASS with read-back `resurfacingMuted = false`; the resurfacing-restoration half and the dismiss-non-durable proof are NOT_EXECUTABLE — 0 of their 3 allowed Judge attempts consumed). **No product defect found** (`T13_2_REAL_VALIDATION_PRODUCT_DEFECT_FOUND` never triggered); T13.1 remains CLOSED.
- Date: 2026-10-06
- This round executed under: **Freeze `d854d8ad7695000b1038b2b50e494116f5a1c23e`** + the authoritative superseding repair `docs/architectue/DSH_IDEA_T13_2_FOLLOWUP_FREEZE_REPAIR.md` (attribution contract V3 + final closure).

## 1. Baselines and executable

- dsh-idea HEAD == origin/main == `d854d8ad7695000b1038b2b50e494116f5a1c23e` (clean; only docs above the Accepted Tested SHA).
- **TESTED_EXECUTABLE_SHA = `eb7677045e3d224b3603e7a7ad7313ea299abefc`** (T13.1 Accepted Tested SHA; the mounted plugin tarball was packed from the on-disk accepted `lib/` build — zero rebuild, zero executable/test drift).
- Harness `ddefc45fbc7f8e46dd73185e68295696d1297887`, read-only, tracked diff 0 throughout, prebuilt CLI used as-is.
- Web UI reported `0.1.6-alpha.2-ddefc45`; Session model DeepSeek-V41-Flash (real configured provider).

## 2. Isolation and runtime

- Runtime: `/Users/tongxin/Developer/Harness/.t13-2-followup-FU_20261006_192935/` (`home/`, `workspace/`, `evidence/`, `rig/`) — repository-external, non-nested. Workspace created via official `POST /api/workspace/create` (path inside the runtime); idea store started EMPTY (`idea/list` → `[]`).
- **Normal Harness coexistence**: the user's instance (`~/.dsh`, port 3080, PID 18918) kept running the ENTIRE time — zero stop/kill/restart/mutate; per the repaired contract its writes are never T13.2 failures.
- **Port separation**: T13.2 Host listened on 18795 only; 3080 remained owned by the normal instance; browser tokens/cookies never crossed instances.
- **Provider template — fresh whole-pair snapshot**: the final template path did not exist at start (fail-loud check passed); ONE attempt was sufficient — `settings_before == settings_after` AND `credentials_before == credentials_after` AND `temp_settings == settings_after` AND `temp_credentials == credentials_after` (all four in-memory booleans, no secret material emitted) → published by **single atomic directory rename** to `.t13-2-provider-template/` with credentials mode `0600`. **Snapshot attempt count = 1**. Copied into the disposable home at boot; template read-only during the run; **template deleted at cleanup** (temporary-secret discipline).
- Runtime/ledger/sandbox profile/cookies deleted at cleanup; 10 non-secret evidence screenshots preserved in the runtime `evidence/` directory.

## 3. Attribution proof (REAL_DSH_HOME_WRITTEN_BY_T13_2)

- **ATTRIBUTION_MECHANISM = A (Seatbelt deterministic write denial)**: profile `(version 1) (allow default) (deny file-write* (subpath "/Users/tongxin/.dsh"))`. NOTE: the first profile attempt without `(allow default)` could not exec any binary on this macOS (darwin 27 / sandbox-exec quirk) — detected immediately by the self-test harness and fixed in the profile before any validation step; the profile text above is the activated one.
- **ATTRIBUTION_SELF_TEST = PASS (strictly non-mutating)**: inside the same sandbox, a child process first confirmed the read control (`open(O_RDONLY)` on `~/.dsh/settings.yaml` succeeded), then attempted exactly `open(O_WRONLY)` — **DENIED with EPERM**; no O_CREAT/O_TRUNC/write/rename/unlink/chmod was ever attempted; `.credentials.yaml` was never a probe target.
- Every T13.2 process (3 Host boots, plugin install) was launched as `sandbox-exec -f <rig>/deny-dsh-write.sb env DSH_HOME=<runtime>/home …` (boot logs recorded in the rig; the sandbox persists across the launcher's exec chain, so the running Host retains the denial).
- **REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE**: by mechanism A, a T13.2-originated real-home mutation was impossible during the protected runtime; the corroborating secret-safe before/after manifests (84 entries) were **byte-identical (diff = 0 lines)** this round. No denied-write event ever occurred during the run.
- Periodic `lsof` was not used as authority (auxiliary-only rule honored).

## 4. Scenario results (real Chromium via ZCode In-app Browser; TARGET = `idea_cbd0e1b9-9971-4966-aed0-25179f13aba4`, marker `DSH_IDEA_T13_2_FU_20261006_192935`)

- **A — PASS (Δ0)**: Direct Save created TARGET; detail shows **Reminders: on** + **[Pause reminders]**, no Resume control (evidence `A-settings-direct-save.png`, `A-settings-reminders-on.png`).
- **B — PASS (1 natural trigger attempt; 1 REAL Judge)**: frozen trigger sent in a fresh conversation; the Agent asked 2 clarification questions (answered through the real UI) and completed; the real suggestion strip appeared with **View / Reference / Dismiss this time / Pause reminders** (evidence `B-strip-or-final-state.png`); ledger #7 = `RESURFACING_JUDGE` (fingerprint `DECISION: NONE|SURFACE`), 200 DELIVERED, immediately after the reply settled.
- **C — PASS (Δ0)**: **Pause reminders** clicked on the real strip → strip gone, no error (evidence `C-after-pause.png`); read-back `resurfacingMuted = true`.
- **D — PASS (muted Judge Δ0)**: independent fresh muted conversation, frozen alternate trigger; real Agent turn completed (5 Agent-side requests); **no suggestion strip appeared** and the Judge count stayed at 1 (delta 0).
- **G — PASS (within the D conversation, disclosed merge as in round 1)**: the same muted conversation's real Agent turn proves Agent-works ≠ muted-Idea-triggers-Judge (Agent requests > 0, TARGET_Judge = 0). Disclosed protocol-execution note, not a freeze change.
- **E — PASS (Δ0)**: **Reminders: paused** + **[Resume reminders]**; browser reload → still paused (evidence `E-pre-reload-paused.png`, `E-post-reload-paused.png`).
- **F — PASS (Δ0)**: Host stopped (18795 released to 0 listeners), SAME disposable home restarted inside the sandbox, fresh browser page → still **Reminders: paused** (evidence `F-post-restart-paused.png`).
- **H — PASS (Δ0)**: Archive → archived detail shows **no reminder control** (Restore/Delete only; `H-archived-no-control.png`); Restore → still **Reminders: paused** (`H-restored-still-paused.png`).
- **I — PARTIAL**: Resume click (Δ0): **Reminders: on** + **[Pause reminders]**; read-back **`resurfacingMuted = false`**, active (evidence `I-resumed-on.png`). The resurfacing-restoration half (≥1 further real Judge) and the dismiss-non-durable proof are **NOT_EXECUTABLE**: the 12-request cap was already reached (0 of 3 allowed Judge attempts consumed) — unchanged coverage from the accepted round-1 report applies.

## 5. Provider ledger (safe summary)

| Metric | Value |
|---|---|
| Delivered | **12** (= frozen hard cap) |
| — RESURFACING_JUDGE | **1** (#7, Conversation B) |
| — AGENT_OR_OTHER | 11 (B turn 6 + question/answer rounds; D/G muted turn 5) |
| — Semantic selector / embedding | **0** |
| Denied pre-dispatch | **6** (all at the would-be #13 slot, post-turn housekeeping with backoff; zero network dispatch) |
| Failed | **0** |
| Endpoint | `api.deepseek.com/anthropic/v1/messages` only |

- Cap enforcement worked exactly as frozen: would-be request #13 was denied BEFORE network dispatch; the denial caused no UI error and no product fault; per protocol the validation stopped there rather than bypassing the cap.
- Stage attribution was reliable throughout (bounded judge fingerprint vs agent stages).

## 6. Browser error audit

In-page collectors (pageerror / unhandledrejection / console.error / failed `/api/` RPC) installed after every page load (initial, post-reload, post-restart) + UI-visible error surfaces + Host logs: **`DSH_IDEA_RELEVANT_BROWSER_ERRORS = 0`**, failed Idea RPC = 0. (IAB exposes no native console stream — disclosed limitation, same as prior rounds.)

## 7. Cleanup and drift

- Host stopped, 18795 released (0 listeners), both validation pages closed.
- Disposable `home/` (incl. copied credentials), `workspace/`, `rig/` (guard, ledger, sandbox profile, self-test, tarball, cookies) **deleted**; **provider template deleted** (no lingering secret snapshot); evidence screenshots (10, non-secret) remain repository-external.
- Real `~/.dsh`: **byte-identical this round (manifest diff = 0)** and, independently, `REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE` by active mechanism A. Normal instance still running, untouched.
- Harness tracked diff = **0**; dsh-idea `git status` clean — executable/test drift = **0** (no Canonical Full, no unit suite per freeze).

## 8. Limitations

1. D+G executed as one combined muted conversation (identical preconditions, both criteria independently verified) — same disclosed merge as round 1, respecting the frozen cap.
2. Scenario I's resurfacing half + dismiss-non-durable proof NOT_EXECUTABLE (cap) — 0/3 Judge attempts consumed; deterministic coverage remains T13.1 E1/E2, and a further narrow round (only I's second half; ~2–4 requests) can close it if review requires.
3. The Host agent's in-session workspace sandbox cannot initialize inside a seatbelt-sandboxed ancestor (macOS sandbox nesting); the Agent escalated one tool command to full access, which was allowed — the outer seatbelt denial over `~/.dsh/**` remained enforced for every descendant regardless (mechanism A unaffected).
4. sandbox-exec required an explicit `(allow default)` clause on this macOS to exec at all — recorded for future rounds' rig fidelity.

## 9. Verdict

**`T13_2_PROVIDER_REQUEST_CAP_REACHED`** — all scenarios executable within the frozen boundary passed again on fresh disposable state with the repaired attribution contract fully enforced (mechanism A active, self-test PASS, real home byte-identical, normal instance coexisting). No product defect. Awaiting Final Review's disposition: accept the accumulated A–H + partial-I evidence, or budget one narrow closure round for Scenario I's remaining half. T13.3/T14 NOT_STARTED.
