# DSH Idea T13.2 — Final Scenario I Closure Report

- Outcome: **`T13_2_EVENTSOURCE_REPAIR_LIVE_VALIDATION_FAILED`**. Attempt 2 completed as an eligible tower-defense turn, but the repaired live path dispatched neither `idea/evaluateResurfacing` nor a Resurfacing Judge request. Per the frozen stop rule, validation stopped immediately; no in-round repair or third attempt was made. The positive-Judge strip and dismiss-non-durable proof remain untested.
- Date: 2026-10-12
- Scope: the remaining positive-Judge → real strip → “Dismiss this time” → non-durable proof only. Accepted A–H, Pause/Resume state, deterministic eventSource repair, earlier post-Resume dispatches, attribution/isolation, and normal Harness coexistence were not rerun.

## Baselines and isolation

- dsh-idea started at `64d24f6dcf870634d1a8bdbd380c736252a935b9`, equal to `origin/main`. Tested repair implementation: `7f1703badb6e48845798d8444d00f1e12023c5d8`. Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887`.
- A fresh disposable runtime and whole-pair provider template were created outside the repository. All four snapshot comparisons passed before atomic pair publication; template files were read-only and the runtime credential copy was mode `0600`.
- Seatbelt mechanism A wrapped Host and CLI processes. Its non-mutating self-test allowed a read of real `~/.dsh/settings.yaml` and denied an `O_WRONLY` open with `EPERM`. The provider guard used a Node preload with an atomic pre-dispatch reservation cap of 20. Its fake-transport self-test denied would-be request 21 before transport, with 20 fake transports and one denial; the live ledger was then reset to zero.
- Normal Harness port 3080 had no listener and received no traffic. The disposable Host used port 18795 only. Real `~/.dsh` before/after path, type, mode, and non-credential metadata manifests had 1,944 entries each with zero differences; the credential file compared equal to the pre-run template reference. **`REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE`**.
- The disposable Host was stopped, port 18795 released, browser page closed, runtime/workspace/rig removed, provider template removed, and copied credentials and raw ledger deleted. No temporary template remained. The existing `packages/dsh-idea/.DS_Store` and Harness `deepseek-harness` symlink were preserved.

## Semantic provider isolation

Semantic retrieval was disabled through the supported disposable profile override at `<runtime>/home/cordis.patch.yml`:

```yaml
- id: dsh-idea-semantic
  config:
    mode: off
```

The official boot-free `--dump-config` output showed the effective value `dsh-idea-semantic.mode = off` before any real turn. The existing semantic service returns an empty candidate set in this mode. Attempt 1 still made the normal `semanticResurfacingCandidates` RPC, which returned successfully, but the provider guard recorded **zero semantic provider calls**. Attempt 2 did not reach evaluation and made no semantic RPC.

## Minimal precondition

The fresh Idea store started empty. Using the real UI, Direct Save created the unique TARGET `idea_13c41c03-f788-433b-8a62-a70132486ba2` with marker `DSH_IDEA_T13_2_FINAL_I_20261012_0836`. The UI Pause action was followed by official `idea/get` readback `resurfacingMuted = true`; the UI Resume action was followed by official readback `resurfacingMuted = false`. The Idea detail showed “提醒：已开启” and “暂停提醒”. Provider ledger remained at zero through these actions.

## Natural live attempts

| Attempt | Trigger | Completed | Evaluate | Judge | Result |
|---|---|---:|---:|---:|---|
| 1 | Frozen primary: 「我准备重新做一个塔防游戏，但核心差异化还没有决定。我应该从哪里切入？」 | Yes | 1 | 1 | Judge returned `NONE / TOO_WEAKLY_CONNECTED`; no strip |
| 2 | Frozen alternate: 「我现在正在重新设计塔防玩法，尤其在想攻击范围和角色构筑怎么做出差异化，之前有没有值得重新拿出来的方向？」 | Yes | 0 | 0 | Strongly eligible completed turn; no evaluate/Judge dispatch; stop condition reached |

Attempt 1 requested two in-product clarifications, answered through the real UI as “解谜/布局” and “个人/小团队 + PC(Steam)”. Its completed turn followed the expected evaluate → Judge path. The official Judge response was `outcome = none`, `reason = TOO_WEAKLY_CONNECTED`.

Attempt 2 ran in a separate fresh conversation. The final assistant response directly discussed tower-defense attack-range geometry and build differentiation. It completed without a product Idea error, but the Idea request list showed only a resurfacing-budget read for that turn: no `evaluateResurfacing`, no semantic-candidate RPC, and no Judge. This satisfies the frozen live-silence stop rule. No third trigger was sent.

## Provider accounting and product UI result

- `PROVIDER_REQUESTS_TOTAL = 9` delivered; hard cap = 20; no request 21 was attempted.
- `AGENT_REQUESTS = 8`
- `RESURFACING_JUDGE_REQUESTS = 1`
- `SEMANTIC_REQUESTS = 0`
- `DENIED_PRE_DISPATCH = 0`
- `FAILED = 0` public provider requests
- `REAL_EVALUATE_REQUESTS = 1`; `REAL_JUDGE_REQUESTS = 1`; `ATTEMPTS_USED = 2`
- `REAL_STRIP_SURFACED = FALSE`; `DISMISS_COMPLETED = FALSE`; `DISMISS_NON_DURABLE = NOT_TESTED`
- `PAUSE_STATE = resurfacingMuted true`; `RESUME_STATE = resurfacingMuted false; UI reminders on; Pause available`
- `SEMANTIC_DISABLE_MECHANISM = disposable user patch at <runtime>/home/cordis.patch.yml, dsh-idea-semantic.mode: off; verified by official --dump-config`
- `ATTRIBUTION_MECHANISM = Seatbelt mechanism A for real ~/.dsh write denial, plus repository-external Node preload guard for provider request attribution and pre-dispatch cap`
- `ATTRIBUTION_SELF_TEST = PASS` for both the Seatbelt read/deny-write probe and provider cap self-test
- `BROWSER_RELEVANT_ERRORS = 0`: page errors 0, unhandled rejections 0, console errors 0, event-feed subscriber failures 0, and failed Idea RPCs 0. The first attempt’s evaluate, semantic RPC, and Judge all returned HTTP 200. The second attempt’s evaluate/Judge calls were absent rather than failed.

## Environment failures kept separate

- The Agent’s workspace-write Bash runner failed twice because this host reported `sandbox-exec: sandbox_apply: Operation not permitted`. In attempt 2, the Agent then requested `danger-full-access` to list the disposable workspace and its parent directories; that escalation was declined. The Agent continued and completed from available context. These are Agent tool/sandbox failures, not Idea RPC or browser runtime errors, and no command was run unconfined.
- During local disposable workspace setup, three malformed `workspace/create` RPC envelopes failed before the correctly formed request succeeded. These were Host setup errors, not Idea RPCs; all occurred before the real trigger turns.
- Persisted Host startup and plugin-install logs contained no error lines. No separate live Host stderr log was persisted by the runner.

## Cleanup and drift

- `PORT_18795_RELEASED = TRUE`
- `DISPOSABLE_RUNTIME_DELETED = TRUE`
- `PROVIDER_TEMPLATE_DELETED = TRUE`
- `HARNESS_TRACKED_DIFF = 0`
- `EXECUTABLE_TEST_DRIFT = 0`
- `PREEXISTING_UNTRACKED_DRIFT_PRESERVED = TRUE` (`.DS_Store` and Harness symlink unchanged)
- `NORMAL_3080_TOUCHED = FALSE`
- No unit suite, Canonical Full, T13.3, or T14 work was run.

## Verdict

**`T13_2_EVENTSOURCE_REPAIR_LIVE_VALIDATION_FAILED`** — the accepted repair’s live path reached evaluate and Judge once, with Judge returning NONE, but a second eligible completed turn produced no evaluate or Judge dispatch. Validation stopped at that boundary as required. This round does not establish a positive resurfacing verdict, does not show a product defect in dismiss behavior, and does not complete the final Scenario I closure proof. No code or executable files were changed; this report is the only repository change.
