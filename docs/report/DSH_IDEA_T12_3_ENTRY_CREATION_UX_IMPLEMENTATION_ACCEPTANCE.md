# DSH Idea T12.3 — Entry & Creation UX Implementation Acceptance Report

- Outcome: **`T12_3_ENTRY_CREATION_UX_IMPLEMENTED — ALL_GATES_GREEN`**
- Date: 2026-09-30
- Baseline: origin/main `9b2440ac94fd2cbaf843ce629c3ee5a7238dbc33` (T12.2 CLOSED at `a0d10755524a06e27772613f8713a2d60fc15653`); Harness `ddefc45fbc7f8e46dd73185e68295696d1297887` read-only, tracked diff zero throughout.
- Architecture authority: `docs/architectue/DSH_IDEA_T12_3_ENTRY_CREATION_UX_ARCHITECTURE_FREEZE.md`.
- **Tested executable (this task, after the second architecture-review repair): commit `61e1eede676829e6fd07c5918ed84b64f7f0ad93`**. Commit lineage: initial implementation `95d228bd1aa4d153ff99189822fbb8a6c61b2e03` → first repair `f16df40…` (R1–R3, below) → second repair `61e1eed…` (R4 footer layout, below). Every gate in §2 was re-run to green against the repaired code state, with zero executable drift after the final Canonical Full (lib mtime unchanged post-Full).

## 1. What was implemented

**Conversation `+ → Idea` panel (information architecture, `IdeaSearchCard.tsx`)**

- Title 「搜索 Idea」 → **「Idea」**; the search placeholder is unchanged (「搜索保存的 Idea…」).
- List-mode footer: LEFT secondary 「＋ 记录新想法」 opens the capture subview; RIGHT primary 「添加到对话」 is the previous Add (reference-attach semantics, disabled-until-selection, close-on-success — all unchanged). The layout is phase-scoped CSS (T12.3 R4): `-list` spreads the two actions to opposite edges (`space-between`), while the capture footer keeps both actions right-aligned (`-capture`).
- The T12.2 quick-capture form above the search input is gone; 「＋ 记录新想法」 switches the SAME panel to the **capture subview**: header becomes 「← 记录新想法」 (back), the note textarea, and right-aligned 「AI 整理」 / 「直接保存」. Search input, results, and Add are not rendered in the subview. No extra big modal is introduced by the panel itself.
- **Back** (←) returns to list mode via the new `IdeaQuickCaptureSurface.hide()` — it preserves the search query (which lives on the search surface) and the unsaved capture draft; re-entering 记录新想法 restores both.
- Full panel close (× / Escape / outside) keeps the phase-aware R7–R10 semantics: idle drafts clear, prepares cancel, commits and unresolved `pendingUnclear` recovery are never dropped (regression-tested).

**Settings → Ideas creation entry (`IdeaSection.tsx` + root surfaces)**

- A first-class 「＋ 新建 Idea」 action beside the library search box, visible in Current, Archived, and search states.
- It opens the in-section create subview (「← 新建 Idea」 back action, back preserves the draft within the mount) backed by a **root-scoped** `IdeaSaveSurface({ kind: 'default' })` and `IdeaQuickCaptureSurface({ kind: 'default' })` — the surfaces outlive the section's React mount, so drafts and the same-ID recovery authority survive settings navigation and unmount/remount (regression-tested).
- The subview shares the conversation pipeline end-to-end: zero-LLM direct save with auto-commit, explicit AI organize (editable proposal rendered in the subview through the SHARED `IDEA_FORM_FIELDS` descriptor — ALL SEVEN fields editable, semantics identical to the IdeaSaveDialog — user-confirmed 保存 → the SAME preparation id commit), busy/unclear/definite failure handling, R7–R10 lifecycle.
- **Success UX** (both paths, T12.3 R3): the transition is a ROOT-SCOPED subscription on the library save surface's success toast sequence → `readSurface.refreshToCurrent()` (leave the create subview, switch to Current, clear the library search query, force-reload the Current list — never optimistic). It fires regardless of whether the section is mounted; the new Idea appears immediately.
- **Failure UX**: the text/edit content is preserved and the subview stays; no optimistic insert.

**Host (`QuickCaptureRouteContext`)**

- `prepareQuickCapture` now takes the discriminated route context `{ kind: 'session'; sessionId } | { kind: 'default' }` (wire type `IdeaQuickCaptureRoute`). AI model resolution: session → the existing Session-projected route with Agent-Default fallback; **default → `agentDefaultModel.currentSelection()` directly** (provider/model/reasoningEffort complete). `GenerateOptions.sessionId` is present ONLY for the session context — never fabricated for `default`. Both flow through the same `ctx.llm.stream()`, exactly one call, the existing Quick Capture prompt/strict parser, and the `model-unavailable`/`model-failed` taxonomy. Direct save reads no model in either context.
- The shared Preparation Registry, Commit Machine, `createDirect`, same-ID unclear recovery, and R1–R10 lifecycle are reused unchanged — no second creation pipeline exists.

## 2. Verification (binding order)

1. **Focused Tests** — new specs: `tests/quick-capture-panel.spec.tsx` (conversation IA, 5) + `tests/library-create.spec.tsx` (settings creation, 6) + 6 default-route Host cases in `tests/quick-capture.spec.ts`; updated: quick-capture-client/card specs to the route-context constructors and outcome types. Together with the related suites: **7 files / 111 tests green**, then **12 files / 201 tests green**.
   Coverage includes every item in the task list: panel title 「Idea」; footer left/right; capture hides search/results/Add; back restores list; search query preserved; capture draft preserved on back; full safe close clears idle draft; pendingUnclear survives back/close/reopen; Add-reference no regression; New Idea visible in Current/Archived/search; direct success → Current + cleared search + reloaded list; AI proposal editable → confirm; failure preserves text; settings unmount/remount recovery; session route unchanged; default direct = 0 LLM; default AI = exactly 1 FakeLlm call via `currentSelection()`; no sessionId in GenerateOptions; reasoningEffort preserved; invalid input rejected before LLM; empty provenance; same Preparation/Commit machine; idempotency on both routes.
2. **T9/T10/T11/T12 regression** — full package suite after threading the library creation faces into the five pre-existing section specs (client-continue/evolution/read/lifecycle/t9r2): **54 files / 837 tests, all green**. Copy-driven updates: 「Idea」 title and 「添加到对话」 in the affected assertions; descriptor-list additions from the new remote method.
3. **Architecture / Scope Audit** — 26 files changed (24 modified + 2 new test files), +1206/−176, all inside `packages/dsh-idea/` plus the freeze doc; no Harness/migration/second-storage/T10/T11/reference/lifecycle changes.
4. **Static Gates** — typert regenerated (route-context wire shape), `tsc --noEmit` zero errors, host build + client build successful.
5. **Canonical Full (exactly one fresh run)** — `vitest run --no-file-parallelism`: **54 files / 837 tests, all green**, executed after the final build with **zero executable drift** after it (lib artifacts unchanged post-Full).

## 3. Change list

Modified (24): `src/client/{IdeaSearchCard,IdeaSection,index,locales,quick-capture-state,read-state,slots,state,styles}.tsx/ts`, `src/preparation/{service,types}.ts`, `src/remote-host/{service,types}.ts`, and 11 spec files (`client-continue/evolution/lifecycle/read/related/search/t9r2/client.spec.*`, `quick-capture-{card,client,spec}`).
New (2): `tests/library-create.spec.tsx`, `tests/quick-capture-panel.spec.tsx`.
Docs: the freeze doc + this report. Build artifacts (`lib/`) remain gitignored.

## 4. Architecture Review Repair (R1–R3, 2026-10-01)

The review accepted the Host route context, Conversation IA, and the shared Creation Domain, and required R1–R3:

- **R1 — full seven-field proposal preview**: the dialog's field descriptors are exported as `IDEA_FORM_FIELDS` and the Settings proposal editor renders ALL seven fields (title/core/motivation/currentConclusion/possibleValue/useWhen/openQuestions) bound to `librarySave.editDraft` — no third field-definition copy. Regression: the AI output's seven fields are all visible and editable; editing motivation lands in the commit; unmodified fields round-trip byte-identically; `requiredPresent` still gates title+core only (D1).
- **R2 — phase-aware Back**: `hide()` now cancels an in-flight prepare (AI or direct) with the note preserved — a Back can never be followed by a late proposal preview (regression: gated prepare → Back → completion → no late modal, conversation AND settings). Back while an AI proposal preview is open safely cancels the proposal (zero durable writes) and returns to the Library. Back during an in-flight commit only hides the form — the note and the unresolved recovery survive (R7–R10 preserved, regression-tested).
- **R3 — root-scoped success transition**: the mount-dependent toastSeq effect is REMOVED. The authoritative transition is a root-scoped subscription on the library save surface's success toast sequence → `readSurface.refreshToCurrent()` (switch Current, clear search, force reload). It fires for BOTH creation paths (direct auto-commit and confirmed AI proposal) regardless of whether the section is mounted, with no double refresh (single mechanism). Regression: commit starts → section unmounts → commit succeeds → remount shows Current/search-cleared/fresh-reloaded.

Repair verification (same binding order): Focused (all quick-capture/panel/library/registry/preparation/remote/search/related/client/schema suites) → full regression **54 files / 843 tests, all green** → scope audit (6 files, all inside `packages/dsh-idea/`) → static gates (typecheck, host build, client build) → **exactly one fresh Canonical Full (`--no-file-parallelism`): 54 / 843 all green**, zero executable drift after it.

## 4a. Second Architecture Review Repair (R4, 2026-10-01)

The second review required only the panel footer layout (R4):

- **R4 — phase-scoped footer layout**: the frozen list footer spreads its secondary (记录新想法) and primary (添加到对话) actions to opposite edges (`justify-content: space-between` via the new `dsh-idea-search-foot-list` modifier), while the capture footer keeps both actions together on the right (`dsh-idea-search-foot-capture` with `flex-end`). The base `.dsh-idea-search-foot` no longer carries its own justify-content, so the two phases cannot regress into each other. Regression: the footer carries the phase modifier in each mode, and the injected stylesheet provably implements `space-between` (list) and `flex-end` (capture) — class + CSS-rule assertions, not text-only.

Second-repair verification (same binding order): Focused (panel spec 7 + all related suites) → full regression **54 files / 844 tests, all green** → scope audit (3 files, all inside `packages/dsh-idea/`) → static gates (typecheck, host build, client build) → **exactly one fresh Canonical Full (`--no-file-parallelism`): 54 / 844 all green**, zero executable drift after it.

## 4b. Git state

- Implementation commit: `f16df40e7c0c526aba8729cd331ee772adb87851` (= Tested SHA; docs-only report commit follows). Original implementation commit: `95d228bd1aa4d153ff99189822fbb8a6c61b2e03`.
- Harness tracked diff: 0. User docs drift: 17 items preserved. No reset/clean/git add .; no real Provider; T13 not started.
