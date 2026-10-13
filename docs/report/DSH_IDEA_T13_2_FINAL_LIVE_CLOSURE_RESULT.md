# DSH Idea T13.2 — Final Scenario I Live Closure Result

- **Outcome:** `T13_2_REAL_VALIDATION_INCONCLUSIVE_JUDGE`
- **Date:** 2026-10-13
- **Scope:** Three detector-proven final-closure fixtures only, to attempt positive Judge → real strip → Dismiss this time → non-durable verification. No earlier A–H, Pause/Resume, H1, R1–R5, semantic-disable, attribution, or normal Harness coexistence scenarios were rerun.
- **Decision:** All three completed fixtures dispatched evaluate and the real Resurfacing Judge, and all three Judges returned legitimate `NONE / REDUNDANT_WITH_CONTEXT`. Per the frozen rule, stop here. No positive strip appeared, so Dismiss this time and its persistence behavior were not exercised. This is inconclusive model behavior, not a repair failure or a product defect.

## Baselines and preflight

- `BASELINE_SHA = 324190a21d56d55cec8db81dc9fa1461d67f232a`; dsh-idea `HEAD == origin/main` before the report, with zero staged or tracked drift.
- `TESTED_IMPLEMENTATION_SHA = 7f1703badb6e48845798d8444d00f1e12023c5d8`.
- `HARNESS_SHA = ddefc45fbc7f8e46dd73185e68295696d1297887`; Harness tracked source remained unchanged.
- Preserved `packages/dsh-idea/.DS_Store` and the Harness checkout’s pre-existing `deepseek-harness` symlink.
- The detector-proven fixture amendment and its exact prompts were used without edits. No unit suite, Canonical Full, T13.3, or T14 work was run.

## Isolation and configuration

A fresh runtime, provider-template pair, Idea store, and browser session were created outside both repositories. The complete provider pair was captured in one attempt; all four before/after and temporary-copy equality comparisons passed, and the pair was atomically published. The credentials copy was mode `0600`. Its content was compared only by boolean equality; no credential bytes, sizes, hashes, or values were recorded. The final real-home credential comparison was `TRUE`.

Seatbelt mechanism A was active for the disposable Host and CLI processes. Its strictly non-mutating activation probe attempted `open("/Users/tongxin/.dsh/settings.yaml", O_WRONLY)` and was denied with `EPERM` before any real turn. Therefore `REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE`. Corroborating path/metadata manifests had zero added or removed entries; the credentials file was excluded from metadata and checked only by boolean equality. The normal port 3080 was not contacted; no listener was present when checked.

The supported disposable override at `<runtime>/home/cordis.patch.yml` set `dsh-idea-semantic.mode: off`. The official `--dump-config` output confirmed the effective mode before any trigger. The local `semanticResurfacingCandidates` RPC ran once per attempt and returned HTTP 200; semantic public-provider requests remained zero.

The 20-request pre-dispatch guard passed its offline fake-transport test: 20 fake dispatches succeeded and would-be request 21 was denied before transport. The live run used 19 delivered public-provider requests and did not reach the cap.

## Minimal fresh-state precondition

The official `idea/list` returned an empty current view. A runtime-owned workspace was created with the official Host Remote, then one uniquely marked TARGET was saved through the real Settings → Ideas → Direct Save UI:

- `TARGET_ID = idea_06c38e6f-8e85-4292-bb8a-58018bad184c`
- UI showed **提醒：已开启** and **暂停提醒** after Direct Save.
- The real UI Pause action was followed by official `idea/get` read-back `resurfacingMuted = true`.
- The real UI Resume action was followed by official `idea/get` read-back `resurfacingMuted = false`; the UI returned to **提醒：已开启** and **暂停提醒**.
- Provider delta through save, Pause, Resume, and read-backs was zero.

## Exact live fixtures and results

Each attempt used a separate fresh conversation. Every completed turn dispatched `idea/evaluateResurfacing`, the local `idea/semanticResurfacingCandidates` RPC, and `idea/judgeResurfacing`; all nine corresponding Idea RPCs returned HTTP 200. The three deterministic detector admissions below rely on the already accepted 2026-10-12 proof and were not rerun.

| Attempt | Exact frozen trigger | Accepted detector proof | Completed path | Judge result |
|---|---|---|---|---|
| 1 | `我准备重新做一款塔防游戏，想把模块组合出的攻击范围作为核心差异化，第一步应该怎么验证？` | `ADMITTED = TRUE`; `GOAL_DECLARATION = 准备重新做` | evaluate 200 → local semantic RPC 200 → Judge 200 | `NONE / REDUNDANT_WITH_CONTEXT` |
| 2 | `我打算重新设计塔防的攻击覆盖规则，之前讨论过的模块拼接路线还能形成构筑差异吗？` | `ADMITTED = TRUE`; `GOAL_DECLARATION = 打算重新设计`; `MEMORY_GAP = 之前讨论过` | evaluate 200 → local semantic RPC 200 → Judge 200 | `NONE / REDUNDANT_WITH_CONTEXT` |
| 3 | `我决定重新开发塔防原型。之前提过把不同形状的攻击模块拼成塔的覆盖区域，这个方向值得继续吗？` | `ADMITTED = TRUE`; `GOAL_DECLARATION = 决定重新开发`; `MEMORY_GAP = 之前提过` | evaluate 200 → local semantic RPC 200 → Judge 200 | `NONE / REDUNDANT_WITH_CONTEXT` |

`ATTEMPTS_USED = 3`; `REAL_EVALUATE_REQUESTS = 3`; `REAL_JUDGE_REQUESTS = 3`. No identical trigger was repeated. No target suggestion strip surfaced: `REAL_STRIP_SURFACED = FALSE`. `DISMISS_COMPLETED = FALSE`; `DISMISS_NON_DURABLE = NOT_TESTED`. The final official `idea/get` still reported `resurfacingMuted = false`. No claim is made about Dismiss behavior.

## Provider accounting

- `PROVIDER_REQUESTS_TOTAL = 19` delivered; the hard cap was 20.
- `AGENT_REQUESTS = 16` delivered.
- `RESURFACING_JUDGE_REQUESTS = 3` delivered.
- `SEMANTIC_PROVIDER_REQUESTS = 0`.
- `DENIED_PRE_DISPATCH = 0` live; the separate offline cap test denied the fake 21st request before transport.
- `FAILED = 0`.

## Browser, Host, and tool audit

`BROWSER_RELEVANT_ERRORS = 0`: page errors 0, unhandled rejections 0, `console.error` events 0, failed Idea RPCs 0, visible product alerts 0, native browser console error messages 0, and Host-log error/event-feed failure matches 0. All evaluate, semantic RPC, and Judge responses were HTTP 200.

Agent tool failures are classified separately from browser and Idea failures. The Agent encountered workspace-write Bash sandbox errors (`sandbox_apply: Operation not permitted`) in attempts 1 and 3. In attempt 3 it then requested escalation to full host access; that request was denied. The Agent continued within the disposable workspace, and no unconfined retry was approved. These tool/sandbox events did not produce failed Idea RPCs or browser errors.

Pre-scenario setup required these corrections: an initial plugin install targeted the workspace wrapper rather than `packages/dsh-idea` and was removed before the correct package was installed; an initial config dump therefore failed until the supported plugin bundle was registered; and one `workspace/create` envelope omitted the nested `request` field and was rejected as `gateway/arguments-invalid` before the corrected official Remote call succeeded. One incorrect CLI argument order exited before opening a listener. None occurred during a trigger turn or delivered a public-provider request; the final semantic config and runtime were verified before live prompts.

## Cleanup and integrity

The disposable Host was stopped; port 18795 was released; the validation page was closed; and the runtime (including workspace, copied credentials, logs, rig, and raw ledger), provider template, temporary template, and manifest scratch files were deleted. Port 3080 and the real `~/.dsh` were not used as runtime state. `HARNESS_TRACKED_DIFF = 0`; `EXECUTABLE_TEST_DRIFT = 0`; `PREEXISTING_UNTRACKED_DRIFT_PRESERVED = TRUE`; `NORMAL_3080_TOUCHED = FALSE`.

No product change or test change was made. This result does not close the positive-strip/Dismiss portion of Scenario I and does not self-accept T13.2. Stop with `T13_2_REAL_VALIDATION_INCONCLUSIVE_JUDGE` and await independent Final Acceptance.

## Closure ledger

- `BASELINE_SHA = 324190a21d56d55cec8db81dc9fa1461d67f232a`
- `TESTED_IMPLEMENTATION_SHA = 7f1703badb6e48845798d8444d00f1e12023c5d8`
- `HARNESS_SHA = ddefc45fbc7f8e46dd73185e68295696d1297887`
- `TARGET_ID = idea_06c38e6f-8e85-4292-bb8a-58018bad184c`
- `ATTEMPTS_USED = 3`
- `FIXTURE_1_RESULT = COMPLETED; EVALUATE + JUDGE DISPATCHED; NONE / REDUNDANT_WITH_CONTEXT`
- `FIXTURE_2_RESULT = COMPLETED; EVALUATE + JUDGE DISPATCHED; NONE / REDUNDANT_WITH_CONTEXT`
- `FIXTURE_3_RESULT = COMPLETED; EVALUATE + JUDGE DISPATCHED; NONE / REDUNDANT_WITH_CONTEXT`
- `REAL_EVALUATE_REQUESTS = 3`; `REAL_JUDGE_REQUESTS = 3`
- `REAL_STRIP_SURFACED = FALSE`; `DISMISS_COMPLETED = FALSE`; `DISMISS_NON_DURABLE = NOT_TESTED`
- `PROVIDER_REQUESTS_TOTAL = 19`; `AGENT_REQUESTS = 16`; `RESURFACING_JUDGE_REQUESTS = 3`; `SEMANTIC_PROVIDER_REQUESTS = 0`; `DENIED_PRE_DISPATCH = 0`; `FAILED = 0`
- `ATTRIBUTION_MECHANISM = A_SEATBELT_PROCESS_SCOPED_WRITE_DENIAL`; `ATTRIBUTION_SELF_TEST = PASS_EPERM_ON_O_WRONLY_SETTINGS_PROBE`
- `REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE`; `BROWSER_RELEVANT_ERRORS = 0`
- `PORT_18795_RELEASED = TRUE`; `DISPOSABLE_RUNTIME_DELETED = TRUE`; `PROVIDER_TEMPLATE_DELETED = TRUE`
- `HARNESS_TRACKED_DIFF = 0`; `EXECUTABLE_TEST_DRIFT = 0`; `PREEXISTING_UNTRACKED_DRIFT_PRESERVED = TRUE`; `NORMAL_3080_TOUCHED = FALSE`
