# DSH Idea T13.2 — Runtime Identity Diagnostic

- Outcome: **`T13_2_DEFECT_LOCALIZED_EVENTSOURCE_GENERATION`** — an isolated runtime reproduced a Session-generation replacement for the same `SESSION_ID` while the dsh-idea controller remained attached to the prior `eventSource`. H2 was not observed.
- Date: 2026-10-12
- `TAKEOVER_STATE = B_PARTIAL_RECOVERABLE`
- `BASELINE_SHA = 9c69420f55eaea2fda2b03d3b577aea600db40d7`
- `HARNESS_BASELINE_SHA = ddefc45fbc7f8e46dd73185e68295696d1297887` (read-only)
- `ACCEPTED_EXECUTABLE_SHA = eb7677045e3d224b3603e7a7ad7313ea299abefc`
- `TARGET_REPORT_BEFORE_TAKEOVER = ABSENT`

## Takeover state and evidence provenance

### Evidence inherited from zcode

- The committed `docs/report/DSH_IDEA_T13_2_DEFECT_LOCALIZATION_PREFLIGHT.md` records the earlier three-trigger failure and leaves H1/H2 runtime attribution open. It reports a healthy Host evaluate result for the target Idea and no Judge dispatch in those historical turns.
- `/Users/tongxin/Developer/Harness/.t132-diag-copy` was present before Codex started a runtime. Its source and client bundle contain T13.2 identity/logging instrumentation. No retained runtime log, completed diagnostic report, provider template, or active zcode process was found.
- Excluding the shared `node_modules` symlink and Finder metadata, the package copy differs from the main package in two instrumented source files (`src/client/index.ts`, `src/client/resurfacing-state.ts`) and their client bundle/map (`lib/client.js`, `lib/client.js.map`); the main package's `build/` directory is absent from the copy. `package.json` and tests match. The source additions are object tags, bounded diagnostic logs, and a snapshot accessor. The original binding error, budget result handling, and evaluation gate conditions remain unchanged; logging is inserted around those paths. The source/bundle drift is therefore proven disposable instrumentation, not untrusted product drift.
- At takeover, dsh-idea `HEAD == origin/main == 9c69420f55eaea2fda2b03d3b577aea600db40d7`; staged and tracked diffs were empty. The only untracked dsh-idea item was `packages/dsh-idea/.DS_Store`, which was preserved. Harness was at the pinned SHA with no tracked or staged diff; its pre-existing untracked `deepseek-harness` symlink was preserved.
- No diagnostic listener was present on 18795 or 3080. No T13.2 process was found. The ordinary 3080 instance was not running during this takeover and was never touched.

### Evidence collected by Codex

- A task-specific runtime was created under `/Users/tongxin/Developer/Harness/.t13-2-runtime-codex-20261012.IesPqT/` with an empty, disposable `DSH_HOME`, workspace, and no copied provider settings or credentials. The Host was started from the pinned Harness checkout with the existing diagnostic copy, bound only to `127.0.0.1:18795` (PID 48418). A Seatbelt self-test denied `O_WRONLY` access to `/Users/tongxin/.dsh/settings.yaml` with `EPERM`; the Host inherited that write-denial profile.
- Two empty sessions were opened in two temporary workspaces. No user prompt or completed Agent turn was sent. A local browser-network inventory contained 48 recorded requests, all to `127.0.0.1:18795`; `idea/getResurfacingBudget` appeared twice, while `idea/evaluateResurfacing` and `idea/judgeResurfacing` appeared zero times. `REAL_PROVIDER_CALLS = 0`.
- The Host was stopped with SIGINT, the 18795 listener was released, the browser tab was closed, and 3080 remained untouched. No tracked file in dsh-idea or Harness was changed.

## H1 — Session/eventSource generation

The controlled runtime produced this sequence:

| Stage | Session ID | Controller | Controller source | Current binding source | Binding |
|---|---|---|---|---|---|
| G1, first open | `session-38a44f43-23d4-47bb-b25e-8ef376216347` | `ctrl-u600ts2d` | `src-d6dv8a5q` | `src-d6dv8a5q` | present |
| After switching to another workspace/session | same | `ctrl-u600ts2d` | `src-d6dv8a5q` | — | absent |
| G2, reopening the same Session ID | same | `ctrl-u600ts2d` | `src-d6dv8a5q` | `src-5rydnw9q` | present |

At G1, the Session object tag was `sessobj-4pyokh8i`. After switching away, the diagnostic snapshot showed the original controller still in the controller map while `sessions.binding(sessionId)` was absent. The intervening independent session was `session-2a78a04d-a782-4f26-8334-f67fa210eb34`; its controller `ctrl-zqjdy7pe` subscribed to `src-g9k8mkxx`. Reopening the original ID restored a binding whose event source had a different identity and whose current event window was revision 1, `replace`; the original controller ID and subscribed source remained unchanged. The reused controller did not tag the new Session object, so `liveSessionTag` was absent; the new eventSource identity is directly observed. Harness source confirms that `Session` owns its `MutableSessionEventSource` (`packages/api/session-controller/src/client/sessions/session.ts:144`), `retireScope` withdraws the binding and calls `manager.drop` (`.../sessions/service.ts:596-604`), and a later `SessionManager.get` creates a new Session object (`.../sessions/manager.ts:239-263`). The runtime did not separately instrument those private method calls; the absent binding and subsequent new eventSource were observed directly.

The controller log contains the G1 `replace` delivery but no delivery under `src-5rydnw9q`; the G2 snapshot is therefore not consumed by the still-live G1 controller. This confirms the H1 stale-generation mechanism. The production code path is visible at `packages/dsh-idea/src/client/index.ts:171-195`: controllers are keyed by SessionId, capture `binding.eventSource` at construction, and are disposed only at plugin teardown.

`H1_RESULT = H1_RUNTIME_CONFIRMED` for the reproduced Session-generation mismatch.

## H2 — budget load

Two controller constructions each dispatched `idea/getResurfacingBudget`; both RPCs returned successfully with `budgetState = free`. There were zero transport-error log entries and zero `failed` outcomes.

`BUDGET_LOAD_ATTEMPT = 2`

`BUDGET_LOAD_RESULT = 2 successful free results; 0 errors`

`CONTROLLER_BUDGET_STATE = free` for both controllers

`H2_RESULT = H2_NOT_OBSERVED`

## Boundary and attribution

- `TURN_END_SEEN_BY_CONTROLLER = 0`; no completed turn was generated because this diagnostic deliberately made no provider call.
- `BEGIN_EVALUATION_ENTERED = 0`
- `EVALUATE_RESURFACING_RPC_DISPATCHED = 0`
- `LAST_PROVEN_GOOD_BOUNDARY`: G1 event-window `replace` reached the controller, and both budget reads resolved `free`. The earlier committed preflight separately records the Host evaluate probe returning the target as its sole candidate (score 32).
- `FIRST_BROKEN_BOUNDARY`: after the old Session scope is withdrawn and the same SessionId is reopened, `sessions.binding(sessionId).eventSource` changes while the dsh-idea controller map returns the prior controller without rebinding.
- `ROOT_CAUSE_OWNER`: dsh-idea client lifecycle integration at the SessionId-to-controller boundary. Harness intentionally scopes `eventSource` to a Session object; dsh-idea retains the controller for the wider plugin lifetime.
- `MINIMAL_REPAIR_SCOPE`: dispose/recreate or rebind a controller when the current Session binding generation/eventSource changes (or key controller ownership by Session generation). No repair was made.

This runtime confirms H1 as a real defect mechanism. Because it intentionally generated no completed turn, it does not prove that a G2 `turn/end` occurred in the earlier three-trigger Scenario I run; that historical event-to-generation attribution remains unobserved. H2 was not seen in this isolated run.

## Integrity and cleanup

`MAIN_EXECUTABLE_CHANGE = FALSE`

`TEST_CHANGE = FALSE`

`HARNESS_CHANGE = FALSE`

`REAL_PROVIDER_CALLS = 0`

`NORMAL_3080_TOUCHED = FALSE`

The temporary runtime, diagnostic copy, and Codex-created Playwright snapshots/logs were removed after their findings were recorded here. No implementation, test, Harness, Scenario I, or Canonical Full work was performed.

The report is the only task change. The pre-existing untracked `packages/dsh-idea/.DS_Store` and Harness `deepseek-harness` symlink were preserved under the no-delete-unknown-artifacts instruction; therefore a fully clean `git status` cannot be claimed without changing or removing those unrelated items. After commit, the dsh-idea tracked tree is clean, with the Finder file still reported as untracked.
