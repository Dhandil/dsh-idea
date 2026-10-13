# DSH Idea T13.2 Fixture A Final Validation — 2026-10-13

**Outcome:** `T13_2_FIXTURE_A_FINAL_VALIDATION_BLOCKED_EXACT_TARGET_DIRECT_SAVE_UI`
**Baseline:** `410913e0a0a478113167ea31c2214c16b048ba38`
**Tested dsh-idea executable:** `7f1703badb6e48845798d8444d00f1e12023c5d8`
**Harness:** `ddefc45fbc7f8e46dd73185e68295696d1297887`
**Scope:** One frozen T13.2 Fixture A validation attempt. No product, test, or Harness source was changed; no test suite or Canonical Full was run.

## Read-only Workspace RPC contract preflight

Harness source defines the Connection request as `type`, `rpcId`, `method`, and `payload` (`packages/client/connection/src/rpc.ts`). The browser transport posts that envelope to `/api/workspace/create` with `payload` unchanged (`packages/client/connection/src/client/rpc.ts`). `WorkspaceController.create(request: WorkspaceCreateRequest)` declares a single parameter named `request`, and `WorkspaceCreateRequest` is `{ path: string }` (`packages/api/workspace-controller/src/index.ts` and `src/types.ts`). Gateway parsing requires `payload` to contain exactly `args`, then requires `args` to contain exactly the declared parameter names (`packages/api/gateway/src/index.ts`). Therefore the complete request shape is:

```json
{"type":"client-request","rpcId":"<unique>","method":"workspace/create","payload":{"args":{"request":{"path":"<absolute temporary path>"}}}}
```

The successful value contract is `result.ok === true` and `result.value === { workspace: { workspaceId, path, title, sessionIds, createdAt, updatedAt }, created }`, inside a `server-response` envelope with the matching `rpcId`. The prior corrected-RPC report records that `payload.args.path` was rejected and the corrected official Remote call with nested `request` succeeded; it does not retain the successful serialized body. Source descriptor and that history agree on `args.request.path`.

Before starting Host or Chrome, a local structural assertion checked the exact envelope keys, the nested `request.path`, an absolute path beneath the unique run root, and zero network dispatch. It passed.

## Gate 0 — PASS

At start, dsh-idea `HEAD == origin/main == 410913e0a0a478113167ea31c2214c16b048ba38`; tracked and index drift were zero. The pinned Harness checkout was at `ddefc45fbc7f8e46dd73185e68295696d1297887`. Existing `.DS_Store` files and the untracked Harness `deepseek-harness` symlink were preserved.

Host and CLI ran with the accepted Seatbelt rule `(version 1) (allow default) (deny file-write* (subpath "/Users/tongxin/.dsh"))`, explicit disposable DSH_HOME, and loopback-only Host port 18795. The non-mutating `open("/Users/tongxin/.dsh/settings.yaml", O_WRONLY)` activation probe returned `EPERM`. A fresh settings/credentials provider pair passed all four byte-equality comparisons on attempt 1; the published temporary template was read-only and its runtime credential copy was mode 0600. Both source files compared equal to the temporary snapshot after cleanup. This pair comparison is corroborative; it does not prove the separately launched browser was unable to access user files.

The repository-external pre-dispatch provider guard passed its offline cap check: 20 fake transports were allowed and request 21 was denied before fake transport. Official `dsh --dump-config` showed `dsh-idea-semantic.mode = off`. The live counter remained 0, Gate 2 marker remained absent until the run stopped, and no provider request was dispatched.

Setup required command corrections before Host boot: an initial package-manager invocation used the wrong command/cwd; a later invocation without the cached pnpm shim caused Corepack to attempt a registry metadata fetch. The guard denied that one non-provider `registry.npmjs.org` fetch before network dispatch. The install then succeeded with the cached pnpm shim and offline mode. An initial temporary overlay had the wrong YAML shape; the corrected overlay passed the official config dump with semantic mode off. These setup events changed no product, test, or Harness source and caused no provider dispatch.

There was no listener on 18795, 18796, or 3080 before launch. The Host later listened only on 127.0.0.1:18795; port 3080 remained unused.

## Gate 1 — functional checks passed; process-tree evidence partial

The disposable Host authentication URL was opened only in this run's Playwright-managed Chrome for Testing profile. The page settled at `http://127.0.0.1:18795/` with title `DSH 本地构建`, no query string, and an authenticated `dsh-auth-*` cookie. Initial authenticated API calls returned HTTP 200. Playwright 1.61.1 connected to Chrome for Testing 151.0.7922.34; the version mismatch was accepted only after this real Web preflight completed successfully.

Chrome launched as PID/PGID 88950 from the existing Playwright-managed binary with a fresh profile and dedicated HOME, DSH_HOME, TMPDIR, XDG cache, and XDG config directories. It used `--use-mock-keychain`, Chromium's own sandbox, and no outer Seatbelt or `--no-sandbox`. The explicit arguments were the owned `--user-data-dir`, loopback remote-debugging address/port 18796, `--no-first-run`, `--no-default-browser-check`, `--disable-background-networking`, `--disable-component-update`, `--disable-sync`, `--use-mock-keychain`, `--window-size=1440,1000`, and `--app=about:blank`. The accepted Chrome for Testing default Crashpad path remains a same-user platform residual risk; this run recorded no crash and did not inspect or modify that path.

After authentication, exactly one official `workspace/create` request was sent with `payload.args.request.path` set to the run-owned temporary directory. HTTP status was 200, `result.ok` was true, `created` was true, and the returned path canonicalized to the run directory owned by UID 501. **Workspace ID:** `e5669b3f-c6d7-4f25-b9fa-506799de2e19`. No Workspace UI control, directory picker, native picker, browse overlay, or UI fallback was used.

The Remote WebSocket `ws://127.0.0.1:18795/api/remote.mux` connected on initial navigation and reconnected after reload (delta 1). A safe `设置` button click was recorded through the exact role/name locator; reload retained authentication. Browser HTTP, click, reload, and WebSocket checks completed with zero unauthorized page origins, popups, file chooser events, page errors, console errors, or failed requests. Every Playwright click was logged with a sanitized role/name locator, target, and result. The observed clicks were `设置` during Gate 1, then `设置`, `Ideas`, and `＋ 新建 Idea` during Gate 2 inspection; no Workspace control was clicked.

The browser root PID, profile, executable, and unique process group were recorded, and the group was empty after normal exit code 0. The live descendant PID list was not captured before shutdown, so process-tree evidence is partial. Native macOS window/dialog inventory is `UNVERIFIED`; Playwright cannot enumerate OS-owned windows. Do not interpret that as a full GUI PASS. The Host/CLI write-denial result is `PASS`; the independent browser's real-`~/.dsh` write denial remains `NOT_OS_ENFORCED_ACCEPTED_RISK` under the accepted freeze.

## Gate 2 — BLOCKED before saving Fixture A

An official read-only `idea/list` returned HTTP 200, `result.ok = true`, and an empty current Idea list. The real Settings → Ideas → `＋ 新建 Idea` UI exposed one raw-note textarea and the `直接保存` / `AI 整理` actions, with no separate Core, Possible Value, Use When, or Current Conclusion inputs. Harness source confirms that direct quick capture derives the title from the first non-empty line and places the complete note in `core`; it does not create the frozen multi-field draft. The AI-organize path would use a provider and is outside the frozen Direct Save precondition.

To preserve the exact Fixture A and Direct Save contract, no note was entered or saved. `TARGET_ID = NONE`. The exact frozen TARGET draft and trigger were not submitted or rewritten:

- Title: 塔防的旋转攻击范围模块
- Core: 不要只让塔拥有固定圆形或扇形攻击范围。给每座塔增加一个独立的“旋转范围模块”：攻击覆盖形状本身不变，但玩家可以在部署后有限次数旋转覆盖方向。不同塔通过旋转次数、旋转冷却和覆盖形状形成空间构筑差异。
- Possible Value: 把“塔的差异”从单纯数值差异变成空间决策。玩家需要考虑道路转角、敌人来向和不同塔之间的覆盖拼接。
- Use When: 当塔防玩法已经有基础攻击范围，但不同塔的部署决策仍然过于相似时。
- Current Conclusion: 先只做“固定形状 + 可有限旋转”的 Prototype，不加入自由绘制或复杂模块拼装。
- Exact trigger: 我准备重新做一款塔防游戏。现在不同塔虽然数值和技能不同，但摆放时的思考还是太像了，我想让不同塔在空间布局上真正产生不同决策，第一步应该尝试什么？

Pause/Resume, exact trigger, Agent turn, detector, retrieval, evaluate, candidate generation, real Judge, Final Delivery Gate, suggestion strip, and dismiss were **NOT RUN**. Judge is `NOT RUN`; strip/dismiss are `NOT RUN`. No pipeline silence is attributed to H1 or to any other stage. No Fixture A attempt was consumed.

## Provider ledger, cleanup, and attribution

- Public-provider dispatches: **0** (Agent 0, Resurfacing Judge 0, semantic 0); live cap counter: **0**; request 21: offline fake-transport pre-dispatch denial verified.
- One non-provider Corepack registry metadata request was denied before dispatch during setup. The guard ledger contained zero `api.deepseek.com` requests and zero dispatched requests.
- Automation pages: 1 before close, 0 after explicit close. Playwright context: 1 before close; browser close resolved and normal Chrome process exit disposed the context. Remaining CDP page targets/windows: 0. Chrome PID/PGID 88950 had no remaining processes. Native macOS window inventory: `UNVERIFIED`.
- Host process group 88548 (PIDs 88548, 88561, 88564) received SIGTERM; the exact group became empty. Listeners on 18795, 18796, and 3080: 0 after cleanup. Port 3080 was not used.
- Disposable Host, workspace, profile, HOME, provider template, credential copies, logs, guard, and controller files were removed by exact paths. No broad process termination was used. Host/CLI writes to real `~/.dsh` were OS-denied; the independent browser's same-user filesystem risk remains accepted and is not presented as OS isolation. Settings and credential files matched the pre-run pair snapshot, which is corroborative only.
- No native picker was invoked. The OS-owned window inventory remains unverified. No claim of full GUI PASS is made.
- Existing `.DS_Store` files and the Harness symlink remain untouched; tracked product/test/Harness drift is zero. No tests or Canonical Full were run.

This result is blocked before the Fixture A scenario because the frozen exact multi-field TARGET cannot be produced through the available Direct Save UI. It does not accept T13.2 and does not start T13.3/T14. Await independent review.
