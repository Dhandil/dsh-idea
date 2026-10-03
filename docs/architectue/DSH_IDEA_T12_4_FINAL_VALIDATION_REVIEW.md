# DSH Idea T12.4 — Real Browser / Real Provider Final Validation Review

Status: **`T12_4_REAL_BROWSER_PROVIDER_USER_JOURNEY_ACCEPTED` / `T12_4 = CLOSED`**
Date: 2026-10-02
Scope: docs-only final acceptance closure. No product code, test, Harness, configuration, or build-artifact change is part of this closure; no test, Canonical Full, or real Provider call was re-run while writing it.

## Commit lineage

- **Accepted executable = `61e1eede676829e6fd07c5918ed84b64f7f0ad93`** (T12.3 CLOSED)
- **Validation baseline = `65d5ac184623a3329cd65b723e1a846020cc8a64`** (= `origin/main` at validation)
- **Protocol Commit = `77c14b4a6db9198a2977f125e93e989d880b6307`**
- **Validation Report Commit = `492637ba887a9020711ad35617d24751c3632125`**
- **Harness = `ddefc45fbc7f8e46dd73185e68295696d1297887`**, read-only, tracked diff zero throughout

## Authoritative evidence

| Evidence item | Status |
|---|---|
| Real Chromium / localhost Harness UI | **PASS** |
| Conversation panel final UX (title=Idea, footer layout, capture subview, back/draft/close) | **PASS** |
| Conversation Direct Save (empty provenance) | **PASS / Provider Δ0** |
| Conversation AI Organize (seven fields, browser edit, same-id commit) | **PASS / Provider Δ1** |
| Settings creation entry (Current/Archived/search visibility) | **PASS** |
| Settings Direct Save (auto-exit, Current + clear search + fresh reload) | **PASS / Provider Δ0** |
| Settings AI Organize (seven fields, browser edit, fresh reload, edit marker persisted) | **PASS / Provider Δ1** |
| Existing Idea → 添加到对话 (canonical chip, composer preserved, no send) | **PASS / Provider Δ0** |
| Persistence after browser reload | **PASS** |
| Empty Quick Capture provenance (sourceDiscussions=[], sourceDiscussionIds=[]) | **PASS** |
| Seven-field Settings AI proposal | **PASS** |
| Final provider ledger | **2 attempted / 2 delivered / 0 failed / 0 denied** |
| DSH_IDEA_RELEVANT_BROWSER_ERRORS | **0** |
| Harness tracked diff | **0** |
| Executable drift (post-Full) | **0** |
| Real ~/.dsh unchanged (29,111-entry manifest byte-identical; settings SHA-256 unchanged) | **VERIFIED** |
| PRODUCT_DEFECT | **NONE_ESTABLISHED** |
| EXECUTABLE_REPAIR_REQUIRED | **NO** |

## Evidence clarification / protocol deviation

1. **Screenshot / raw browser evidence**: all screenshots and raw browser evidence were saved to the repository-external directory `D:\Harness\t124-evidence\` and are NOT committed. The architecture review's acceptance of the visual evidence is based on the measurements and observations recorded in `docs/report/DSH_IDEA_T12_4_REAL_BROWSER_PROVIDER_USER_JOURNEY.md`, not on direct inspection of the screenshot files.
2. **Console/page-error evidence mechanism**: the In-app Browser (IAB) facade exposes no native console stream. Console and page-error evidence was collected via an in-page JavaScript collector (window error + unhandledrejection + console.error wrapper) installed immediately after page load, supplemented by UI-visible error surfaces and Host logs. This is equivalent but not identical to a native console capture; the limitation is disclosed.
3. **Hard cap not triggered**: the hard cap = 4 was armed (pre-dispatch guard verified by offline self-test), but the normal successful path used only 2 provider requests. No cap denial was actually triggered during the run. The guard's denial behavior was verified offline in the self-test, not against a real 5th request — this must not be described as "the 5th real request denial has been validated in this round".
4. **Marker / title convention**: all four Quick Capture runs used the unique marker `DSH_IDEA_T12_4_20261002_114239` in their raw test input. The two Direct-save Ideas retain the marker in their derived titles (deterministic title = first non-empty line of the note). The two AI-organized Ideas have final titles produced by the real model — the marker does not appear in those titles themselves. These AI Ideas are identified by their independent creation records, their persisted content (including the browser-edit markers), and their read-back verification. This is a marker-convention clarification within the protocol, not a product defect. The Protocol Freeze's scenario descriptions are understood as specifying the test-input convention, not an invariant about persisted title content.
5. **§4b Tested SHA clarification**: `a0d1075…` belongs to the T12.2 executable lineage (T12.2 CLOSED); the T12.3 Accepted Executable is `61e1eed…` and the T12.3 docs closure is `65d5ac1…`. The Validation Report header has been corrected accordingly.

## Disposition

- `T12_4_REAL_BROWSER_PROVIDER_USER_JOURNEY_ACCEPTED`
- `PRODUCT_DEFECT = NONE_ESTABLISHED`
- `EXECUTABLE_REPAIR_REQUIRED = NO`
- `T12_4 = CLOSED`
- `T13 = NOT_STARTED`

This closure is committed docs-only on top of `492637b`, without disturbing the user's pre-existing docs reorganization. Nothing beyond this review is modified.
