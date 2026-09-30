# DSH Idea T12.2 Quick Capture — Final Architecture Review

Status: **`T12_2_QUICK_CAPTURE_ARCHITECTURE_ACCEPTED` / `T12_2 = CLOSED`**
Date: 2026-09-30
Scope: docs-only final acceptance closure. No product code, test, Harness, configuration, or build-artifact change is part of this closure; no test, Canonical Full, or real Provider call was re-run while writing it.

## Accepted executable

- **Accepted executable = `a0d10755524a06e27772613f8713a2d60fc15653`** (the fourth-repair commit, whose built `lib/` state — host `tsc` build, client bundle 11:02 — is unchanged since the final Canonical Full: zero post-Full executable drift).
- Current closure baseline: `6211541519bb85d0a16ebd7caedfeedd6cf3c89f` (= `origin/main` at closure), containing the implementation, all four repair commits, their pinned acceptance reports, and this review.

## Frozen decisions (D1/D2/D3 — unchanged through every repair)

- **D1**: `motivation` may be empty; edit and evolution stay compatible; the chat-extraction flow keeps its own stricter motivation check at the preparation boundary.
- **D2**: the Preparation Registry is widened with a discriminated origin (`conversation` / `quick-capture`); the Commit Machine branches on it; `IdeaService.createDirect` writes honest empty provenance (`sourceDiscussions=[]`, `versions[0].sourceDiscussionIds=[]`, `reason='initial-save'`). A bare un-idempoted create was rejected.
- **D3**: both save modes (deterministic direct save with zero LLM; explicit AI organize with exactly one model call) submit through the unified Preparation/Commit idempotency — an unclear outcome is recovered only with the SAME preparation id, never a re-prepared one.

## Repair lineage (R1–R10, all CLOSED)

| Round | Commit | Items |
|---|---|---|
| Initial implementation | `5b2351500679c7c1675b8c24c051aad3b8334619` | D1/D2/D3 implementation + preflight/freeze docs |
| Repair 1 | `a5f0ae2dad34621f8dcf9a8373527668c9892c1e` | R1 card-close/Add coordination, no late preview, handoff-not-drop; R2 titleMax cap; R3 shared Host input gate (AI pre-reject); R4 direct auto-commit; R5 registry identity assertions |
| Repair 2 | `3286bc1bfdf8707878f9243d19bef04ea406e44d` | R6 outcome state restoration on structured failures; R7 cancellable-prepare vs non-cancellable-commit; R8 same-id unclear recovery + stale-finally ownership guard |
| Repair 3 | `37a7757f6361e01a83794f8d52e89e8fa4be7bc2` | R9 pendingUnclear recovery lifecycle: same-id retry with synchronous commitInFlight, close-survival, no edit/AI/re-prepare bypass, gateway-classified-as-unclear |
| Repair 4 | `a0d10755524a06e27772613f8713a2d60fc15653` | R10 busy/not-attempted outcome: busy never destroys the pending recovery, zero remote create calls on busy, same-id commit after the busy surface clears, concurrent-commit safety unchanged |

Each round's evidence and per-item regressions are recorded in `docs/report/DSH_IDEA_T12_2_QUICK_CAPTURE_IMPLEMENTATION_ACCEPTANCE.md` (§3, §5, §6, §6a, §6b). Historical failure and repair records are preserved as written; only this review establishes the final authoritative state.

## Final verification state (authoritative)

- **Final Canonical Full = 52 files / 820 tests PASS**, run exactly once in its final form with `--no-file-parallelism` (a standard vitest execution parameter adopted to eliminate machine-load timing flakes in pre-existing embedding-mode timing suites; code and tests unchanged).
- **Zero post-Full executable drift**: the built `lib/` artifacts' timestamps are unchanged since the final build that preceded the final Canonical Full; the committed code state (`a0d1075`) is exactly what the gates verified.
- **Real Provider calls = 0** across the whole T12.2 lifecycle (all suites run on scripted offline fakes; the AI path is verified by call-count and framing assertions, never against a live provider).
- **Harness unchanged**: `D:\Harness\deepseek-harness` at `ddefc45fbc7f8e46dd73185e68295696d1297887`, tracked diff zero, read-only throughout.
- **User data untouched**: the real `~/.dsh` manifest was byte-identical before/after every round that booted an isolated server; the user's pre-existing docs drift (17 items) remains preserved, uncommitted, outside this closure.

## Evidence boundary (explicit, unchanged)

Quick Capture's direct-save and AI-organize paths are verified by offline scripted tests (FakeLlm for the AI path) plus the pre-existing accepted suites. The R1–R4 real-provider user-journey evidence (`REAL_SEMANTIC_VALIDATION_R1/R2`, `REAL_USER_JOURNEY_R3/R4`) covers the resurfacing chain and remains the authority for those boundaries; T12.2's Quick Capture itself has not been exercised against a live provider — that belongs to a future, separately budgeted validation if the architecture requests one.

## Disposition

- `T12_2_QUICK_CAPTURE_ARCHITECTURE_ACCEPTED`
- `R1–R10 = CLOSED`
- `T12_2 = CLOSED`
- `T13 = NOT_STARTED`

This closure is committed docs-only on top of `6211541`, without disturbing the user's pre-existing docs reorganization. Nothing beyond this review is modified.
