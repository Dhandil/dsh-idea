# T13.2 Fixture A Browser Startup Diagnostic

**Outcome:** `T13_2_FIXTURE_A_BROWSER_STARTUP_DIAGNOSTIC_READY_FOR_ARCHITECTURE_REVIEW`<br>
**Run:** `20261013T095053_fixtureA`<br>
**Date:** 2026-10-13 (Asia/Shanghai)<br>
**Status:** Browser Startup Gate diagnostic only. Fixture A live validation was paused before any authenticated browser session or scenario action.

## Identity and scope

- Positive-Surface Freeze baseline: `e9ff6dc51483e0ce750343bad285cb6a390a9a90`
- Tested implementation: `7f1703badb6e48845798d8444d00f1e12023c5d8`
- Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887`
- This run changed no product code, tests, or Harness files. The only repository change is this report.
- Fixture A draft was **not entered**. No TARGET was created or read back, so there is no TARGET ID. Direct Save, Pause/Resume, trigger, evaluate, candidate generation, Judge, Final Delivery Gate, suggestion strip, and dismiss were **not reached**. No detector, retrieval, Judge, or delivery silence is attributed to H1.
- The disposable Host used official `workspace/create` Remote/RPC and created workspace `b2a28eab-d279-4846-b0c4-cf1e036ae2a6` under this run’s runtime. The initial official Idea list was empty. No native Select Workspace Directory dialog was opened.

## Startup evidence

Both launch paths used the Chrome for Testing binary at:

`/Users/tongxin/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

The recorded launch options were `--user-data-dir=<run runtime>/browser-profile`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=18796`, `--no-first-run`, `--no-default-browser-check`, `--window-size=1440,1000`, and `--app=http://127.0.0.1:18795`. `HOME` and `DSH_HOME` pointed to `<run runtime>/home`; `XDG_CACHE_HOME` pointed inside that disposable home. The profile was unique to this run.

| Path | Observations | Conclusion |
| --- | --- | --- |
| External Seatbelt launch path | A detached launcher record contained PID `71894`. Near 09:55:39–09:55:42, macOS recorded a Google Chrome for Testing main-process crash (PID `71916`, `EXC_BREAKPOINT` / `SIGTRAP`, termination `SIGNAL 5`) and 15 Helper/Renderer crash reports (`EXC_CRASH` / `SIGABRT`, termination `SIGNAL 6`). A foreground Seatbelt troubleshooting launch also emitted `sandbox initialization failed: Operation not permitted` messages and a DevTools-listening line, but no stable profile process or listener remained. The crash reports name PID `64284` (`codex`) as the main process’s parent; the saved evidence does not link PID `71916` to one specific Seatbelt invocation. | The externally Seatbelt-wrapped path did not produce a persistent browser. The crash cluster is time-aligned with that path, but the saved evidence does not prove which invocation it belongs to or identify a root cause. |
| Independent disposable-HOME launch, without the outer Seatbelt | The launch record was PID `72016`; a sample at startup observed child PIDs `72023`, `72024`, `72026`, `72029`, `72031`, `72034`, and `72035`. The profile’s CDP listener was temporarily present. The browser log contained a DevTools-listening line. By the time the CDP driver connected, port `18796` refused the connection; the profile processes and listener had exited. No matching Chrome for Testing crash report was found for PID `72016`. | This is a separate startup failure. The available crash reports for PID `71916` do not explain the exit of PID `72016`. |

The user confirmed seeing two native macOS dialogs during testing: “Google Chrome for Testing quit unexpectedly” and “找不到用于储存 Chromium 的钥匙串”. Available evidence does not assign either dialog to a particular launch attempt. The crash reports support that a Chrome for Testing crash occurred in the Seatbelt-path time window; they do not establish why the keychain dialog appeared or why the independent-HOME process exited. No Keychain item or configuration was changed.

## Isolation, provider boundary, and attribution

- The disposable Host and CLI used `DSH_HOME=<run runtime>/home` and ran under the accepted Seatbelt profile denying writes to `/Users/tongxin/.dsh`. The required non-mutating `O_WRONLY` probe against the real `~/.dsh/settings.yaml` returned `EPERM` before the Host scenario. The Host was stopped by `SIGTERM` to its verified run-owned PID `71784`; port `18795` then had no listener.
- The first browser path was externally Seatbelt-wrapped. The later independent-HOME Chromium launch did **not** have the outer Seatbelt. Its `HOME`, `DSH_HOME`, cache, and profile were explicitly directed to the disposable runtime, and it exited before any authenticated browser page or DSH application code was used. No evidence shows that Chromium read or wrote real `~/.dsh`; however, because this second browser process was not Seatbelt-confined, this report does not claim a run-wide deterministic write-denial guarantee for that process.
- Secret-safe checks found the live `.credentials.yaml` and `settings.yaml` byte-equal to the disposable template copies. The saved pre-run manifest had 1,771 rows; the later recursive path inventory had 1,943 entries, but the saved row encoding/scope did not reconcile to that walk. Therefore no real-`~/.dsh` manifest diff or attribution is claimed from those counts. The Seatbelt probe remains the attribution authority for the Host/CLI only.
- The real provider ledger contained `0` requests; Agent requests `0`; Judge requests `0`; semantic public-provider requests `0`. The cap self-test used only fake transport: 20 test calls delivered, request 21 denied before dispatch, failures `0`. No live provider request was made during this diagnostic.

## GUI cleanup and diagnostics

At final verification, the exact runtime-profile process search returned no process; ports `18796` and `18795` had no listener. The CUA inventory exposed no native apps and no Chrome window (only the Codex MCP Apps and In-app Browser surfaces). The browser had not authenticated or reached the scenario, and its process tree was gone, so remaining pages and contexts are `0` by process teardown; CDP could not enumerate targets after the endpoint exited.

| Resource | Remaining | Verification |
| --- | ---: | --- |
| Pages | 0 | No live CDP process/session; browser process tree exited before any authenticated page or scenario interaction. |
| Contexts | 0 | No live browser process/session remained. |
| Windows | **Unverified** | CUA showed no Chrome window, but its native-app inventory was empty and could not independently rule out a system-owned macOS crash/keychain dialog. No unverified window was closed. |
| Browser processes | 0 | Run profile process search and CDP listener check were empty; only run-owned Host PID `71784` was signalled, and its listener was gone. No normal browser was terminated. |

Because the native-window count could not be independently verified, GUI cleanup is **not reported as a complete PASS**. No browser console/page errors were available because no authenticated page was established. The crash reports above are the available browser diagnostics.

The run runtime and the run-created `.t13-2-provider-template` were removed by exact-path cleanup after Host/browser termination. No Keychain changes, configuration resets, Chrome reinstall, real `~/.dsh` cleanup, or normal-browser termination occurred. The pre-existing `packages/dsh-idea/.DS_Store` and Harness `deepseek-harness` symlink remain untouched.

## Publication

- Implementation SHA: `7f1703badb6e48845798d8444d00f1e12023c5d8`
- Report commit: the commit containing this report; exact SHA is returned with the post-fetch verification.
- Final remote SHA: equal to the report commit after normal push and fetch verification; exact SHA is returned with the post-fetch verification.

The report cannot embed its own exact commit SHA: changing the report to add that SHA would produce a different commit. Git commit metadata and the delivery result provide the exact value without a self-referential document.
