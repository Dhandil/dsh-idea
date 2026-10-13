# DSH Idea T13.2 Gate 1 — Native Workspace Picker Block

**Outcome:** `T13_2_GATE1_BLOCKED_NATIVE_WORKSPACE_PICKER`<br>
**Run:** `20261013T145100_fixtureA_final`<br>
**Baseline:** `85c2adca182187e518a1a89f1688701fd1c71fc0`<br>
**Harness reference:** `ddefc45fbc7f8e46dd73185e68295696d1297887`

## Decision

Gate 1 is blocked. The user reported seeing the macOS native **Select Workspace Directory** window, first closing it and later observing it again. This violated the accepted Browser Isolation Risk-Tier Freeze. No further browser/UI operation, directory selection, browser launch, Provider call, or Fixture A action was performed after the stop instruction. The native dialog is left for the user to cancel; this report does not claim it was dismissed or that native-window cleanup passed.

Gate 0 passed before the incident. Gate 1 did not pass its required workspace interaction preflight. Gate 2 was not entered: the exact Fixture A TARGET and trigger were not submitted, and no evaluate, candidate, Judge, or resurfacing UI result exists for this run.

## Evidence and limits

### Last Playwright action and locator

The persisted controller source supports a read-only `dom` inventory and a `clickButton` helper. The `dom` command enumerates buttons with `page.getByRole('button').evaluateAll(...)`; the click helper uses `page.getByRole('button', { name: input.name, exact: input.exact ?? true })`. The retained run record does not contain the input passed to that helper or a click event/locator audit. The surrounding run notes identify workspace-selector UI interaction and mention the visible labels `添加工作区` and `选择工作区`, but do not preserve their click order or the final helper input. The exact final button name and locator therefore cannot be proven. The read-only `dom` command itself did not open a picker.

The controller recorded zero page JavaScript `dialog` events. It did not register a Playwright `filechooser` listener, and its source contains no `setInputFiles` or file-upload operation. Therefore the zero `dialogEvents` value does not measure native macOS windows, and the available trace cannot rule out a browser file-chooser event independently. The user-visible native title and the read-only source mapping below are the evidence for the native-picker attribution.

### Likely application owner and call chain

The actual macOS window's owning process/application was not enumerated or captured. Attribution to a specific live PID is **unverified**. The source mapping is nevertheless direct and consistent with the observed title:

1. The Host launch record shows `pnpm dsh --profile web --host 127.0.0.1 --port 18795 --no-open`; it contains no `--patch` argument.
2. The shipped Web composition includes `directory-picker-auto`. Its resolver selects `native` on Darwin for a loopback `127.0.0.1` bind when SSH is absent. This run used those local conditions.
3. The resolver mounts the native Host backend and native Client directory-flow surface. The Workspace picker opens its directory-flow slot when the workspace-selection/add flow is invoked.
4. The native Client flow calls the Host `directoryPicker/pick` capability. On Darwin, `pickNativeDirectory` calls `execFile('osascript', ['-e', 'set selectedFolder to choose folder with prompt "Select Workspace Directory"', ...])`.

The observed title exactly matches that AppleScript prompt. This makes the Host-composed native directory-picker flow the strongly supported call-chain explanation. Since there is no retained `directoryPicker/pick` RPC trace, process tree for `osascript`, or native-window inventory, this is reported as source-based attribution rather than a captured runtime PID chain. No in-app browse fallback was active: the existing `apps/web/tests/pin-browse-picker.overlay.yml` was not passed to this Host launch.

### `workspace/create` order, authentication, and result

The Workspace UI source orders operations as follows: a picker returns a path; `onPicked(path)` invokes `createWorkspace({ path })`; the Client Workspace service calls the `workspace/create` Remote; the Host `WorkspaceController.create` then delegates to `WorkspaceCommands.create`. Opening the native picker precedes that RPC. If the picker is cancelled without returning a path, the UI takes `onCancel` and does not call `createWorkspace`.

The disposable Web loaded with title `DSH 本地构建`, and the Playwright session recorded the loopback Remote WebSocket `ws://127.0.0.1:18795/api/remote.mux`. This establishes that the authenticated Web surface loaded; the retained controller does not establish an authorization result for a particular RPC. Its `rpcNames` summary was empty, and it has no recorded `workspace/create` request or response. Accordingly, this run has **no verified `workspace/create` dispatch, authorization result, created workspace, or RPC result**. The app's native picker is a directory-selection capability, not a Playwright HTML file input.

### Why the prohibited native picker was reached

This was an execution error. The accepted Freeze explicitly says to use only official `workspace/create` Remote/RPC for workspace setup and not open the native picker. I instead used the Workspace UI directory-selection flow while trying to prepare the disposable Web workspace, and launched the shipped adaptive picker without the already-existing browse overlay. Under the local Darwin/loopback launch conditions, the adaptive picker selected `native` by design. The offline browser smoke did not prove which picker backend a real Harness Host would mount. The preflight therefore failed to apply the frozen interaction constraint before the UI action.

This is not evidence that the Freeze authorized the native window, nor that the app fell back from browse at runtime. The browse overlay was simply absent from the launch. No product, test, or Harness file was edited to investigate this incident.

## Gate and Provider ledger

| Gate | Result | Evidence |
| --- | --- | --- |
| Gate 0 — Host/CLI isolation | **PASS** | Host used a disposable `DSH_HOME`, bound only to `127.0.0.1:18795`, and ran under the accepted Seatbelt deny rule for `/Users/tongxin/.dsh`. The pre-boot nonmutating `open(...settings.yaml, O_WRONLY)` probe returned `EPERM`. |
| Gate 0 — provider template/guard | **PASS** | Stable provider-template snapshot was prepared for the disposable run; live enable marker remained absent. Offline fake-transport cap check allowed 20 and denied would-be request 21 before transport. Effective `dsh-idea-semantic.mode` was `off`. |
| Gate 1 — browser/Web | **BLOCKED** | Chrome for Testing 151.0.7922.34 with Playwright 1.61.1 loaded the disposable Web and connected to the loopback Remote WebSocket. The required safe workspace interaction was not established; the native picker appeared. |
| Gate 2 — Fixture A | **NOT ENTERED** | No Target or trigger submitted; no Agent, evaluate, candidate, Judge, strip, or dismiss outcome. |

Provider ledger: real public-provider dispatches **0**; semantic public-provider requests **0**; Fixture A Agent/Judge requests **0**. The request-21 cap test was synthetic and denied before transport. One Corepack metadata request to `registry.npmjs.org` was denied pre-dispatch as unclassified setup traffic; it was not a model-provider dispatch. No live-provider marker was created.

At the last retained browser-ready snapshot: one page/context; 30 requests on the disposable loopback page, one allowed Remote WebSocket, zero blocked external/page requests, zero console errors, zero page errors, zero request failures, zero unexpected pages, and zero browser crashes. These counters are a snapshot, not a post-interaction event ledger. The zero page-dialog counter does not cover native windows.

## Cleanup, attribution, and repository state

- Playwright had already closed the run-owned browser context: pages `1 → 0`, contexts `1 → 0`; the exact Chrome root/helper PID set was absent after close. No user Chrome process was targeted.
- The disposable Host was stopped by its exact verified PID (`84121`; pnpm parent `84107` exited with it). Listener checks found no remaining listener on `18795` or `18796`.
- A process-name inventory found no run-owned Chrome or `osascript` process after Host shutdown. This does not establish whether a native window remained open. Native macOS window/dialog count and dismissal remain **UNVERIFIED**; the user was asked to cancel it manually. GUI cleanup is therefore **not a full PASS**.
- The disposable runtime, browser profile/session data, provider copies, and provider template were removed after recording the non-sensitive facts in this report. No credential content, hashes, or sizes are included here.
- `HOST_CLI_REAL_DSH_WRITE_DENIAL=PASS`. `BROWSER_REAL_DSH_WRITE_DENIAL=NOT_OS_ENFORCED_ACCEPTED_RISK`, per the accepted Freeze. No direct evidence of unauthorized real `~/.dsh` access or modification was retained; this is not a kernel-level proof for the browser process.
- No tracked/index drift existed before this report. Existing `.DS_Store` files remain untracked. Harness HEAD remains `ddefc45fbc7f8e46dd73185e68295696d1297887`; its tracked tree remains clean and its pre-existing `deepseek-harness` symlink is preserved.
- No product, test, or Harness files were modified. No test suite, Canonical Full, Agent, Judge, or live Provider was run for this blocked outcome.

## Publication

This is a docs-only diagnostic report. Its containing commit and the fetched `origin/main` SHA are returned with the publication result. The report does not claim Fixture A acceptance or authorize resuming validation.
