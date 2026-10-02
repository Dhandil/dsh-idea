# DSH Idea T12.3 — Entry & Creation UX Final Architecture Review

Status: **`T12_3_ENTRY_CREATION_UX_ARCHITECTURE_ACCEPTED` / `T12_3 = CLOSED`**
Date: 2026-10-01
Scope: docs-only final acceptance closure. No product code, test, Harness, configuration, or build-artifact change is part of this closure; no test, Canonical Full, or real Provider call was re-run while writing it.

## Accepted executable

- **Accepted executable = `61e1eede676829e6fd07c5918ed84b64f7f0ad93`** (the second-repair commit, whose built `lib/` state — host build + client bundle 10:50 — is unchanged since the final Canonical Full: zero post-Full executable drift).
- Current closure baseline: `8fff86d1c1a754f04c77739644ee6093f5e0c4ba` (= `origin/main` at closure), containing the implementation, both repair commits, the pinned acceptance report, and this review.

## Repair lineage (R1–R4, all CLOSED)

| Round | Commit | Items |
|---|---|---|
| Initial implementation | `95d228bd1aa4d153ff99189822fbb8a6c61b2e03` | Route context, Conversation IA, Settings creation, shared pipeline + freeze doc |
| Repair 1 | `f16df40e7c0c526aba8729cd331ee772adb87851` | R1 full seven-field proposal preview (shared `IDEA_FORM_FIELDS`); R2 phase-aware Back (prepare-cancel, proposal safe-cancel, commit-preserve); R3 root-scoped success transition |
| Repair 2 | `61e1eede676829e6fd07c5918ed84b64f7f0ad93` | R4 phase-scoped footer layout (list `space-between`, capture `flex-end`) + style regression |

Each round's evidence and per-item regressions are recorded in `docs/report/DSH_IDEA_T12_3_ENTRY_CREATION_UX_IMPLEMENTATION_ACCEPTANCE.md` (§2, §4, §4a, §4b). Historical records are preserved as written; only this review establishes the final authoritative state.

## Final verification state (authoritative)

- **Final Canonical Full = 54 files / 844 tests PASS**, run exactly once in its final form with **`vitest run --no-file-parallelism`** (a standard vitest execution parameter adopted to eliminate machine-load timing flakes in pre-existing embedding-mode timing suites; code and tests unchanged), after the final build.
- **Zero post-Full executable drift**: the built `lib/` artifacts' timestamps are unchanged since the final build that preceded the final Canonical Full; the committed code state (`61e1eed`) is exactly what the gates verified.
- **Real Provider calls = 0** across the whole T12.3 lifecycle (all suites run on scripted offline fakes).
- **Harness unchanged**: `D:\Harness\deepseek-harness` at `ddefc45fbc7f8e46dd73185e68295696d1297887`, tracked diff zero, read-only throughout.
- **User data untouched**: the user's pre-existing docs drift (17 items) remains preserved, uncommitted, outside this closure.

## Frozen decisions honored (D1/D2/D3 + T12.2 R1–R10)

The shared creation pipeline is exactly one pipeline: Quick Capture preparation → Preparation Registry → Commit Machine → `IdeaService.createDirect` (empty provenance) → same-ID unclear recovery → R1–R10 lifecycle semantics. No second creation business logic, no migration, no second storage, no T10/T11/reference/lifecycle semantic changes.

## Final UX (authoritative)

**Conversation `+ → Idea` panel:**

- Panel title = **「Idea」**; search placeholder unchanged (「搜索保存的 Idea…」).
- List footer LEFT = **「＋ 记录新想法」** (secondary, opens the in-panel capture subview); list footer RIGHT = **「添加到对话」** (primary, the reference-attach action). Layout is phase-scoped CSS: `space-between` in list mode.
- Capture subview: 「← 记录新想法」 back (preserves the search query and the unsaved draft), capture **actions remain right-aligned** (AI 整理 / 直接保存).
- Full panel close keeps the phase-aware R7–R10 semantics — an unresolved preparation or recovery authority is never dropped by a close.

**Settings → Ideas:**

- **「＋ 新建 Idea」** first-class creation action, visible in Current, Archived, and search states, opening the in-section create subview (「← 新建 Idea」).
- AI organize produces a **full seven-field editable proposal preview** (title/core/motivation/currentConclusion/possibleValue/useWhen/openQuestions through the shared `IDEA_FORM_FIELDS` descriptor) — user-confirmed before the commit, never auto-committed.
- **Session-independent default-model routing**: the `default` route resolves `agentDefaultModel.currentSelection()` directly; `GenerateOptions.sessionId` exists only for a `session` route and is never fabricated.

**QuickCaptureRouteContext** = `{ kind: 'session'; sessionId } | { kind: 'default' }` — a discriminated union; **no fake Session** anywhere; both entries share the **Preparation Registry / Commit Machine / `createDirect`** with the T12.2 **R1–R10 lifecycle preserved**.

## Disposition

- `T12_3_ENTRY_CREATION_UX_ARCHITECTURE_ACCEPTED`
- `R1–R4 = CLOSED`
- `T12_3 = CLOSED`
- `T13 = NOT_STARTED`

This closure is committed docs-only on top of `8fff86d`, without disturbing the user's pre-existing docs reorganization. Nothing beyond this review is modified.
