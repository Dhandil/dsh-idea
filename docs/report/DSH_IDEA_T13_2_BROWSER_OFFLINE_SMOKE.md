# T13.2 Browser Offline Smoke

**Outcome: `TECHNICAL_SMOKE_PASS / OVERALL_INCONCLUSIVE_GUI_WINDOW_INVENTORY`.** The single offline browser smoke started and controlled Chrome successfully, stayed on `about:blank`, and exited cleanly. Playwright confirmed zero pages and contexts after teardown and the six observed Chrome process IDs were gone. The available GUI inventory could not enumerate native application windows, so this is not a complete GUI cleanup PASS.

## Pinned inputs and scope

- dsh-idea baseline: `88b44d564d53e4bed8b28a932433ba44dc0620cb`
- Executable reference: `7f1703badb6e48845798d8444d00f1e12023c5d8`
- Harness reference: `ddefc45fbc7f8e46dd73185e68295696d1297887`
- Prior diagnostic: [`DSH_IDEA_T13_2_FIXTURE_A_BROWSER_STARTUP_DIAGNOSTIC.md`](DSH_IDEA_T13_2_FIXTURE_A_BROWSER_STARTUP_DIAGNOSTIC.md)

This run did not resume Fixture A, start the Harness Host, open a real application page, or call an Agent, Judge, or provider. It did not read a user browser profile or pass user credentials to Chrome. No product, test, or Harness source was changed. Keychain settings and the installed browser were left untouched.

## Static launch review

The submitted diagnostic records two different prior paths, both using the existing Chrome for Testing binary at:

`/Users/tongxin/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

Their arguments included a run-specific `--user-data-dir`, loopback remote debugging at port `18796`, `--no-first-run`, `--no-default-browser-check`, `--window-size=1440,1000`, and `--app=http://127.0.0.1:18795`. `HOME`, `DSH_HOME`, and XDG cache were redirected to the disposable runtime. Neither recorded command included `--use-mock-keychain`.

The first path wrapped Chrome externally in Seatbelt. The diagnostic has a launcher record for PID `71894`, a time-aligned Chrome main-process crash report for PID `71916` (`EXC_BREAKPOINT` / `SIGTRAP`), 15 Helper/Renderer crash reports (`SIGABRT`), and a separate foreground message `sandbox initialization failed: Operation not permitted`. The saved evidence does not prove which specific invocation produced PID `71916`, nor identify a cause.

The second path launched Chrome without the outer Seatbelt using a separate disposable `HOME` and profile. PID `72016` exited before CDP connected; no matching crash report was found for it. That is a distinct observation and is not attributed to the first path. The user-reported Chrome crash and missing-keychain dialogs were not tied to either launch by the available evidence.

Chromium documents `--use-mock-keychain` as a macOS testing switch that avoids blocking keychain dialogs ([switch definition](https://chromium.googlesource.com/chromium/src/%2B/284303b6ca6170692f20027c6e75a6c15a75cbae/chrome/common/chrome_switches.cc), [Chromium macOS build instructions](https://chromium.googlesource.com/chromium/src/%2B/110.0.5481.77/docs/mac_build_instructions.md)). This supports using it for a disposable offline smoke; it is not evidence about the cause of the earlier dialog or a substitute for Keychain configuration.

The existing browser reported version `151.0.7922.34`. The available Playwright client was `1.61.1`, whose bundled browser revision differs from Chrome 151; Playwright's v1.62 release notes identify Chromium 151 as that release's browser line ([release notes](https://github.com/microsoft/playwright/blob/main/docs/src/release-notes-python.md)). The API permits an explicit executable but cautions that using a different browser build may not work as expected ([BrowserType API](https://playwright.dev/docs/api/class-browsertype)). Therefore this result establishes only this specific blank-page startup and connection, not supported compatibility for future live runs.

## One offline smoke

Exactly one Playwright `launchServer` call was made, using the already-installed Chrome for Testing binary and a new run directory `/tmp/t13_2_browser_offline_20261013_UkmuBa`. `HOME`, `DSH_HOME`, `TMPDIR`, `XDG_CACHE_HOME`, and `XDG_CONFIG_HOME` all pointed inside that directory. Playwright created its temporary profile at `tmp/playwright_chromiumdev_profile-QtLdco`; the temporary directory was empty before launch. The browser received only the explicitly selected environment values. There was no outer `sandbox-exec` around Chrome, as required for this smoke; no Host or CLI was started, and the Host/CLI Seatbelt isolation contract was not exercised or changed.

The launch used Playwright's `chromiumSandbox: true`; inspection of the complete observed Chrome process tree found no `--no-sandbox` argument. The tree contained `--use-mock-keychain`. Other explicit launch arguments were `--no-first-run`, `--no-default-browser-check`, `--disable-default-apps`, `--disable-background-networking`, `--disable-component-update`, `--disable-sync`, and `--disable-features=DialMediaRouteProvider`. Playwright managed the debugging connection over loopback. The page loaded no external service and recorded zero page requests.

Observed evidence:

| Check | Result |
|---|---|
| Smoke starts / launch calls | `1` / `1` |
| Chrome PID / parent PID | `73942` / `73933` |
| Chrome process tree at runtime | `6` processes: `73942, 73951, 73952, 73953, 73957, 73958` |
| Browser-reported version | `151.0.7922.34` |
| Playwright connection | Connected; `browser.isConnected() = true` |
| Contexts / pages while running | `1` / `1` |
| Page and document URL | `about:blank` / `about:blank` |
| Page requests / blocked requests | `0` / `0` |
| Page console errors | `0` |
| Browser stderr | `3` lines; zero matched the captured sandbox-failure or crash/fatal filters |
| Runtime | At least 12 seconds after the page was ready for inventory |
| Normal close | Browser exit code `0`, signal `null`, no exit timeout |
| Pages / contexts after close | `0` / `0` |
| Observed Chrome PIDs after close | None present; exact PID query returned no rows |
| Playwright temporary profile after close | Removed automatically; run `tmp` directory empty |

## GUI cleanup, attribution, and remaining risk

The CUA inventory was checked while Chrome was running and again after it exited. Both snapshots returned `apps: []` and only the Codex MCP Apps and Codex in-app browser surfaces. That interface did not expose Chrome's native window or macOS system-dialog inventory. Consequently, native window/dialog count is **unverified**, even though the Playwright page/context counts are zero and all observed browser process IDs exited. No claim is made that the earlier crash or Keychain dialogs were absent in this run, and no complete GUI PASS is claimed.

The browser's process environment and profile were disposable and contained no supplied user credentials, but Chrome was intentionally not externally Seatbelt-confined. A separate `HOME` does not prove that a same-user browser process cannot reach the real `~/.dsh`; this smoke made no such access test and does not establish deterministic write denial for Chrome. The previous Host/CLI Seatbelt contract remains a separate requirement for any later real scenario. Architecture review should also account for the Playwright/Chrome version mismatch, the unverified native GUI inventory, and the fact that a successful blank page says nothing about real Harness UI or provider behavior. Fixture A remains paused pending explicit follow-up.

The run-owned temporary directory was removed after the process tree and profile were gone. The pre-existing dsh-idea `packages/dsh-idea/.DS_Store` and Harness checkout `deepseek-harness` symlink were preserved.
