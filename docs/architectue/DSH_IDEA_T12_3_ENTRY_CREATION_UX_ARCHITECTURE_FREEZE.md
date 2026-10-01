# DSH Idea T12.3 — Idea Entry & Creation UX Architecture Freeze

Status: `T12_3_ENTRY_CREATION_UX_ARCHITECTURE_FROZEN`
Date: 2026-09-30
Baseline: dsh-idea `9b2440ac94fd2cbaf843ce629c3ee5a7238dbc33`; accepted executable lineage `a0d1075…`; Harness `ddefc45…` read-only.

## Frozen decisions

1. **One creation pipeline, two entries.** The conversation `+ → Idea` panel and the Settings → Ideas library share the SAME Quick Capture preparation, Preparation Registry, Commit Machine, `createDirect`, same-ID unclear recovery, and the full R1–R10 lifecycle. No second creation business logic may exist.
2. **Explicit route context (no fake sessions).** The Quick Capture preparation takes a discriminated route context:
   `type QuickCaptureRouteContext = { kind: 'session'; sessionId: string } | { kind: 'default' }`.
   No empty strings, no fake session ids, no special marker ids.
3. **AI model resolution per context.** `session` → the existing Session projected route with Agent-Default fallback (`resolveModelRoute`). `default` → `agentDefaultModel.currentSelection()` directly. Both flow through the same `ctx.llm.stream()`, exactly one call, the existing Quick Capture prompt/strict parser, plugin-authored message source, and the existing `model-unavailable` / `model-failed` taxonomy. `GenerateOptions.sessionId` is provided ONLY for the session context — never fabricated for `default`. Direct save reads no model in either context (zero LLM).
4. **Conversation panel information architecture.** The panel (component name `IdeaSearchCard` retained — renaming would be churn without semantic value) becomes a two-subview panel:
   - **List mode**: title 「Idea」, the search input (placeholder unchanged 「搜索保存的 Idea…」), the ranked rows, and a footer with a LEFT secondary action 「＋ 记录新想法」 and a RIGHT primary action 「添加到对话」 (the previous Add). Search, selection, reference-attach, and Add semantics are unchanged.
   - **Capture subview** (entered by 「＋ 记录新想法」, in-panel switch, never a big modal): header becomes 「← 记录新想法」 (back), the note textarea, and right-aligned 「AI 整理」 / 「直接保存」. Search/results/Add are not rendered in this subview.
5. **Panel lifecycle.** Back (list ← capture) preserves the search query and the unsaved capture text (a `hide()` distinct from the panel close). A full panel close keeps the established phase-aware semantics: idle drafts may clear, prepares cancel, commits and unresolved `pendingUnclear` recovery survive strictly per R7–R10 — an unresolved Preparation ID can never be dropped by a close.
6. **Settings → Ideas creation entry.** A first-class 「＋ 新建 Idea」 action beside the library search box, visible in Current, Archived, and search states. It switches the section to an internal create subview (「← 新建 Idea」) backed by the SAME shared surfaces with route context `{ kind: 'default' }`. No current conversation, no Workspace, no fabricated Session, no fabricated Source Discussion is required or created.
7. **Settings success UX.** Direct-save success or a confirmed AI proposal leaves the create subview, switches to Current, clears the library search query, and force-reloads the Current list (never optimistic). A failure keeps the text and stays in the create view. An AI proposal is always user-confirmed before commit (never auto-committed).
8. **Settings lifecycle.** The Settings save/quick surfaces are root-scoped (created once at plugin UI registration), so React unmount/remount of the settings section never loses a draft, a commit in flight, or the same-ID recovery authority. Leaving the section may leave a safe idle draft in place; the recovery authority is untouchable.
9. **Minimal client refactor (option B).** `IdeaSaveSurface` generalizes to an explicit route context instead of extracting a second helper: its quick-commit/preview machinery is already session-independent; only `prepareFromMessage` needs the session id, and that path is guarded to the `session` kind. The conversation mounts it per-Session with `{ kind: 'session', sessionId }`; Settings mounts one root instance with `{ kind: 'default' }`. If implementation reveals this requires re-architecting the whole Save Idea flow — STOP and report instead.
10. **Copy.** zh: `search.title` = 「Idea」, `search.add` = 「添加到对话」, `quick.back` = 「← 记录新想法」, `library.newIdea` = 「＋ 新建 Idea」, `library.createBack` = 「← 新建 Idea」; en mirrors. The search placeholder stays 「搜索保存的 Idea…」.

## Verification plan (binding order)

Implementation → Focused Tests (conversation UI, settings UI, host routes) → T9/T10/T11/T12 regression → Architecture/Scope Audit → Static Gates → **exactly one** fresh dsh-idea Canonical Full (`vitest run --no-file-parallelism`) → acceptance report. No real Provider, no Harness modification, no migration, no second storage, no T10/T11/reference/lifecycle semantic changes, no T13.
