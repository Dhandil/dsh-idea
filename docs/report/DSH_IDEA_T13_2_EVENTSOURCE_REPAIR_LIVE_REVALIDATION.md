# DSH Idea T13.2 — EventSource Repair Live Revalidation

- Outcome: **`T13_2_PROVIDER_REQUEST_CAP_REACHED`**. The 12-request real-provider budget was exhausted before a second Judge result, positive strip, or dismiss could be observed. The repaired live path therefore remains incomplete; no implementation or test changes were made.
- Date: 2026-10-12
- Baseline dsh-idea HEAD / `origin/main`: `a8e4da0979af6319cc27aa48aa589e5a664170eb`
- Tested implementation: `7f1703badb6e48845798d8444d00f1e12023c5d8`
- Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887` (read-only)
- Scope: Scenario I Pause → Resume → completed real turn → Judge → strip → Dismiss this time. A–H, Canonical Full, unit suites, T13.3, and T14 were not run.

## Isolation and attribution

The fresh runtime was `/Users/tongxin/Developer/Harness/.t13-2-live-I-20261012_X5oXYV`, with an isolated `DSH_HOME`, fresh Idea store, and workspace created through the official Host UI/API. The provider key pair snapshot passed all four stable comparisons on attempt 1, was atomically published, and credentials were mode 0600. The provider template remained read-only until cleanup.

**`ATTRIBUTION_MECHANISM = A_SEATBELT`; `ATTRIBUTION_SELF_TEST = PASS`.** The non-mutating `O_RDONLY` probe succeeded and `O_WRONLY` was denied with `EPERM`. The Host ran under the Seatbelt profile with the explicit disposable `DSH_HOME`; the normal `~/.dsh` and port 3080 were not used. **`REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE`** based on the write-denial probe and isolated Host launch.

## Idea state precondition

Using the real UI and Direct Save, the fresh Idea store received TARGET `idea_52723929-3e67-461a-b147-0d3b67de1ef8` (marker `DSH_IDEA_T13_2_20261012_160614`). The saved Idea displayed Reminders on. Pause produced official `idea/get` read-back `resurfacingMuted = true`; Resume produced `resurfacingMuted = false`, with Reminders on and Pause reminders available in the UI. The provider ledger remained empty through these actions (**provider delta 0**).

## Real trigger results

| Attempt | Trigger | Result |
|---|---|---|
| 1 | Frozen primary: 「我准备重新做一个塔防游戏，但核心差异化还没有决定。我应该从哪里切入？」 | Completed naturally after UI clarification. `idea/evaluateResurfacing` dispatched and returned HTTP 200. One real Resurfacing Judge request dispatched and returned a legitimate **NONE** decision. No TARGET strip appeared. One Semantic Selector request also occurred. |
| 2 | Frozen alternate in a new conversation: 「我现在正在重新设计塔防玩法，尤其在想攻击范围和角色构筑怎么做出差异化，之前有没有值得重新拿出来的方向？」 | Five Agent requests were delivered. The provider guard reached 12/12 before another evaluate/Judge dispatch; the real turn was stopped at the cap. No second Judge result or strip appeared. |

The first NONE result correctly led to the frozen alternate in a new conversation. The cap stopped further attempts, so the three-attempt allowance was not exhausted. No identical prompt was repeated. `REAL_EVALUATE_DISPATCHED = TRUE`; `REAL_JUDGE_DISPATCHED = TRUE` (one request); `REAL_STRIP_SURFACED = FALSE`. Dismiss was not reached: **`DISMISS_COMPLETED = FALSE`; `DISMISS_NON_DURABLE = NOT_VERIFIED`**. The precondition read-back remains the last verified reminder state; this run does not claim post-dismiss persistence.

## Provider guard and browser audit

The atomic pre-dispatch guard enforced the real cap of 12. The real ledger recorded:

- `PROVIDER_REQUESTS_TOTAL = 12` delivered
- `AGENT_REQUESTS = 10`
- `RESURFACING_JUDGE_REQUESTS = 1`
- `SEMANTIC_REQUESTS = 1` (nonzero; expected value was 0)
- `DENIED_PRE_DISPATCH = 0` real requests; `FAILED = 0`

The offline fake-transport guard self-test separately confirmed that request 13 is denied before transport dispatch. This live run was stopped at 12 and did not attempt a real request 13. Request-stage attribution used the guarded provider ledger; no bodies, headers, keys, or tokens were retained in the report.

During the live page, the audit recorded page errors 0, unhandled rejections 0, console errors 0, and `[session-controller] event feed subscriber failed` occurrences 0. Captured Idea RPCs all returned HTTP 200, and Host log search found no matching errors. Thus **`BROWSER_RELEVANT_ERRORS = 0` during the scenario**. Separately, two Agent Bash workspace-list attempts showed the Host's unavailable `workspace-write` sandbox error in the conversation UI; one exact read-only `ls -la` was allowed once, after which the run continued. These were Agent tool-environment failures, not Idea RPC or page errors. Closing the page after stopping Host recorded one `ERR_INCOMPLETE_CHUNKED_ENCODING` on `/plugins/events`, attributable to the intentional Host shutdown with its event stream open; it was not present in the live-page error audit.

Normal navigation created a new conversation, but did not naturally expose a same-SessionId G1 → scope retirement → G2 identity transition. No instrumentation was added. Production-safe generation identities were unavailable in this scenario; the previously recorded deterministic R1–R5 repair tests remain the generation ownership evidence.

## Cleanup and repository integrity

The disposable Host was stopped, the browser page was closed, and port 18795 had no listener afterward. The disposable runtime (home, workspace, rig, copied credentials, and raw provider ledger), fresh provider template, and its temporary directory were deleted. The Seatbelt profile kept real `~/.dsh` write-protected throughout. `NORMAL_3080_TOUCHED = FALSE`.

The Harness checkout remained at its pinned SHA with tracked diff 0. This report is the only intended dsh-idea change; executable/test drift is 0. The pre-existing `packages/dsh-idea/.DS_Store` and Harness `deepseek-harness` symlink were preserved and not staged. No Canonical Full or unit suite was run. The report commit and fetched remote SHA are provided in the final handoff.

## Verdict

**`T13_2_PROVIDER_REQUEST_CAP_REACHED`** — the first real turn exercised the repaired evaluate/Judge path, but Judge returned NONE; the frozen alternate was started, and the 12-request cap stopped validation before another Judge or positive strip. The core non-durable dismiss invariant remains unverified. No in-round repair was attempted. T13.3/T14 were not started; wait for independent Final Review.
