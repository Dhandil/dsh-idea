# DSH Idea T11.1 Real Validation — Architecture Review Conclusion

Status: `T11_1_REAL_VALIDATION_CLOSED`
Date: 2026-09-29
Scope: docs-only architecture-review verdict over the R1/R2 real-provider validation evidence. No product code, test, or Harness change is part of this conclusion; no validation was re-executed; no real provider was called while writing it.

## Inputs reviewed (evidence basis, not regenerated)

- Tested executable: `1afd6f0d5f8adda709709f645918229f59dd575a` (last commit touching `packages/`; zero `packages/` drift at review time).
- Remote accepted baseline at review time: `95a4e2347b8222e5e8d20b253bd8333a61c963a1`.
- Harness read-only baseline: `ddefc45fbc7f8e46dd73185e68295696d1297887` (tracked diff zero).
- R1 report: `docs/report/DSH_IDEA_T11_1_REAL_SEMANTIC_VALIDATION_R1.md` (`REAL_SEMANTIC_VALIDATION_PARTIAL`, 2026-09-28).
- R2 report: `docs/report/DSH_IDEA_T11_1_REAL_SEMANTIC_VALIDATION_R2.md` (`REAL_SEMANTIC_VALIDATION_R2_PASS`, 2026-09-29).
- R2 protocol freeze: `docs/architectue/DSH_IDEA_T11_1_REAL_SEMANTIC_VALIDATION_R2_PROTOCOL_FREEZE.md`.

## R1 verdict

- `R1 = PARTIAL_EVIDENCE_ACCEPTED`
- `R1_CALL_LIMIT = VIOLATED (16/12)`

R1's positive evidence for scenario A (lexical-empty corpus → real llm-selector rank-1 recall of the pinned target through the real product chain) is accepted as valid narrower evidence. The acceptance is narrow by construction: scenarios B and C were never executed, and the 16-request ledger exceeded the ≤12 hard cap (overrun caused by the Harness agent loop's per-message cost, not by retries). The two non-defect findings recorded in R1 §11 (agent-loop cost model; agent-context vs Judge redundancy) are acknowledged by this review and were constructively addressed in R2's design.

## R2 verdict

- `R2 = REAL_SEMANTIC_VALIDATION_R2_ACCEPTED`
- `REAL_PROVIDER_VALIDATION = PASS`
- `SEMANTIC_RECALL_A_B_C = PASS`
- `REAL_JUDGE_VALIDATION = PASS`
- `SYNTHETIC_EVENT_UI_INTEGRATION = PASS`
- `HARD_REQUEST_CAP = PASS (10/12)`

Basis, all from real-provider evidence documented in the R2 report: scenario A (lexical miss → semantic hit), scenario B (hybrid lexical+semantic agreement), and scenario C (unrelated → empty recall, no Judge input) each ran against the real `deepseek-official / deepseek-flash` route through the existing Host/Remote path; the real Judge returned independent positive verdicts (`RESTORES_FORGOTTEN_DIRECTION`, `ADDS_MISSING_OPTION`) and the negative-path expectation held in C; the positive delivery chain (Judge `SURFACE` → Final Delivery Gate → durable `CLAIMED` → visible UI strip → `ALREADY_CONSUMED`) was demonstrated with a 10-attempted / 10-delivered / 0-denied ledger under the hard cap, with the guard proven offline (13th request denied pre-dispatch) and armed in-process.

## Preserved evidence boundary (explicit)

R2-B is **`real-provider + synthetic-event UI integration`**, not an end-to-end acceptance of a complete, authentic Agent Turn. The `user/message` → agent loop → `turn/end completed` path was deliberately never exercised in R2 (no `user/message` was ever sent), the Assistant reply and event feed were synthetic fixtures, and the UI strip was rendered in a jsdom harness rather than the production web client. A full interactive real-agent product smoke test remains a separate, separately budgeted validation and is **not** claimed here. Likewise R2-A is a direct Host/Remote validation, not an interactive product smoke test.

## Defect and disposition

- `PRODUCT_DEFECT = NONE ESTABLISHED`
- `EXECUTABLE_REPAIR_REQUIRED = NO`
- `T11_1_REAL_VALIDATION = CLOSED`

No behavioral contract violation was reproducibly evidenced in either report; R1's Judge rejection and R2's superseded validation runs are documented validation-environment events, not product defects. The tested executable `1afd6f0` stands without repair. T12 is not started by this closure.

Disposition: the R1 and R2 reports and this review are committed docs-only, on top of the accepted baseline, without disturbing the pre-existing user docs reorganization (reports relocated under `docs/report/`, architecture-freeze and implement-instruction docs), which remains uncommitted user drift outside this closure's scope.
