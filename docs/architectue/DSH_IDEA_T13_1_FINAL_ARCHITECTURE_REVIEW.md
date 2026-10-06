# DSH Idea T13.1 Resurfacing Preference — Final Architecture Review

Status: **`T13_1_RESURFACING_PREFERENCE_ARCHITECTURE_ACCEPTED` / `T13_1 = CLOSED`**
Verdict: `T13_1_PRODUCT_DEFECT = NONE_ESTABLISHED`; `T13_1_EXECUTABLE_REPAIR_REQUIRED = NO`
Date: 2026-10-06
Scope: docs-only final acceptance closure. No product code, test, Harness, generated-file, configuration, dependency, or lockfile change is part of this closure; no test, Canonical Full, browser session, or real Provider call was re-run while writing it.

## Accepted Tested SHA

- **Final Accepted Tested SHA = `eb7677045e3d224b3603e7a7ad7313ea299abefc`** (the final test-evidence closure commit: tests-only over Repair #2, zero product `src/` changes, zero post-Full executable drift).
- Current closure baseline: `df0fe12fc71234bb59d3c5645e1a7b9a7c9b81de` (= `origin/main` at closure), containing the full implementation lineage, all deterministic evidence, and the committed acceptance report.

## Product implementation lineage

| Stage | Commit |
|---|---|
| Initial implementation | `c001a4b92a47e292571e12a654f8361f39130070` |
| Repair #1 | `a7eb01860a7bad60aee0e02243944d2b675e7c6d` |
| Repair #2 (product implementation) | `8cad7b2e09237e2565479d230b0195d4c3a85a48` |
| Repair #2 (docs-only report) | `0b8bb159cb849852b5f6ce285e1b76710f63d69a` |
| Final test-evidence closure (E1–E6) | `eb7677045e3d224b3603e7a7ad7313ea299abefc` |
| Evidence report (docs-only) | `df0fe12fc71234bb59d3c5645e1a7b9a7c9b81de` |

## Accepted architecture facts (D1–D10, frozen through every round)

- **D1**: 本次忽略 (dismiss this time) is an ephemeral per-opportunity action — never the durable pause; the pause is a separate durable action.
- **D2**: `resurfacing_preferences` is independent durable auxiliary state (additive table keyed by `IdeaId`, minimal record `{ muted: true }`); absence = enabled, presence = muted. The preference never enters `IdeaDraft`, `IdeaVersion`, semantic fields, or evolution history.
- **D3**: idea domain `version = 3`, `compatibleVersions = [1, 2]`, no migration — unchanged throughout.
- **D4**: mute/unmute produce no Idea version, no `updatedAt` drift, no evolution event, no semantic re-index, and zero provider calls.
- **D5**: permanent delete cleans the preference under the per-Idea mutation authority (serialized; post-delete mute rejected).
- **D6**: `USER_MUTED` is enforced across the whole proactive pipeline — lexical evaluation, the T11 embedding branch, the T11 LLM selector, Judge pre-dispatch revalidation (R1-A), Judge post-I/O revalidation (R1-B), and the final delivery claim (R1-D). Deterministic-only suppression stops before any provider dispatch.
- **D7**: the conversation strip carries 查看 / 引用 / 本次忽略 / 暂停提醒; a pause succeeds silently (strip gone, `lastExpireReason='USER_MUTED'`) and fails honestly (strip stays, visible retry affordance, no pretend success).
- **D8**: the Settings reminder control renders for active Ideas only; dormant and archived Ideas show no control; archive/restore preserve the preference; only permanent delete clears it.
- **D9**: the browser writes only through the Remote/domain authority (`idea.setResurfacingMuted` → Host-owned storage; delivery claims route `claimResurfacingBudget({ sessionId, ideaId })` → `IdeaService.claimResurfacingDelivery`) — never direct storage writes.
- **D10**: no learned ranking, implicit feedback scoring, dismiss-count penalty, TTL, cooldown, auto-unmute, global disable, project-level preference, Idea Graph, tags, merge/split, or PAH integration entered the implementation.

## Final deterministic evidence (E1–E6, all PASS)

Recorded in `docs/report/DSH_IDEA_T13_1_RESURFACING_PREFERENCE_IMPLEMENTATION_ACCEPTANCE.md` (§4c), committed at the final test-evidence closure:

- **E1** — Host delivery-claim authority (R1-D): a muted Idea's `claimResurfacingDelivery` returns `USER_MUTED` with the conversation budget remaining free (`consumed === false` before and after); an unmuted Idea claims `CLAIMED` (budget consumed) then `ALREADY_CONSUMED`.
- **E2** — client `USER_MUTED` delivery (R1-D): the suggestion is silenced without consuming the budget; the SAME controller's next eligible turn runs the full evaluate → Judge → claim path again and can surface a different Idea — proven through public behavior, never by inspecting private state.
- **E3** — mute before Judge (R1-A): the pinned candidate is dropped with `reason: 'USER_MUTED'` and **0 Judge provider calls**.
- **E4** — mute while the Judge provider call is in flight (R1-B): the returned legitimate SURFACE verdict is discarded; the outcome fails closed to `none` with `dropped` carrying `USER_MUTED`.
- **E5** — mute while the LLM selector call is in flight (R1-C): the model-selected Idea is removed post-I/O from the candidates (the only Idea → `[]`), so no downstream Judge request can carry it.
- **E6** — mute while the query embedding is in flight (R1-C): the candidate is removed post-I/O from the scored results.

## Final verification state (authoritative)

- **Test-evidence scope**: 3 test files (`tests/resurfacing-preference.spec.ts`, `tests/resurfacing-mute-suppression.spec.ts`, `tests/client-resurfacing.spec.tsx`), **+276/−4, zero product src changes** (commit `eb76770…`).
- **Final Canonical Full = 57 files / 883 tests PASS**, run exactly once fresh with `vitest run --no-file-parallelism` (`--no-file-parallelism` is the standard execution parameter adopted at T12.2 to eliminate machine-load timing flakes in embedding-mode timing suites), with **zero post-Full executable/test drift**.
- **Real Provider calls = 0** across the whole T13.1 lifecycle (every model seam is a scripted offline fake; the embedding races run against a loopback-only fake server on 127.0.0.1).
- **Harness unchanged**: `/Users/tongxin/Developer/Harness/deepseek-harness` at `ddefc45fbc7f8e46dd73185e68295696d1297887`, tracked diff zero, read-only throughout.
- **Mac workspace clean** at preflight and at final closure (HEAD == origin/main == `df0fe12…`); historical Windows execution preserved 17 docs-drift items, uncommitted, outside this closure.

## Evidence boundary (explicit)

This Final Architecture Review performed an **independent source review** of the GitHub-visible implementation commits, tests, report lineage, and deterministic race tests (E1–E6). The Canonical Full's local actual execution result (**57 files / 883 tests PASS**) comes from the committed Acceptance Report evidence (`df0fe12…`, §2/§4c) — no local Full was re-executed as part of this review, and none is claimed.

## Disposition

- `T13_1_RESURFACING_PREFERENCE_ARCHITECTURE_ACCEPTED`
- `T13_1_PRODUCT_DEFECT = NONE_ESTABLISHED`
- `T13_1_EXECUTABLE_REPAIR_REQUIRED = NO`
- `T13_1 = CLOSED`
- `T13.2 = NOT_STARTED`
