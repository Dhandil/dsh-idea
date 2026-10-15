# DSH Idea T13.2 — Final Architecture Acceptance and Closure

- **Closure:** `T13_2_FINAL_CLOSED_WITH_ATTRIBUTION_EXCEPTION`
- **Independent architecture decision:** `T13_2_FINAL_ACCEPTED_WITH_PROVIDER_ATTRIBUTION_EXCEPTION`
- **Date:** 2026-10-15
- **Closure baseline:** `c2750d8719469b37a2e9ba3ffeeea8ef66a29404`
- **Tested executable:** `7f1703badb6e48845798d8444d00f1e12023c5d8`
- **Harness reference:** `ddefc45fbc7f8e46dd73185e68295696d1297887`
- **Live execution report:** [DSH_IDEA_T13_2_FINAL_FIXTURE_A_LIVE_ACCEPTANCE_20261015.md](DSH_IDEA_T13_2_FINAL_FIXTURE_A_LIVE_ACCEPTANCE_20261015.md)

## Decision and preserved Gate record

The independent final architecture decision accepts and closes T13.2 with a narrowly scoped exception for the completed Fixture A **functional** acceptance. The historical live execution result remains unchanged: Gate 0 **PASS**, Gate 1 **PASS**, and Gate 2 **BLOCKED — `PROVIDER_STAGE_ATTRIBUTION`**. The execution report continues to state that Gate 2 was blocked because the ledger did not independently attribute a Provider request to the Judge stage.

The final decision accepts the verified user-facing and Judge behavior as sufficient for T13.2 closure despite that evidence limitation. It does not rewrite the Gate 2 record or claim that the Provider-stage gate passed.

## Accepted functional evidence

- Fixture A was saved through the UI as v1, edited through the UI into v2, and verified through official read-only Idea RPCs. The exact frozen fields and two-version history were confirmed.
- UI Pause → official read-back `resurfacingMuted=true` → UI Resume → read-back `false` was verified.
- The exact frozen trigger was sent once. The real Judge returned `SURFACE / ADDS_MISSING_OPTION` for the Fixture A Idea.
- The Idea reminder strip appeared. After one click on `本次忽略`, the strip disappeared and official `idea/get` confirmed `resurfacingMuted=false`; ignoring the suggestion did not permanently mute the Idea.
- The execution report records supporting screenshots and the official RPC results. The test Idea and disposable runtime were cleaned up.

## Provider attribution exception — limited scope

The run used **5 of the 20** permitted Provider calls. All five completed with HTTP 200; semantic Provider calls were zero and no request was denied before dispatch. The stage-sensitive ledger classified all five as `AGENT_OR_OTHER`; it contained no `RESURFACING_JUDGE` row. Therefore, the individual Provider request that produced the real Judge response was **not proven by the ledger**.

This exception applies only to accepting the T13.2 Fixture A functional evidence and closing T13.2 under the independent architecture decision above. It is not a general waiver of Provider-stage attribution, does not establish a Judge-specific Provider count, and does not alter attribution gates for other work or future validations.

## Integrity and scope closure

- The tested executable reference remains `7f1703badb6e48845798d8444d00f1e12023c5d8`; the live execution report records no product, test, Harness, or Freeze changes and zero Harness tracked diff.
- At this closure baseline, the working tree had no tracked/index changes. This closure adds only this Markdown report. The existing untracked `.DS_Store` files are preserved.
- No tests were rerun. No browser was started and no Provider was called for this closure report.
- T13.3 and T14 remain **NOT STARTED**.

T13.2 is closed as `T13_2_FINAL_CLOSED_WITH_ATTRIBUTION_EXCEPTION`, subject to the explicit, T13.2-only Provider attribution exception above.
