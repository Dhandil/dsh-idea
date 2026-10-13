# DSH Idea T13.2 — Browser Isolation Risk-Tier Architecture Freeze

**Status:** `T13_2_BROWSER_ISOLATION_RISK_TIER_FREEZE_AUTHORED_FOR_PUBLICATION`  
**Authoritative baseline:** `c3e4ff5a04e03ed3ec410d72e18a7a284e6728fe`  
**Tested dsh-idea executable:** `7f1703badb6e48845798d8444d00f1e12023c5d8`  
**Harness read-only reference:** `ddefc45fbc7f8e46dd73185e68295696d1297887`  
**Scope:** T13.2 Fixture A final browser/provider *validation infrastructure only*; no product, test, Harness, migration, or dependency changes.

## 1. Decision and precedence

The protection goal is unchanged: T13.2 test activity must not access the normal Harness as its test target or intentionally modify the user's real `~/.dsh` state. The *universal process-level proof* is revised: deterministic OS-enforced write denial remains mandatory for components that operate Harness storage, but is **not** a prerequisite for a separately launched UI automation browser. This is an explicit, narrow, risk-accepted exception, **not** a claim that a same-user Chromium process is incapable of writing to `~/.dsh`.

This freeze supersedes **only** the universal scope of the mechanism-A/mechanism-B requirement in §5(D), its whole-process-tree attribution verdict in §5(E), and the browser implications of F3 in `DSH_IDEA_T13_2_FOLLOWUP_FREEZE_REPAIR.md`; it also supersedes any corresponding universal-browser requirement or `real ~/.dsh unchanged` literal in `DSH_IDEA_T13_2_REAL_BROWSER_PROVIDER_PROTOCOL_FREEZE.md`. It does **not** supersede the prohibition on writing real user state, the protected Host/CLI boundary, stable-pair credentials snapshot, provider guard, exact Fixture A, UI/product proof standards, or reporting/cleanup discipline. Historical evidence is unchanged. The old requirement is retained for the Host/CLI/storage-executing process domain.

**Security truth must be reported in two separate fields:**

- `HOST_CLI_REAL_DSH_WRITE_DENIAL = PASS | FAIL | NOT_PROVEN`: deterministic, verified OS denial for the protected data-writer process domain.
- `BROWSER_REAL_DSH_WRITE_DENIAL = NOT_OS_ENFORCED_ACCEPTED_RISK`: the independent browser's ordinary same-user OS filesystem capability is not excluded by temporary HOME/profile, Chromium renderer sandbox, or network observations. Do not report `REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE` for *all* processes on this basis.

The user has accepted this risk-tier adjustment for this **one validation scope**. It is not a precedent for broad production browsing, other projects, or permission to alter protected user files.

## 2. Mandatory protected data-writer domain

1. T13.2 Host, CLI and any subprocess/helper that performs DSH state operations use an explicitly injected repository-external disposable `DSH_HOME`, never `~/.dsh`; Host binds only `127.0.0.1:18795`, separate from the user's normal `127.0.0.1:3080`.
2. The accepted macOS Seatbelt `file-write*` deny rule covering `/Users/tongxin/.dsh/**` remains mandatory for the Host/CLI data-writer domain and their data-writing descendants. The **same** nonmutating `open(real ~/.dsh/settings.yaml, O_WRONLY)` activation probe must yield `EPERM` before boot; do not open credential files in this probe. Denied attempts during a run are fail-loud and immediately stop the run.
3. Preserve the verified whole-pair provider snapshot (3 attempts max), atomic pair publication, credential `0600`, no secrets/hashes/sizes/content in reports, disposal of all copies and templates, and the existing accepted Host-side guard.
4. Workspace creation uses only official `workspace/create` Remote/RPC; the workspace and plugin install belong exclusively to the disposable home. Do not open the native macOS `Select Workspace Directory` picker.
5. Normal Harness on port 3080 may remain active; never stop it, terminate its processes, change its settings, or attribute its legitimate state writes to T13.2 without direct evidence.

A Host/CLI denial failure, missing `DSH_HOME`, wrong port, real-home target, template problem, or unauthorized write attempt is a **hard STOP**, regardless of browser health.

## 3. Separately owned browser automation domain — guarded exception

1. Launch Chrome for Testing **outside the Host/CLI Seatbelt process tree**, controlled by a run-owned Playwright controller. Do not use an external Seatbelt wrapper around Chrome; do not disable Chromium's internal sandbox or add `--no-sandbox`.
2. Use a fresh repository-external disposable `HOME`, `DSH_HOME`, `TMPDIR`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, and browser profile; do not load or mount a real user's browser profile, cookies, extensions, bookmarks, or DSH state. Use the supported macOS testing switch `--use-mock-keychain`, with no Keychain reconfiguration, system permission change, or Chrome reinstall.
3. Browser automation is limited to the single disposable Web origin `http://127.0.0.1:18795` and the separately owned automation/CDP transport. No page navigation to normal Harness `:3080`, external sites, or unexpected local ports; fail-closed on observed unauthorized navigation, fetch, WebSocket, popup, download, file chooser, or new target. Observe and bound page-initiated network traffic using the available Playwright/CDP request and WebSocket event seams; do not claim these observations are a kernel-level egress firewall.
4. Do not trigger browser file uploads/downloads, local file selection, filesystem APIs, native chooser, cross-profile session reuse, or arbitrary developer-console scripts against real user paths. Use official Host RPC only for authorized read-back and setup; UI actions remain genuinely browser-driven.
5. Record the specific launched executable, Playwright version, Chromium version, launch arguments, dedicated profile, root PID and observed descendants, target pages/contexts, and endpoint addresses. Prefer a browser build matched to the installed Playwright version when *already available*, without a dependency or system change. A mismatched binary is not automatically accepted by an `about:blank` smoke: the actual disposable Harness Web must pass a provider-zero functional browser preflight covering navigation, selectors, clicks, reload, required RPC/WebSocket activity, and stable connection. On incompatibility, stop; do not silently install or upgrade in the run.
6. The Chromium Browser process is not presumed restricted from filesystem writes by `chromiumSandbox: true`. Do not repeat the deprecated demand for root `fs_usage`/`eslogger` attribution as a browser admission gate. A command-line reference to Chrome for Testing's default Crashpad diagnostic directory is a known platform residual risk; by itself, that reference does not establish filesystem access and does not trigger STOP. Any actual unauthorized access to or modification of protected user data remains an immediate isolation-failure STOP.

This exception trades a narrow residual same-user browser filesystem risk for a functional UI validation; it does **not** provide absolute OS-enforced nonaccess. Record that limitation plainly in every live report.

## 4. Gate sequence, with zero real-provider calls before authorization

**Gate 0 — repository/security preflight:** pinned SHAs, clean tracked/index state, untouched unrelated `.DS_Store` and Harness symlink; protected Host/CLI Seatbelt activation; verified stable provider snapshot; guarded requests capped; semantic public-provider mode off. Ensure no collision with existing 18795/18796 or normal 3080.

**Gate 1 — live Web/browser preflight (provider = 0):** start disposable Host; official `workspace/create` (no native chooser); launch separately owned browser under §3; establish an authenticated disposable Web session only; prove navigation, required interactions, WebSocket/RPC, browser stability, endpoint separation, page error collection and target ownership. Do not create Fixture A TARGET or send a real Agent/Judge request until Gate 1 passes. If the Web unexpectedly calls a public provider, stop with attribution evidence rather than silently treating it as zero.

**Gate 2 — Fixture A exactly once:** only after Gate 1 passes, enter the exact saved TARGET draft and trigger from `DSH_IDEA_T13_2_POSITIVE_SURFACE_FIXTURE_FREEZE.md`. UI Direct Save, official target read-back, UI Pause → read-back true, UI Resume → read-back false, then one exact natural trigger in a fresh conversation. Record completed Agent turn, detector/retrieval/evaluate/candidate, one real Judge verdict, Final Delivery Gate and UI. Legitimate Judge `NONE` is inconclusive, not a product defect; do **not** try B/C or paraphrase/retry. On `SURFACE`, validate the real strip and click `本次忽略`; it must disappear without durable mute (`resurfacingMuted = false` by official read-back).

**Provider boundary:** retain the previously authorized final-closure cap of **20** real external calls per fresh run with request 21 denied *before dispatch*; semantic public-provider requests **0**; stage-sensitive and secret-safe ledger; do not run Canonical Full. Stop on cap, guard failure or attribution ambiguity.

## 5. Cleanup, reporting and acceptance

On every PASS, BLOCKED, FAILED or INCONCLUSIVE outcome: close all owned Playwright pages and contexts, stop the owned Chromium instance, verify the browser process tree and relevant bound ports have no owned survivors, stop disposable Host, remove disposable runtime/profile/credentials/template/guard safely by exact paths, and preserve all unrelated user data. Never use broad `pkill`, `killall`, reset, clean, or user-browser termination.

Track **two separate GUI facts**:

- `AUTOMATION_BROWSER_CLEANUP`: pages = 0, contexts = 0, owned browser processes = 0, owned listener(s) = 0; owner attribution and exit information mandatory. A failing or unidentified owned process blocks clean closure.
- `NATIVE_MACOS_DIALOG_INVENTORY`: `CLEAR | OBSERVED_BLOCKER | UNVERIFIED`. If CUA cannot enumerate OS-owned windows, report `UNVERIFIED` truthfully; this alone does not fail an otherwise independently verified automation-process cleanup. Any newly observed Chrome crash, Keychain, or workspace picker dialog during the run is a **STOP** and must not be silently dismissed, reset, or misreported as clean.

Real-home manifests are *corroborative only* and may reflect the simultaneously running normal Harness. The Host Seatbelt verdict proves only the protected domain's write-denial; no manifest comparison, sampled `lsof`, page traffic check, or browser `HOME` redirection proves the unprotected browser could not have written a real user path. Unknown changes remain unattributed; never ascribe them automatically to either instance.

Deliver a **docs-only** report containing the tested and report SHAs, Gate 0/1/2 outcomes, any matched/mismatched browser version, authorized exception/risk acceptance, stage-specific provider ledger, actual Judge/UI evidence if run, real-home protection limitation, automation cleanup and native-window status. Commit and push the exact report on **every** terminal outcome, fetch-verify, and STOP for independent review. Do not self-accept T13.2 and do not enter T13.3/T14.

## 6. Freeze publication and authorization boundary

This document is the architecture decision. First publish it as a docs-only commit and fetch-verify against `origin/main` with no other changes, preserving pre-existing untracked drift. **Do not start the live run in the same publication task.** A subsequent explicit independent Architecture Review of the remote freeze commit is required to authorize the guarded Fixture A run.
