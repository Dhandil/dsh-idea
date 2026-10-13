# DSH Idea T13.2 Fixture A Final Guarded Live Validation

**Outcome: `T13_2_FIXTURE_A_FINAL_GUARDED_LIVE_VALIDATION_BLOCKED_BROWSER_REAL_USER_DATA_SIGNAL`.** Gate 0 passed. Gate 1 started the disposable Host and real Chrome for Testing, but stopped before completing functional preflight when a run-owned Chrome Crashpad helper exposed a database path under the real user Library. Gate 2 was not entered. No Agent, Judge, or public provider request was dispatched.

## Pinned inputs and repository preflight

- Accepted Browser Isolation Risk-Tier Freeze and dsh-idea baseline: `48bd72140316ae6f62ae20c3d263aaa81b9889d1` (`HEAD == origin/main` at start).
- Tested executable: `7f1703badb6e48845798d8444d00f1e12023c5d8`; the current `packages/dsh-idea` tree matched that commit.
- Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887`; prebuilt `apps/cli/lib/bin.js` used without a build.
- Initial tracked and index drift were zero. The existing dsh-idea `.DS_Store` files and Harness `deepseek-harness` symlink were preserved; Harness tracked diff remained zero.
- No product, test, or Harness file was changed. No test suite or Canonical Full was run.

## Gate 0 — PASS

The Host/CLI Seatbelt profile was `(version 1) (allow default) (deny file-write* (subpath "/Users/tongxin/.dsh"))`. Its pre-boot, non-mutating probe attempted only `open("/Users/tongxin/.dsh/settings.yaml", O_WRONLY)` and returned `EPERM`; it did not use create, truncate, write, rename, or unlink flags. The Host was launched under this profile with `DSH_HOME` directed to the disposable runtime.

A fresh whole-pair provider snapshot succeeded on attempt 1. All four required byte-equality comparisons passed in memory, the credentials copy was mode `0600`, and the pair was atomically published to the repository-external template. No credential content, hash, size, or comparison material was emitted. The template and runtime copies were removed during cleanup.

The repository-external provider guard passed its offline fake-transport cap check: 20 fake dispatches were allowed and would-be request 21 was denied before transport. The live Gate-2 enable marker was never created. The supported disposable `cordis.patch.yml` override set `dsh-idea-semantic.mode: off`; the boot-free official `--dump-config` output confirmed the effective value without retaining the dump.

At preflight, ports `18795`, `18796`, and normal Harness `3080` had no listener. The disposable Host later bound only `127.0.0.1:18795`; it never contacted port `3080`.

One setup-only Corepack request for `registry.npmjs.org/pnpm/latest` was denied pre-dispatch by the guard as `EXTERNAL_UNCLASSIFIED`. It was package-manager metadata, not an LLM-provider request. The local cached pnpm executable then installed the local dsh-idea package offline. No network dispatch occurred for that denied request.

## Gate 1 — STOPPED; functional preflight incomplete

The disposable Host started from the pinned Harness executable. A first official `workspace/create` Remote call returned HTTP `401` before the browser session was authenticated; it created no workspace. The authenticated browser session then loaded the disposable Web at `http://127.0.0.1:18795/` with page title `DSH 本地构建`. Playwright's CDP `Browser.getVersion` returned `Chrome/151.0.7922.34`. One startup observation also recorded the allowed `ws://127.0.0.1:18795/api/remote.mux` socket. Browser HTTP and WebSocket route guards recorded zero blocked external origins.

The browser used Playwright `1.61.1` with the existing Chrome for Testing `151.0.7922.34`, a version mismatch. It launched with a fresh run-owned profile and separate `HOME`, `DSH_HOME`, `TMPDIR`, and XDG directories; `--use-mock-keychain` was present, Chromium's own sandbox was enabled, no outer Seatbelt was applied, and no `--no-sandbox` argument was present. Playwright used `--remote-debugging-pipe`; port `18796` remained unused. The initial `browser.version()` accessor mistake in the controller ended the first connected session after page load; it was not a Chrome crash. The second session connected and loaded the Web, but was stopped before navigation controls, reload, or successful workspace RPC compatibility could be completed.

The stop signal was a run-owned Chrome for Testing Crashpad helper whose command line contained `--database=/Users/tongxin/Library/Application Support/Google/Chrome for Testing/Crashpad`, despite the browser's disposable HOME and profile. This is a credible real-user-data-path signal under the freeze's stop rule. The command-line observation does not by itself prove that the directory was opened or modified; no filesystem trace was running, and the directory was not inspected or changed. No retry with different browser parameters was made.

No native directory picker was opened. The workspace was not created. UI selector/click/reload checks and the successful official `workspace/create` RPC were not completed, so Gate 1 is not a PASS. The CUA inventory exposed no native app/window inventory; native macOS dialogs are `UNVERIFIED`.

## Gate 2 — NOT RUN

The exact frozen Fixture A was not submitted and no TARGET was created, so `TARGET_ID = NONE`. The unexecuted TARGET draft was:

- **Title:** 塔防的旋转攻击范围模块
- **Core:** 不要只让塔拥有固定圆形或扇形攻击范围。给每座塔增加一个独立的“旋转范围模块”：攻击覆盖形状本身不变，但玩家可以在部署后有限次数旋转覆盖方向。不同塔通过旋转次数、旋转冷却和覆盖形状形成空间构筑差异。
- **Possible Value:** 把“塔的差异”从单纯数值差异变成空间决策。玩家需要考虑道路转角、敌人来向和不同塔之间的覆盖拼接。
- **Use When:** 当塔防玩法已经有基础攻击范围，但不同塔的部署决策仍然过于相似时。
- **Current Conclusion:** 先只做“固定形状 + 可有限旋转”的 Prototype，不加入自由绘制或复杂模块拼装。

The exact trigger was not sent:

```text
我准备重新做一款塔防游戏。现在不同塔虽然数值和技能不同，但摆放时的思考还是太像了，我想让不同塔在空间布局上真正产生不同决策，第一步应该尝试什么？
```

Direct Save, official TARGET readback, Pause/Resume, Agent turn, detector, retrieval, evaluate, candidate generation, Judge, Final Delivery Gate, suggestion strip, and dismiss were all **NOT RUN**. There is no Judge outcome, strip evidence, or dismiss evidence. No pipeline silence is attributed to H1 or another stage.

## Provider ledger

| Metric | Result |
|---|---:|
| Live public-provider dispatches | **0** |
| Agent | **0** |
| Resurfacing Judge | **0** |
| Semantic public-provider requests | **0** |
| Live provider failures | **0** |
| Pre-dispatch denial | **1 non-provider Corepack metadata request** (`registry.npmjs.org/pnpm/latest`); zero dispatch |
| Cap self-test | **20 fake transports allowed; request 21 denied pre-dispatch** |
| Live request 21 | **Not attempted** |

The live ledger remained at `dispatched=0`, `denied=1`, `failed=0`; the single denial was the non-provider package-manager lookup above. No Agent, Judge, or semantic request was sent.

## Isolation and cleanup

- **Host/CLI real `~/.dsh` write denial:** PASS by the activated Seatbelt probe.
- **Browser real-user-data signal:** OBSERVED at the Chrome Crashpad command-line path above. Actual file access or mutation is unverified. The browser domain was not OS-denied from real user paths, so this report does not certify `REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE` for the full run.
- **Browser process ownership:** the two Chrome roots were `81716` and `81761`, each using the run-owned profile. The second run also observed controller PID `81760`, Crashpad helpers `81763`/`81765`, and profile-bound Chrome helpers `81769`, `81771`, `81774`, and `81775`. Only the run-owned controller and Host PID `81577` were explicitly signaled. Final exact-profile process scans found no remaining browser/controller process.
- **Automation pages/contexts:** first session's Playwright close reported pages `0`, contexts `0`. The second session was terminated after the stop signal; its final Playwright object counts were not emitted, but its owning controller and all Chrome processes exited, leaving no live browser pages or contexts. Second Chrome exit status was not captured.
- **Host and ports:** Host PID `81577` received `SIGTERM`; listener counts for `18795` and `18796` were zero after cleanup. Port `3080` was not used; no user browser was terminated.
- **Temporary resources:** disposable runtime, browser profile/cookie data, copied credentials, guard/ledger, and provider template were removed by exact run-owned paths.
- **Native macOS windows/dialogs:** `UNVERIFIED`; the available CUA surface returned `apps: []`. No full GUI PASS is claimed.
- `.DS_Store` files and the Harness symlink remain untouched. dsh-idea tracked/index drift remained zero before this report was added.

**Disposition:** stop at Gate 1 and await independent review of this report. Do not resume Fixture A automatically and do not enter T13.3/T14.
