# DSH Idea T13.2 — Scenario I Narrow Closure Validation Report

- Outcome: **`T13_2_REAL_VALIDATION_PRODUCT_DEFECT_FOUND`** — Scenario I's resurfacing-restoration half could not be established: across **3 natural strong-trigger turns (2 browser page lifecycles), the client-side resurfacing pipeline never dispatched the Resurfacing Judge** (server-side ledger: 0 `RESURFACING_JUDGE` requests), so no suggestion strip ever appeared and the dismiss-non-durable proof could not run. A **relevant browser runtime error** in the conversation event-feed layer co-occurred. Per the frozen protocol this is an immediate STOP — **no in-round repair was attempted**. Root-cause attribution between the dsh-idea client controller and the Harness conversation event feed is OPEN (evidence below, deliberately not guessed).
- Date: 2026-10-06
- Executed under: Freeze `d854d8ad7695000b1038b2b50e494116f5a1c23e` + `DSH_IDEA_T13_2_FOLLOWUP_FREEZE_REPAIR.md` (V3 + final closure). Prior accepted rounds untouched: Scenario A–H and I-resume remain ACCEPTED from `6bce6b3b1f023f8f2dfaf01ec4bea4a0e6862e24`; this round ONLY attempted Scenario I's remaining half.

## 1. Baselines and environment

- dsh-idea HEAD == origin/main == `6bce6b3b1f023f8f2dfaf01ec4bea4a0e6862e24` (clean); **TESTED_EXECUTABLE_SHA = `eb7677045e3d224b3603e7a7ad7313ea299abefc`** (unchanged; plugin packed from the accepted on-disk `lib/`, zero rebuild); Harness `ddefc45fbc7f8e46dd73185e68295696d1297887` read-only, tracked diff 0.
- Fresh disposable runtime `/Users/tongxin/Developer/Harness/.t13-2-followup-I_20261006_192935` marker epoch — actual RUN_ID `I_20261006_200015` (runtime `.t13-2-followup-I_20261006_200015/`); workspace created via official Host Remote; idea store started EMPTY.
- Provider template: fresh whole-pair snapshot **attempt = 1** (all four comparisons true), atomic rename, credentials 0600; deleted at cleanup.
- **ATTRIBUTION_MECHANISM = A**; **ATTRIBUTION_SELF_TEST = PASS** (`open(settings.yaml, O_RDONLY)` read-control OK; `open(O_WRONLY)` DENIED with EPERM; strictly non-mutating probe). All Host boots + plugin install ran under `sandbox-exec -f deny-dsh-write.sb`.
- Normal Harness (`~/.dsh`, 3080, PID 18918) ran the entire time, zero-touch. Before/after manifests: **diff = 0 lines** (byte-identical) → **REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE** (mechanism A + corroborating manifests).
- **PROVIDER_TEMPLATE_DELETED = TRUE**; runtime home/workspace/rig deleted (ledger copied to repository-external evidence); port 18795 released.

## 2. Minimal business precondition — ALL PASS (Provider Δ0)

Real UI only: Settings → Ideas → ＋ New idea → **Direct Save** created TARGET `idea_2e9aac13-6ef8-4277-99bf-1cd613dac27c` (marker `DSH_IDEA_T13_2_I_20261006_200015`) → detail showed **Reminders: on** + [Pause reminders] → clicked **Pause reminders** → **Reminders: paused** + [Resume reminders] → clicked **Resume reminders** → **Reminders: on** + [Pause reminders]; read-back via official `idea/get` confirmed enabled state around the cycle; ledger empty throughout (Δ0). Resume semantics at the durable-state level are intact — the failure below is in the resurfacing trigger pipeline, not in the preference state machine.

## 3. Scenario I resurfacing attempts — the finding

Three natural trigger turns, each in a fresh conversation, each completed with a real Assistant reply (real DeepSeek provider turns), per the freeze's no-identical-grinding rule:

| Attempt | Trigger (frozen/natural) | Page lifecycle | Turn completed | Judge dispatched | Strip |
|---|---|---|---|---|---|
| 1 | 「我准备重新做一个塔防游戏…我应该从哪里切入？」(frozen primary) | original page | yes (2 agent calls) | **NO** | no |
| 2 | 「我现在正在重新设计塔防玩法…之前有没有值得重新拿出来的方向？」(frozen alternate) | original page | yes (5 agent calls) | **NO** | no |
| 3 | 「塔防新作立项了，我想把"用模块组合拼出攻击范围"作为核心差异点…」(natural variant) | FRESH reloaded page, collector clean | yes (3 agent calls) | **NO** | no |

**Expected** (per T13.1 accepted behavior + rounds 1–2 real validations): the client resurfacing pipeline evaluates each eligible completed trigger turn against the workspace corpus and dispatches exactly one `RESURFACING_JUDGE` provider request; a positive verdict surfaces the strip for TARGET.

**Actual**: zero Judge dispatches across all three turns (server-side guard ledger — the same ledger that captured the Judge with fingerprint attribution in rounds 1–2); no strip ever rendered; no UI-visible error; browser error count on the final clean page = 0.

## 4. Evidence collected for attribution (no fix attempted)

1. **Host-side pipeline is healthy**: direct official RPC `idea/evaluateResurfacing` with attempt 1's turn text returned TARGET as the sole candidate (score 32 ≥ floor 8, `resurfacingMuted = false` respected, no suppression) — the corpus, floor, provenance, and preference state are all correct Host-side. The stall is therefore in the CLIENT-side chain (event-feed delivery → controller gates → evaluate dispatch → Judge dispatch), not in the Host domain.
2. **Model variance is excluded**: the Judge was never dispatched (0 requests), so no NONE verdicts occurred; the 3-attempt budget was consumed by pipeline silence, not by negative verdicts.
3. **Sandbox exclusion is reasonable**: rounds 1–2's Judge fired inside the identical seatbelt sandbox; the sandbox denies only `~/.dsh` writes and cannot block loopback/provider network I/O.
4. **Relevant browser runtime error (co-occurring)**: immediately after attempt 1's reply settled, the in-page collector captured 3× `console.error` — `[session-controller] event feed subscriber failed: conversation Definition "assistant-step" withdrew materialized target "chat"; return the same key with hidden visibility instead` (Harness conversation-layer log; **absent in rounds 1–2**, whose collectors recorded 0 errors). A thrown subscriber inside the conversation event-feed notification path is consistent with the resurfacing controller being starved of turn/end notifications, but the exact subscriber and the notification loop's error isolation could not be established from the served bundles with read-only tooling.
5. **Client idea RPCs are not fetch-observable**: instrumenting `window.fetch` proved that even the Settings pause/resume (which definitely issued `idea/setResurfacingMuted`) leaves zero fetch traces — the idea Remotes travel over the WebSocket mux. Consequently the precise stall point (event delivery vs budget gate vs evaluate dispatch) could not be pinpointed in-browser; the server ledger (Judge = 0) is the hard boundary evidence.
6. **Delta vs the accepted rounds**: the only flow difference before the first trigger conversation is this round's Settings pause→resume precondition cycle (rounds 1–2 triggered from a never-muted TARGET). Whether that correlation is causal is OPEN — no code was read as fixed, nothing was modified.

## 5. Provider ledger (safe summary)

- Delivered = **10** of the fresh 12-cap (B/C-attribution unchanged from accepted rounds; this round: 3 Agent turns × 2/5/3 calls); `RESURFACING_JUDGE` = **0**; `SEMANTIC_SELECTOR` = **0**; Denied = **0**; Failed = **0**. Two requests remained under the cap — an attempt-4 turn could not fit within it and the 3-attempt natural-trigger budget was exhausted; per freeze the validation stopped instead of grinding.

## 6. Cleanup and drift

Host stopped (18795 → 0 listeners); validation page closed; disposable `home/` (credentials included), `workspace/`, `rig/` (guard, ledger, sandbox profile, self-test, tarball, cookies) **deleted**; **provider template deleted**; non-secret evidence (ledger JSON, collector JSON, screenshots) preserved repository-external. Real `~/.dsh` manifest diff = **0 lines**; normal instance untouched and still running. Harness tracked diff = **0**; dsh-idea `git status` clean — executable/test drift = **0**; no Canonical Full, no unit suite.

## 7. Verdict

**`T13_2_REAL_VALIDATION_PRODUCT_DEFECT_FOUND`** — scoped precisely: **the shipped resurfacing trigger pipeline (client side) failed to reach the Judge on three eligible completed trigger turns in the real product environment, with a co-occurring Harness conversation event-feed runtime error; the resuming half of Scenario I therefore remains unproven** (its state-level half — resume → `resurfacingMuted = false` → Reminders: on — passed again). Root-cause attribution (dsh-idea controller vs Harness conversation event feed vs an interaction triggered by the pause→resume precondition) is explicitly OPEN and handed to the architecture review with all evidence above. No code was modified anywhere; A–H evidence from the accepted rounds is untouched. T13.3/T14 NOT_STARTED.
