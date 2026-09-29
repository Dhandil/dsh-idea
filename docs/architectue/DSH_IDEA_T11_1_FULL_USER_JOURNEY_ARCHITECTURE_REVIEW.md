# DSH Idea T11.1 Full User Journey — Architecture Review Conclusion

Status: `T11_1_FULL_USER_JOURNEY = VERIFIED` / `T11_1 = CLOSED` / `T12 = NOT_STARTED`
Date: 2026-09-29
Scope: docs-only architecture-review verdict over the complete R1–R4 evidence chain. No product code, test, or Harness change is part of this conclusion; no validation was re-executed; no real provider was called while writing it.

## Inputs reviewed (evidence basis, not regenerated)

- Tested executable: `1afd6f0d5f8adda709709f645918229f59dd575a` (last commit touching `packages/`; zero `packages/` drift at review time).
- Remote accepted baseline at review time: `6fd61b07d2180c36ec9cf0343829cd7b6d4f71c8`.
- Harness read-only baseline: `ddefc45fbc7f8e46dd73185e68295696d1297887` (tracked diff zero).
- R1: `docs/report/DSH_IDEA_T11_1_REAL_SEMANTIC_VALIDATION_R1.md` (`REAL_SEMANTIC_VALIDATION_PARTIAL`).
- R2: `docs/report/DSH_IDEA_T11_1_REAL_SEMANTIC_VALIDATION_R2.md` (`REAL_SEMANTIC_VALIDATION_R2_PASS`).
- R3: `docs/report/DSH_IDEA_T11_1_REAL_USER_JOURNEY_R3.md` (real journey, budget-capped).
- R4: `docs/report/DSH_IDEA_T11_1_COMPLETE_USER_JOURNEY_R4.md` (complete end-to-end journey).
- Prior review: `docs/architectue/DSH_IDEA_T11_1_REAL_VALIDATION_ARCHITECTURE_REVIEW.md` (`T11_1_REAL_VALIDATION_CLOSED`).

## R3 verdict

- `R3 = REAL_USER_JOURNEY_EXECUTED_BUDGET_CAPPED`
- `R3_REQUESTS = 20/20`
- `R3_REQUEST_21 = DENIED_PRE_DISPATCH`
- `R3_SURFACE = NOT_REACHED`
- `R3_PRODUCT_DEFECT = NONE_ESTABLISHED`

R3's value is two-fold and is accepted exactly as reported: it proved the journey harness itself is real (browser-driven Web UI, real user message, a genuine 20-step DeepSeek Agent Turn), and it proved the hard request budget's live enforcement (the 21st request was denied before dispatch and surfaced fail-closed as a TRANSPORT turn failure). Because the Agent Loop consumed the entire 20-request budget on a single message, the turn never reached `turn/end completed` and the resurfacing chain never fired — **R3_SURFACE = NOT_REACHED stands; R3 is not rewritten as a PASS of the surface path.** No product defect was established; the cap-deny behavior was correct product-adjacent rig behavior and the turn failure was the guard working as designed.

## R4 verdict

- `R4 = END_TO_END_POSITIVE_EVIDENCE_ACCEPTED`
- `REAL_UI_SAVE = PASS`
- `IDEA_PERSISTENCE = PASS`
- `CROSS_SESSION_RECALL = PASS`
- `AUTHENTIC_AGENT_TURN = PASS`
- `REAL_PROVIDER_SELECTOR_JUDGE = PASS`
- `POSITIVE_UI_DELIVERY = PASS`
- `VIEW_REFERENCE_DISMISS = PASS`
- `DURABLE_BUDGET = PASS`
- `R4_PROVIDER_REQUESTS = 23/30`

Basis, all from the R4 report's real evidence: the only Idea in the isolated store was saved through the real 保存为 Idea UI flow (extraction stream → dialog → save; `idea_01603cce…` active at persisted version `idea_ver_25c65ca6…`); a new conversation's genuine Agent Turn completed normally and the full chain ran with real DeepSeek calls (Selector + Judge, ledger-identified), the Judge returned SURFACE twice (C2, C4) and a genuine negative once (C3); the proactive reminder appeared in the real Web UI twice; 查看 / 引用 / 忽略 were all exercised as real clicks with the documented state changes; and the durable one-surface budget was consumed exactly once, exactly on the two positively-surfaced conversations (on-disk `resurfacing_budgets` records agree with the API reads). 23 real provider requests under the independent hard cap of 30, with pre-dispatch enforcement armed throughout and never needed.

## Preserved evidence boundaries (explicit)

1. **R3 is not a surface PASS.** R3's resurfacing chain never fired because the Agent Loop exhausted the request budget on a single message; the 21st request was denied pre-dispatch. This stays recorded as `SURFACE_NOT_REACHED (BUDGET_CAPPED)`.
2. **R4 is fully real on every layer it claims**: real UI, real UI save, a real completed Agent Turn, real DeepSeek provider Selector/Judge, a real proactive reminder, and real user operations (查看/引用/忽略). It is not a synthetic-event or direct-API construction.
3. **C3's negative Judge decision is real; the inferred reason is not.** The Judge did return a negative (silence, no strip, no claim) after the agent self-recovered the idea's content from its own home transcripts. The exact reason string was not captured (fail-closed silence surfaces nothing); `REDUNDANT_WITH_CONTEXT` is recorded in the report only as an inference and must not be quoted as the raw returned value.
4. **R4 does not by itself prove the zero-lexical-overlap recall gain.** In R4 the trigger wording shared surface terms with the saved Idea, so the lexical branch was not demonstrably empty; the lexical-miss → semantic-recall value proposition remains evidenced by R1 (scenario A2) and R2 (scenario A).
5. **All historical conclusions stand unoverwritten**: R1 `PARTIAL`, R2 `PASS` (with its synthetic-event integration boundary), R3 capped, R4 end-to-end positive — each report remains the authority for its own round.

## Defect and disposition

- `PRODUCT_DEFECT = NONE_ESTABLISHED`
- `EXECUTABLE_REPAIR_REQUIRED = NO`
- `T11_1_FULL_USER_JOURNEY = VERIFIED`
- `T11_1 = CLOSED`
- `T12 = NOT_STARTED`

No behavioral contract violation was reproducibly evidenced across R1–R4; every observed anomaly traces to validation-environment causes (agent-loop cost model, agent home-awareness sandbox scoping) and is documented as findings for later review, not as product defects. The tested executable `1afd6f0` stands without repair.

Disposition: the R3 and R4 reports and this review are committed docs-only, on top of the accepted baseline, without disturbing the pre-existing user docs reorganization (reports relocated under `docs/report/`, architecture-freeze and implement-instruction docs), which remains uncommitted user drift outside this closure's scope.
