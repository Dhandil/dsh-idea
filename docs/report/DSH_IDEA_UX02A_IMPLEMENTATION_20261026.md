# UX-02A observation implementation and blocked browser gate

Date: 2026-10-26. Outcome: **`DSH_IDEA_UX02A_BLOCKED`**.

The instrumentation and offline validation are reviewable. The real-browser
gate is **BLOCKED**, and the UX conclusion remains **INCONCLUSIVE**. A green
Full does not establish that the summary has, or does not have, a no-feedback
delay. No browser acceptance or Keychain-popup absence is claimed.

## 1. Revisions and scope

- Base main: `bcc35e3d09581fdb7d22a518f9d456d58ed39c22`.
- Independent branch: `codex/dsh-idea-ux02a-observability`.
- Implementation / unique Full tested SHA:
  `51d3542ac82dcb69ea201c10bcdc48a18498a9cc`.
- Harness: `86a402200d95fecef4529d969836f1fe13c6cb0d`.
- Node `v24.21.0`, pinned existing pnpm `11.28.5`, Vitest `4.1.11`.
- Real Provider calls: **0**. No merge to main.

Executable changes add Client/Host observation and related tests plus an
unfinished, now fail-closed browser fixture. Domain writer, schemas/types,
Storage/Migration, prompts, model route/options and lockfile are unchanged.
No timeout, parallelism, retry or existing assertion was relaxed. The model
proposal still has one plugin stream call and the same parser/approval path.

## 2. What the instrumentation measures

See [observation guide](../UX02A_OBSERVABILITY.md).

- Client adds choice/pending/preview **React commit** and Generate-to-preview
  commit. User time selecting mode/target is excluded from generation duration.
  New/update RPC aggregates are separated; existing names stay compatible.
- New-Idea Host metrics remain on `ideaPreparations.performance`; update metrics
  are on `ideaPreparations.updates.performance`. Both include read, capture,
  route, prompt, first arbitrary chunk, first nonempty text, complete stream,
  parse, total and RPC handler. Update records its before/after target checks.
- Reasoning, block-start, usage and finish do not masquerade as first text.
  Completed text-only blocks without deltas are supported. Abort before text
  cannot manufacture first-text, completed-model or late-preview observations.
- Fixed stage names and numeric count/total/max only; no default content, Prompt,
  credential or Session/Message/Idea ID logging. Synthetic Host timing files
  require an explicit opt-in and isolated logs.
- Stream completion is not successful finish/parsing. Nested stage durations
  overlap, counts may differ on failures/joined calls, and aggregate differences
  are not network timings. Host/model envelopes include scheduling, adapter,
  network and generation; this does not isolate pure Provider compute.
- React layout effects are not pixel presentation. No rAF/FCP proxy is labelled
  actual dynamic-modal paint. Compositor and actual PNG capture evidence remains
  a separate, unpassed browser gate.

## 3. Focused and static verification

| Execution | Actual result |
| --- | --- |
| Initial focused | 6 files / **146 PASS** |
| Final focused, including official Session matrix | 7 files / **154 PASS**, zero failed/pending/todo |
| Initial and final Typecheck | Both PASS |
| Typert generation | PASS |
| Host build | PASS |
| Client build | PASS |
| Fixture JavaScript syntax and diff whitespace checks | PASS |
| Browser fail-closed guard | Expected exit 1 before Host/browser launch |

Final focused includes 8 official Host Session cases, 7 observation/stream/privacy
cases and 4 added Client observation regressions, plus existing preparation,
update, Remote and Client coverage. It proves counts/order/cancellation and
zero preparation writes. Component assertions are not browser acceptance.

## 4. Unique fresh complete Full

**Exactly one root `pnpm verify`: exit 0, 40,447ms. No rerun.**

| Stage | Actual result |
| --- | --- |
| Root/package strict pre-audits | PASS, only the valid owning active run |
| Runtime tests | **30/30 PASS**, zero failed/cancelled/skipped/todo |
| Typert / Typecheck | PASS |
| Complete default-parallel plugin suite | **67 files / 1071 tests PASS** |
| Host / Client builds | PASS |
| Package/root strict post-audits | PASS, only the valid owning active run |

Total: **1101/1101 PASS**. Full began in a new owned run with no Vite cache.
Normal scripts and native config loader were used, with the pinned installed
pnpm entry; no install or dependency relink. The informational tsdown dependency
hint and bundled `zod` notice remain in the log.

The companion JSON preserves the complete sanitized Full terminal output, exact
counts, exit status and raw-log hash
`1d3a47453fb128bd66027729c226e20256dd5d610f50b99bc58d99f26bc00097`.
The hash identifies this invocation, not a reproducible-build attestation.
This Full did not run the blocked real-browser driver.

## 5. Browser attempts and user Keychain supplement

All earlier failures are retained; none is counted as an accepted UX sample.

| Attempt | Original outcome / correction |
| --- | --- |
| 1 | Seatbelt address grammar rejected before Host/model startup; corrected to localhost syntax. |
| 2 | Sandboxed worker could not query the unsandboxed Runtime owner with ps. Parent verifies requireRun before spawn, then hands the authenticated run over private IPC; runPath still verifies marker/receipt, token and filesystem identity. |
| 3 | Native CFT child sandbox initialization failed under nested macOS Seatbelt. Driver then waited for a close event already emitted by a signal-terminated browser. Exact owned Host/driver commands and parent PIDs were verified before SIGTERM of PIDs 19676/19665. No normal browser was terminated. |
| 4 | Real Web shell rendered, but waiting for SPA load timed out. Fixture uses DOMContentLoaded plus explicit readiness; no timeout increase. |
| 5 | Fresh-profile preview disclaimer intercepted Workspace-selection clicks. Failed before summary generation. No force click or timeout increase. |

The user then reported **“找不到用于储存 Chromium 的钥匙串”** and required
mock Keychain/basic password store, native Chromium sandbox and independently
proven file/network boundaries. At inspection, the task CFT/Host/driver had
already exited. No matching task browser or open run handle remained.

The draft task-only launch arguments now include `--use-mock-keychain` and
`--password-store=basic`, alongside a run-specific user-data-dir. There is no
`--no-sandbox`. **The corrected arguments were not launched or runtime-verified**:
no CFT was started after the user's supplement. No system Keychain command,
configuration change, reset or direct credential access was performed. Earlier
CFT may have attempted system Keychain access as the reported popup shows; this
report does not rewrite that history or claim absence of the popup.

The source now throws `DSH_IDEA_UX02A_BROWSER_BLOCKED_ISOLATION` before Host,
Profile or browser creation. There is no environment bypass. A direct guard
check returned exit 1 as intended.

### Boundary proof and remaining blockers

- **Host:** the same separate Seatbelt policy compiles and served loopback Web.
  A `sandbox_check` permission query inside that policy returned **1 (denied)**
  for both file-read-data and file-write-data on real `.dsh` and normal Chrome
  directory paths. The query did not open/read those directories or contents.
  Outbound networking is denied except localhost, supplemented by a Host
  non-loopback fetch refusal. Real Provider adapter rows were disabled.
- **Browser: BLOCKED.** Its native Chromium sandbox is retained, but it does not
  attest a protected-directory policy for the browser main process. Page routing
  also does not prove that browser background services are loopback-only.
  The Host Seatbelt policy cannot be attributed to this separate browser.
- Nested Seatbelt failed; disabling native Chromium sandbox, modifying system
  Keychain or silently waiving background-network/file access was not accepted.
  No actual protected user data was probed to manufacture a negative test.
- The Keychain-popup absence check, real short/long live/cold matrix,
  browser cancellation/late-result proof and painted-modal timings remain
  **NOT VERIFIED**. There are zero accepted browser latency/paint samples.

The early task-only startup URL was captured in transient fixture logs. Logging
now redacts token values; archival evidence contains no authentication URL/token.
All transient logs, screenshots, Sessions and Profiles were removed.

## 6. Host-only timing samples

These are **offline Host invocations with an immediate scripted stream** and
real official Session/Query/JSONL lifecycle, not browser/RPC-network or real-model
performance. Each sample made one model-double call and left the preexisting
Idea's stored bytes unchanged. Short has 2 exchanges; long has 80. Availability
is asserted both before and after preparation. Values are milliseconds; one
sample per cell, no P50/P95 or general speed claim.

| Mode / size / availability | Events | Session read | Capture | Route | First chunk | First text | Complete stream | Parse | Prepare total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| new / long / cold | 480 | 8.291 | 0.047 | 2.603 | 0.030 | 0.038 | 0.055 | 0.072 | 11.264 |
| new / long / live | 480 | 3.051 | 0.111 | 0.095 | 0.023 | 0.028 | 0.040 | 0.063 | 3.524 |
| new / short / cold | 12 | 5.495 | 0.030 | 1.659 | 0.026 | 0.032 | 0.037 | 0.119 | 7.458 |
| new / short / live | 12 | 0.586 | 0.170 | 0.273 | 0.124 | 0.174 | 0.198 | 0.128 | 1.702 |
| update / long / cold | 480 | 7.818 | 0.244 | 2.145 | 0.084 | 0.086 | 0.089 | 0.050 | 10.674 |
| update / long / live | 480 | 3.383 | 0.256 | 0.100 | 0.086 | 0.090 | 0.093 | 0.051 | 4.942 |
| update / short / cold | 12 | 2.481 | 0.037 | 1.366 | 0.073 | 0.075 | 0.079 | 0.044 | 4.326 |
| update / short / live | 12 | 0.147 | 0.160 | 0.049 | 0.075 | 0.087 | 0.097 | 0.057 | 1.436 |

The full fixed-stage snapshots, target/RPC envelopes and count fields are in the
JSON. Small mocked model times are intentional and cannot explain real Provider
latency. Cold/source-read differences here are observations, not proof of the
user's 2–3s delay. Client commit order and cancellation were tested offline;
physical paint and end-to-end UX duration are still unavailable.

**Experience conclusion: INCONCLUSIVE.** Do not assert either a current
no-feedback defect or its absence from these results.

## 7. Cleanup and external exceptions

Preparation and Full wrappers both emitted `removed: true`. Both exact run
paths are absent; final strict audit is empty; runs/ownership receipts are zero;
no lifecycle lease. Targeted ps/lsof checks found no task browser, Host, driver,
controller or open run handles. Legacy Typert workspace, `.vite` and
`.vite-temp` are absent. No files outside the task's owned runs were swept.

Shared CFT, Playwright, pnpm, package stores and dependency links were retained.
Required formal `lib` outputs were regenerated in their existing location.
OS socket/shared-memory/crash-report and browser-system-service exceptions remain
`not-enumerable`; the browser enforcement exception is a blocker, not a waiver.

No Harness Core or real DSH/Profile configuration was changed. The Harness's
preexisting untracked `deepseek-harness` entry remains. System Keychain settings
and normal browsers were not modified or terminated. The report follow-up is
docs-only; no executable change follows the tested SHA.

## 8. Next review gate

Review the instrumentation independently. Before any new real-browser execution,
establish a compatible process-wide protected-path/loopback boundary while
retaining native Chromium sandbox, then verify the requested Keychain flags and
popup absence without accessing system secrets. Only after that may a new
authorized run complete the real painted-UI matrix.

This submission stops with the browser guard intact. It does not retry Full,
merge main or declare `DSH_IDEA_UX02A_READY_FOR_ARCHITECTURE_REVIEW`.

Evidence: `DSH_IDEA_UX02A_EVIDENCE_20261026.json`. Publication SHA and
push/fetch/ls-remote equality are returned in the final response.
