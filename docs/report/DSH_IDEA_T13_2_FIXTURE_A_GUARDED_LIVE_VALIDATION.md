# T13.2 Fixture A Guarded Live Validation

**Outcome: `T13_2_BLOCKED_ATTRIBUTION_PROOF_UNAVAILABLE`.** The round stopped at the browser-isolation gate before starting Chrome, the Harness Host, a provider, or Fixture A. The required guarantee that T13.2 processes cannot write to the real `~/.dsh` was not established for the permitted Chrome launch mode.

## Pinned inputs and repository preflight

- dsh-idea baseline: `116ecca16a091e2eea2993290df8054d5f34c4e3`
- Executable reference: `7f1703badb6e48845798d8444d00f1e12023c5d8`
- Harness reference: `ddefc45fbc7f8e46dd73185e68295696d1297887`
- Isolation contract: [`DSH_IDEA_T13_2_FOLLOWUP_FREEZE_REPAIR.md`](../architectue/DSH_IDEA_T13_2_FOLLOWUP_FREEZE_REPAIR.md)
- Provider/browser protocol: [`DSH_IDEA_T13_2_REAL_BROWSER_PROVIDER_PROTOCOL_FREEZE.md`](../architectue/DSH_IDEA_T13_2_REAL_BROWSER_PROVIDER_PROTOCOL_FREEZE.md)
- Fixture payload: [`DSH_IDEA_T13_2_POSITIVE_SURFACE_FIXTURE_FREEZE.md`](../architectue/DSH_IDEA_T13_2_POSITIVE_SURFACE_FIXTURE_FREEZE.md)
- Prior offline result: [`DSH_IDEA_T13_2_BROWSER_OFFLINE_SMOKE.md`](DSH_IDEA_T13_2_BROWSER_OFFLINE_SMOKE.md)

At preflight, `HEAD == origin/main == 116ecca16a091e2eea2993290df8054d5f34c4e3`; tracked and index drift were zero. The existing untracked `packages/dsh-idea/.DS_Store` was preserved. The Harness checkout remained at the pinned detached SHA with its existing `deepseek-harness` symlink; no Harness file was changed.

## Browser Preflight — blocked before launch

The permitted browser mode was the existing Playwright-managed Chrome for Testing with a disposable `HOME`/profile, Chromium's own sandbox enabled, `--use-mock-keychain`, and no outer Seatbelt or `--no-sandbox`. This does not establish the frozen real-home write boundary. Chromium's process-sandbox table lists the **Browser** process as unsandboxed; renderers and selected child process types are sandboxed. Therefore `chromiumSandbox: true` does not prove that the browser process itself cannot write `/Users/tongxin/.dsh`. A temporary `HOME` and profile also do not deny access to that path. See the [Chromium process sandbox table](https://chromium.googlesource.com/chromium/src/%2B/HEAD/docs/security/process-sandboxes-by-platform.md) and [Chromium macOS sandbox design](https://chromium.googlesource.com/chromium/src/%2B/main/sandbox/mac/).

The frozen fallback is a continuous, process-attributed filesystem trace with a successful activation self-test. This host has `/usr/bin/fs_usage` and `/usr/bin/eslogger`, but the session UID is `501` and `sudo -n -l` returned `sudo: a password is required`. Apple documents that `fs_usage` requires root and that `eslogger` requires superuser plus Full Disk Access ([`fs_usage` requirements](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/FileSystem/Articles/FileSystemCalls.html), [Endpoint Security `eslogger`](https://developer.apple.com/videos/play/wwdc2022/110345/)). No trace was started and no permissions or system privacy settings were changed. The required fallback proof and self-test are unavailable in this session.

Compatibility was also not cleared for the required live operations. The installed client observed in the preceding offline smoke is Playwright `1.61.1`; its bundled Chromium is `149.0.7827.55`, whereas the existing Chrome for Testing binary reports `151.0.7922.34`. Playwright's release record pairs 1.61.1 with Chromium 149, and its API warns there is no guarantee with a different executable ([Playwright v1.61.1 release](https://github.com/microsoft/playwright/releases/tag/v1.61.1), [BrowserType API](https://playwright.dev/docs/api/class-browsertype)). The previous `about:blank` smoke did not exercise the disposable Harness Web, RPC, or scenario interactions; it is not compatibility proof. No browser was launched in this round.

**Gate result:** `BROWSER_LIVE_PREFLIGHT = BLOCKED_BEFORE_LAUNCH`; `REAL_DSH_HOME_WRITE_DENIAL = NOT_PROVEN`; the frozen attribution proof was not activated. The external-Seatbelt path was not substituted because this request expressly disallows it for Chrome.

## Fixture A and provider result

Fixture A was **not started**. No disposable Host or Web was launched; no `workspace/create` request, TARGET Direct Save/readback, Pause/Resume, conversation, Agent turn, evaluate, candidate generation, Judge, Final Delivery Gate, strip, or dismiss occurred. The exact frozen TARGET and trigger were not submitted or altered; no TARGET ID was created. All detector, retrieval, Judge, delivery, and UI scenario outcomes are **NOT RUN**, not a silence or product result.

Provider requests: `0` (Agent `0`, Judge `0`, semantic `0`). The provider guard and hard cap `20` were not initialized because no runtime started; request 21 was not attempted. No provider template was read, copied, created, or modified. No credentials or real `~/.dsh` files were opened by this round. The prior Host/CLI Seatbelt contract was neither changed nor re-tested here.

## GUI cleanup and isolation result

No browser pages, contexts, Chrome process tree, Host process, disposable runtime, profile, credential copy, or provider template was created by this round. Thus there were no run-owned browser processes or pages to close. Read-only `lsof` checks for listeners on `127.0.0.1:18795` and `127.0.0.1:18796` returned no rows. The current CUA snapshot returned `apps: []` and only the Codex MCP Apps and in-app browser surfaces; it cannot enumerate native macOS windows or dialogs. Native window/dialog count is **UNVERIFIED**; this report does not claim GUI PASS. No user Chrome process was terminated and no Keychain operation was made.

`REAL_DSH_HOME_WRITTEN_BY_T13_2` is not certified by a running attribution mechanism; no T13.2 runtime was started. The isolation gate remains blocked for a future live run until either the frozen Seatbelt denial applies to the complete process tree or the frozen continuous-trace mechanism and its self-test are available, and the browser/Playwright pairing is suitable for the required interactions. The run stopped here and does not resume Fixture A automatically.

This is a docs-only report. No product code, tests, or Harness files were modified; the pre-existing `.DS_Store` and Harness symlink were preserved.
