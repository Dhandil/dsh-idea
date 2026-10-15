# DSH Idea T13.2 — Final Fixture A Live Acceptance

- **Outcome:** `T13_2_FINAL_FIXTURE_A_BLOCKED_PROVIDER_STAGE_ATTRIBUTION`
- **Date:** 2026-10-15
- **Baseline:** `84d315982ac131dd856ff0774c16bba5006da7e7`
- **Tested executable:** `7f1703badb6e48845798d8444d00f1e12023c5d8`
- **Harness read-only reference:** `ddefc45fbc7f8e46dd73185e68295696d1297887`
- **Report revision baseline:** `84d315982ac131dd856ff0774c16bba5006da7e7`; the final report commit SHA is returned with the fetch verification.
- **Scope:** Frozen T13.2 Fixture A, Gate 0 → Gate 1 → Gate 2, under the [Browser Isolation Risk-Tier Freeze](../architectue/DSH_IDEA_T13_2_BROWSER_ISOLATION_RISK_TIER_FREEZE.md) and [Fixture A freeze](../architectue/DSH_IDEA_T13_2_POSITIVE_SURFACE_FIXTURE_FREEZE.md). No product, tests, Harness, or Freeze files changed; no Canonical Full or test suite run.

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| Gate 0 — isolation and preflight | **PASS** | dsh-idea `HEAD == origin/main == 84d3159…`; tracked/index clean before the report. The PAH/MCP task review found no active browser-task owner or conflicting session. `@playwright/mcp 0.0.83` processes used `--isolated`; connected Chrome PID `52055` used a temporary `playwright_chromiumdev_profile-nci3cl` under macOS `/var/folders/.../T/`, separate from the user's `Google/Chrome/Default`. The separate normal Chrome process was left alone. Host/CLI Seatbelt activation probe returned `EPERM`; disposable `DSH_HOME`, loopback port `18795`, provider guard cap `20`, and semantic mode off were verified. No provider request occurred before Gate 2 authorization. |
| Gate 1 — disposable Web and browser | **PASS** | Official `workspace/create` returned HTTP 200, `ok=true`, `created=true`, Workspace ID `ad6185ad-5fab-4db9-af53-97de9d24de0b`, with its path inside this run's temporary home. UI selected `fixture-a-workspace`; no native directory picker was opened. Settings → Ideas loaded and the official Idea list was empty. The page used `ws://127.0.0.1:18795/api/remote.mux`; after reload, 4 frames were sent and 4 received, with no page errors, console errors, or outside-origin requests. Provider count remained 0. |
| Gate 2 — Fixture A | **BLOCKED: `PROVIDER_STAGE_ATTRIBUTION`** | The frozen v1 → v2 field checks, Pause → Resume, one trigger, real Judge `SURFACE`, reminder strip and non-durable “本次忽略” check all produced the expected evidence below. The provider ledger recorded all five calls as `AGENT_OR_OTHER`, with no `RESURFACING_JUDGE` stage entry. The Freeze requires stopping on stage-attribution ambiguity, so this run is not an unconditional Gate 2 PASS. No retry or second trigger was sent. |

## Fixture A UI and RPC evidence

The frozen TARGET text and exact trigger were used unchanged. UI order and accessible controls:

```text
我准备重新做一款塔防游戏。现在不同塔虽然数值和技能不同，但摆放时的思考还是太像了，我想让不同塔在空间布局上真正产生不同决策，第一步应该尝试什么？
```

1. `设置` → `Ideas` → `＋ 新建 Idea`.
2. In the direct-capture textbox `想到什么就写下来，保存为一条 Idea…`, entered the frozen title and core, then clicked `直接保存` once. This created Idea `idea_ab9e5d65-723a-47b7-8270-7b93102e6f66`, v1 `idea_ver_fc32a182-96f6-4db7-9c7a-2a45131a428e` (`initial-save`).
3. Opened that Idea from the list, clicked `编辑`, populated the full frozen field set (including empty motivation and open questions), and clicked `保存为新版本` once. v2 is `idea_ver_a9dd10ba-8875-4534-9f9d-e64f31956011` (`manual-edit`). The text fields were addressed by their visible form labels: `为什么值得保留`, `当前结论`, `可能价值`, `适用场景（每行一条）`, and `待解决问题（每行一条）`, along with title and core.
4. Official read-only `idea/list`, `idea/get`, `idea/getVersions`, and `idea/getVersion` all returned HTTP 200 and `ok=true`: one canonical Idea, exactly two versions, exact frozen v2 fields, unchanged v1 initial-save content, and current version v2.
5. In the Idea detail, clicked `暂停提醒`; official `idea/get` read back `resurfacingMuted=true`. Clicked `恢复提醒`; read-back was `false`.
6. In a fresh conversation, filled the message textbox `发消息或创建任务, / 调用指令, @ 文件或对话` with the exact frozen trigger and clicked `发送消息` once. The Agent turn completed. The live RPC sequence included `idea/evaluateResurfacing`, `idea/semanticResurfacingCandidates`, and `idea/judgeResurfacing`, all HTTP 200. The real Judge response was `SURFACE / ADDS_MISSING_OPTION` for the Fixture A Idea.
7. The UI displayed `Idea 提醒` with `查看`, `引用`, `本次忽略`, and `暂停提醒`. Clicked `本次忽略` once. The strip disappeared; official `idea/get` returned `resurfacingMuted=false`.

The provider guard recorded 5 reserved and 5 completed ledger rows, ordinals 1–5; all 5 outbound requests reached `api.deepseek.com/anthropic/v1/messages` and completed HTTP 200. `PROVIDER_TOTAL=5/20`, `DENIED_PRE_DISPATCH=0`, `SEMANTIC_PROVIDER_REQUESTS=0`, cap not reached. Every ledger row was classified `AGENT_OR_OTHER`; no Judge-specific count can be claimed. One Agent Bash tool invocation failed because the workspace sandbox backend returned `sandbox_apply: Operation not permitted`; the Agent then used a read-only file-listing tool and completed the turn. No second Agent turn or Provider request was made.

## Browser risk, evidence, and cleanup

- `HOST_CLI_REAL_DSH_WRITE_DENIAL=PASS` (Seatbelt activation probe: `EPERM`). `BROWSER_REAL_DSH_WRITE_DENIAL=NOT_OS_ENFORCED_ACCEPTED_RISK`; the freeze's accepted same-user browser residual remains. No claim is made that the browser was kernel-blocked from every real-user path.
- Browser details exposed by the MCP: `@playwright/mcp 0.0.83`, `--isolated`, Chrome PID `52055`, temporary profile suffix `playwright_chromiumdev_profile-nci3cl`; Chrome helper reported build `155.0.8059.40`. MCP process/browser details not exposed beyond those OS process arguments are `NOT_EXPOSED`. Shared MCP processes/profile were not stopped, cleared, or reconfigured.
- `AUTOMATION_BROWSER_CLEANUP=PASS`: `browser_tabs` returned no open tabs after closing the only run page. The run created no separate browser process or context; MCP context identifiers are `NOT_EXPOSED`. Shared MCP Chrome and service remained intact. Run-owned Host PID `53508` exited and port `18795` had no listener. Temporary runtime, provider template, and this run's `.playwright-mcp` directory were removed. No other project or profile was touched.
- `NATIVE_MACOS_DIALOG_INVENTORY=UNVERIFIED`; no native workspace picker was opened.
- Screenshots retained outside the repository at `/Users/tongxin/Developer/Harness/.t13-2-evidence-20261015_fixture_a_mcp_01/`: `01-gate1-workspace.png` through `08-trigger-ready.png`, `09-surface-strip.png`, `10-dismissed.png`, and `11-cleanup-empty.png`. They show the workspace, direct save, v1, structured edit, v2, pause/resume, trigger, SURFACE strip, post-ignore state, and empty Idea list.
- After deletion, official `idea/list` returned HTTP 200 with `ok=true` and `[]` (RPC ID `ba409b6e-b25b-43bb-b550-766ed4d452f8`). UI also showed `还没有保存的 Idea`. This run's Idea and workspace data were removed with the disposable runtime.
- Pre-existing untracked `.DS_Store` files were preserved. Harness tracked diff remained zero. No real Chrome data, normal Harness state, or unrelated project resource was cleaned.

## Closure ledger

- `BASELINE_SHA = 84d315982ac131dd856ff0774c16bba5006da7e7`
- `TESTED_EXECUTABLE_SHA = 7f1703badb6e48845798d8444d00f1e12023c5d8`
- `HARNESS_SHA = ddefc45fbc7f8e46dd73185e68295696d1297887`
- `GATE_0 = PASS`; `GATE_1 = PASS`; `GATE_2 = BLOCKED_PROVIDER_STAGE_ATTRIBUTION`
- `TARGET_ID = idea_ab9e5d65-723a-47b7-8270-7b93102e6f66`; `VERSION_COUNT = 2`
- `REAL_JUDGE = SURFACE / ADDS_MISSING_OPTION`; `REMINDER_STRIP = SHOWN`; `本次忽略 = CLICKED_ONCE`; `POST_IGNORE_MUTED = false`
- `PROVIDER_TOTAL = 5/20`; `AGENT_OR_OTHER = 5`; `RESURFACING_JUDGE = NOT_ATTRIBUTABLE`; `SEMANTIC = 0`; `DENIED_PRE_DISPATCH = 0`
- `PORT_18795_RELEASED = TRUE`; `TEMP_RUNTIME_DELETED = TRUE`; `PROVIDER_TEMPLATE_DELETED = TRUE`; `RUN_PAGE_CLOSED = TRUE`
- `NATIVE_MACOS_DIALOG_INVENTORY = UNVERIFIED`; `BROWSER_REAL_DSH_WRITE_DENIAL = NOT_OS_ENFORCED_ACCEPTED_RISK`

Stop here for independent final architecture acceptance. This report does not self-accept T13.2 and does not start T13.3/T14.
