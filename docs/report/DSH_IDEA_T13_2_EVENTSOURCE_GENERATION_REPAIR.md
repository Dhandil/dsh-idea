# DSH Idea T13.2 — EventSource Generation Repair

- Outcome: **`T13_2_EVENTSOURCE_GENERATION_REPAIR_READY_FOR_ARCHITECTURE_REVIEW`**. This is not T13.2 Final Accepted.
- `BASELINE_SHA = 4d23fa2967d7258fbf7940eab92d9ca2cba28ed8`
- `IMPLEMENTATION_SHA = 7f1703badb6e48845798d8444d00f1e12023c5d8`
- `REPORT_COMMIT = this docs-only report commit` (the literal commit ID is provided in the final handoff; a commit cannot contain its own hash)
- `FINAL_REMOTE_SHA = origin/main after fetch verification` (literal SHA is provided in the final handoff)
- `HARNESS_SHA = ddefc45fbc7f8e46dd73185e68295696d1297887`
- `REAL_PROVIDER_CALLS = 0`
- `HARNESS_CHANGE = FALSE`
- `PREEXISTING_UNTRACKED_DRIFT_PRESERVED = TRUE`

## Repair

`controllerFor(sessionId)` now reads the current `sessions.binding(sessionId)` and scope before consulting controller ownership. `ResurfacingControllerOwner` retains the `eventSource` object captured for each controller and reuses a controller only when strict object identity matches the current binding's event source.

When a binding or required scope is absent, the cached controller is disposed and the existing fail-closed error is preserved. When a new event source is present, the old controller is disposed while still owned, its entry is removed, and only then is a new controller constructed and stored. The owner disposes every remaining controller once at plugin teardown and continues releasing other controllers if one disposer throws.

No diagnostic IDs or tags, Harness API, budget behavior, or resurfacing gates were added or changed. The implementation changes only client controller lifecycle ownership.

## Required lifecycle evidence

| Requirement | Result | Evidence |
|---|---|---|
| R1 — reuse within one generation | PASS | Same controller returned twice; factory called once; one event subscription; no early dispose. |
| R2 — replace a stale generation | PASS | G1 dispose ran before G2 construction; G1 subscription was removed and G2 subscribed to E2. |
| R3 — completed G2 event reaches controller | PASS | Deterministic completed `turn/end` on E2 dispatched the existing evaluate and Judge seams; publishing on E1 dispatched neither. |
| R4 — teardown | PASS | After replacement and a second owned session, teardown disposed each remaining controller exactly once; repeated teardown did not double-dispose; subscriptions were removed. |
| R5 — binding absent | PASS | Retiring the current owner removed/disposed the cached controller; an absent generation returned no controller and did not invoke the factory. `controllerFor` then throws the pre-existing missing-binding error. |

The new R1–R5 coverage is in `packages/dsh-idea/tests/client-resurfacing.spec.tsx` and uses the real `IdeaResurfacingController` with deterministic event sources and stubbed downstream faces.

## Verification

- Focused resurfacing/controller and T10/T13.1 preference/mute regressions: **13 files, 219/219 tests passed**.
- Previously reported five-file deterministic baseline: **5 files, 65/65 tests passed**.
- Full deterministic suite: **57 files, 886/886 tests passed** with `vitest run --no-file-parallelism --testTimeout=15000`.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- `pnpm build:client`: PASS.
- `pnpm generate:typert`: PASS; generated tracked output had no diff.
- A plain `pnpm verify` run hit the existing T13.1 E6 loopback embedding race's 5-second timeout in the full suite. The E6 test passed in isolation and in the focused 13-file regression run; the complete suite passed with a 15-second Vitest test timeout. The E6 test and its business logic were not changed.
- No real provider, browser, Scenario I, Canonical Full, T13.3, or T14 validation was run.

## Changed files

- `packages/dsh-idea/src/client/index.ts`
- `packages/dsh-idea/src/client/resurfacing-controller-owner.ts` (new)
- `packages/dsh-idea/tests/client-resurfacing.spec.tsx`
- `docs/report/DSH_IDEA_T13_2_EVENTSOURCE_GENERATION_REPAIR.md` (this report)

## Integrity

`TRACKED_INDEX_DRIFT = intended implementation/report commits only; no staged or uncommitted tracked changes remain`

`PREEXISTING_UNTRACKED_DRIFT_PRESERVED = TRUE`

The existing dsh-idea `packages/dsh-idea/.DS_Store` and Harness `deepseek-harness` symlink were preserved and not staged. Harness remains at the pinned SHA with no tracked changes. The report commit and fetched remote SHA are identified in the final handoff because those hashes cannot be embedded in the commit that contains them.
