# DSH Idea T13.2 Fixture A — Corrected Remote/RPC Live Validation Report

**Outcome: `T13_2_FIXTURE_A_LIVE_VALIDATION_BLOCKED_WORKSPACE_CREATE_RPC`.** Gate 0 passed. Gate 1 established an authenticated disposable browser session, then stopped at the single official `workspace/create` Remote call: HTTP transport returned 200, but the Remote result was `gateway/arguments-invalid`. The frozen rule required immediate STOP. No retry, Workspace UI fallback, Fixture A action, or provider request followed.

## Identity and scope

- dsh-idea baseline: `7f0d3a4d6d728164b5c1d9cffa8ce623a9d8cf69` (`HEAD == origin/main` at start).
- Tested executable: `7f1703badb6e48845798d8444d00f1e12023c5d8`.
- Harness read-only reference: `ddefc45fbc7f8e46dd73185e68295696d1297887`.
- The Browser Isolation Risk-Tier Freeze and Positive-Surface Fixture Freeze were read and followed. No product, test, or Harness file was changed. No test suite or Canonical Full was run.
- Before this report was created, dsh-idea tracked/index drift was zero. Existing `.DS_Store` files and the Harness `deepseek-harness` symlink were preserved.

## Gate 0 — PASS

The Host/CLI used the repository-external disposable runtime `/Users/tongxin/Developer/Harness/.t13-2-runtime-20261013_corrected_rpc_01/`, explicit `DSH_HOME`, and the accepted Seatbelt profile `(version 1) (allow default) (deny file-write* (subpath "/Users/tongxin/.dsh"))`. The strictly non-mutating `open("/Users/tongxin/.dsh/settings.yaml", O_WRONLY)` activation probe returned `EPERM` before Host launch. The Host listened only on `127.0.0.1:18795`; ports 18796 and 3080 had no listener at preflight.

A fresh provider-template whole-pair snapshot passed all four byte-equality comparisons on attempt 1 and was atomically published. The template was read-only; the runtime credentials copy was mode `0600`. No provider value, credential size, hash, or comparison bytes were emitted. The template and runtime copies were removed during cleanup.

The repository-external provider guard loaded through Node `--import`. Its offline fake-transport cap check allowed 20 requests and denied request 21 before transport. The live Gate 2 marker remained absent, the live provider ledger stayed empty, and the cap counter stayed at zero. The official boot-free `dsh --dump-config` output showed `dsh-idea-semantic.mode = off`; the frozen dsh-idea package was installed only under the disposable `web` profile.

The secret-safe real `~/.dsh` manifest had 1,772 entries before and after the run, with zero metadata/content-comparison differences. The credentials file matched the stable snapshot by boolean comparison. Host/CLI write denial is proven by Seatbelt; the independent browser remained the freeze-accepted same-user filesystem risk and was not OS-denied from real paths. The manifest is corroborating evidence and is not presented as browser write-denial proof.

## Gate 1 — STOP at official Workspace RPC

Chrome for Testing launched outside the Host/CLI Seatbelt with a fresh run-owned profile, `HOME`, `DSH_HOME`, `TMPDIR`, `XDG_CACHE_HOME`, and `XDG_CONFIG_HOME`. The launch used Playwright 1.61.1, `--use-mock-keychain`, Chromium's default sandbox settings, and no `--no-sandbox` or outer Seatbelt. Explicit arguments were `--user-data-dir=<run>/browser-profile`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=18796`, `--no-first-run`, `--no-default-browser-check`, `--disable-background-networking`, `--disable-component-update`, `--disable-sync`, `--use-mock-keychain`, `--window-size=1440,1000`, and `--app=about:blank`. The installed Chrome bundle metadata reported `151.0.7922.34`; Playwright connected over CDP and its `browser.version()` call completed, but the returned runtime version string was not persisted in the stop record. The browser exited normally with code 0. The accepted default Crashpad command-line residual remains applicable; this run recorded no Chrome crash and did not inspect or modify a Crashpad directory.

The browser followed the Host-issued authentication URL to `http://127.0.0.1:18795/`. The final URL had no query string, the page title was `DSH 本地构建`, an HttpOnly `dsh-auth-*` cookie was present without exposing its value, and the page's initial authenticated API calls returned HTTP 200. The temporary workspace directory existed under the run root and its canonical path and owner UID were verified before the Remote call.

Exactly one same-origin `POST /api/workspace/create` was sent after authentication using the official `client-request` envelope and a unique `rpcId`. The HTTP response was 200 and the response `rpcId` matched, but `result.ok` was false with `error.code = gateway/arguments-invalid`; no workspace ID or successful returned path was produced. Post-stop static inspection shows the Harness Remote declaration is `create(request: WorkspaceCreateRequest)`, while this request supplied `payload.args.path` directly. That is consistent with the Gateway validation error. The run stopped immediately and sent no corrected request. The temporary directory was not treated as a registered Workspace and was deleted during cleanup.

No Workspace UI control was clicked, no browse overlay was loaded, and no `directoryPicker/pick` RPC was observed. Because the RPC failed, the planned safe Settings click and reload were not performed; Gate 1 functional UI/RPC/WebSocket compatibility is therefore incomplete, not a PASS. Playwright click count was 0. The controller recorded zero page errors, console errors, local request failures, blocked external origins, unexpected pages, downloads, and file-chooser events. The WebSocket handshake was not persisted before the stop, so it is **NOT VERIFIED**. The Chrome root PID was `87153`, owned by the exact run profile; the exact-profile process scan was empty after close. The Chrome descendant PID list was not persisted. Native macOS window/dialog inventory is **UNVERIFIED** because the available interface cannot enumerate OS-owned windows.

## Gate 2 — NOT RUN

The exact Fixture A TARGET was not entered or saved, so `TARGET_ID = NONE`. Direct Save, target readback, Pause/Resume, exact trigger, completed Agent turn, detector, retrieval, evaluate, candidate, real Judge, Final Delivery Gate, suggestion strip, and dismiss were **NOT RUN**. There is no Judge outcome or UI result, and no silence is attributed to H1 or any product stage.

The frozen exact TARGET and trigger remained unchanged and were not submitted:

- **Title:** 塔防的旋转攻击范围模块
- **Core:** 不要只让塔拥有固定圆形或扇形攻击范围。给每座塔增加一个独立的“旋转范围模块”：攻击覆盖形状本身不变，但玩家可以在部署后有限次数旋转覆盖方向。不同塔通过旋转次数、旋转冷却和覆盖形状形成空间构筑差异。
- **Possible Value:** 把“塔的差异”从单纯数值差异变成空间决策。玩家需要考虑道路转角、敌人来向和不同塔之间的覆盖拼接。
- **Use When:** 当塔防玩法已经有基础攻击范围，但不同塔的部署决策仍然过于相似时。
- **Current Conclusion:** 先只做“固定形状 + 可有限旋转”的 Prototype，不加入自由绘制或复杂模块拼装。
- **Exact trigger:** `我准备重新做一款塔防游戏。现在不同塔虽然数值和技能不同，但摆放时的思考还是太像了，我想让不同塔在空间布局上真正产生不同决策，第一步应该尝试什么？`

## Provider ledger and cleanup

- Live public-provider dispatches: **0**; Agent: **0**; Resurfacing Judge: **0**; semantic public-provider requests: **0**; live failures: **0**.
- Offline cap check: **20 fake transports allowed; request 21 denied before transport**. Live cap reservations: **0**; Gate 2 marker: **absent**.
- Host process group `86649` (PIDs `86649`, `86656`, `86657`) received `SIGTERM`; the exact group became empty. Port 18795 was released.
- Chrome PID `87153` exited with code 0. Playwright had 1 page and 1 context before close; after browser-process exit, pages = 0 and contexts = 0. Exact-profile browser processes = 0; port 18796 had no listener. Port 3080 had no listener and was not used. No user Chrome process was terminated.
- The disposable runtime, browser profile, temporary workspace, provider-template pair, credentials copies, logs, guard, and manifests were removed by their exact run-owned paths. No temporary template remains.
- Automation process cleanup is verified. Native macOS windows/dialogs remain **UNVERIFIED**, so this report does not claim a full GUI cleanup PASS.

**Disposition:** stop at Gate 1 and wait for independent review. Do not retry Workspace RPC or resume Fixture A automatically. T13.3/T14 were not entered. The report commit and post-fetch remote SHA are returned with delivery because a document cannot contain its own final commit SHA without changing that SHA.
