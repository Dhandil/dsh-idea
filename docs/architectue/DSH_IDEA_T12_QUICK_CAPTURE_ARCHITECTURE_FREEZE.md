# DSH Idea T12 Quick Capture — Architecture Freeze

Status: `T12_QUICK_CAPTURE_ARCHITECTURE_FROZEN`
Date: 2026-09-29
Input: `DSH_IDEA_T12_1_QUICK_CAPTURE_PREFLIGHT.md` (accepted) + the three frozen decisions D1/D2/D3 below.
Scope: Quick Capture (「＋ 记录新想法」 inside the existing Idea search panel) — two save modes, one idempotent commit machine, zero fabrication.

## Frozen decisions

- **D1 — motivation may be empty.** `ideaDraftSchema.motivation` relaxes to optional (the durable twin already was optional). Downstream edit (`manualEdit`) and evolution (`commitEvolution`) must accept an empty motivation unchanged. The original chat-extraction flow keeps its own mandatory validation: `prepareFromMessage` rejects a model proposal whose motivation is empty at the preparation boundary (the schema alone no longer enforces it). Client `requiredPresent` relaxes to title+core for every save surface (chat modal, manual edit, evolution commit, quick capture).
- **D2 — the Preparation Registry is widened, not bypassed.** `PreparedIdeaSource` becomes a discriminated origin: `conversation` (existing captured discussion + model route) or `quick-capture` (no source discussion; optional model route). `IdeaService.createDirect(draft)` is the one new domain write: `sourceDiscussions=[]`, `versions[0].sourceDiscussionIds=[]`, `reason='initial-save'`, its evolution event, same collision guard. The remote commit machine (`idea.create`) branches on the origin kind; a bare un-idempoted `createQuick` is rejected.
- **D3 — both modes submit through the unified Preparation ID.** Direct save (deterministic title, verbatim core, empty motivation, **zero LLM**) and AI organize (explicit user action; exactly one `ctx.llm.stream()` call on the current Session's route; strict `parseIdeaDraftOutput`; editable preview) both register a preparation and commit through the same `idea.create` path. A create whose outcome is unclear is retried only with the **same** preparation id (Host idempotency dedups); a client never mints a new preparation to "fix" an unclear response.

## Frozen behavior contract

1. Entry: a 「＋ 记录新想法」 control above the search input inside the existing `idea-search` card. All existing search, selection, Add/attach, close, and Escape semantics are untouched; the card's close stays zero-side-effect (an open quick-capture draft is discarded with it).
2. Direct save: no model call anywhere in the chain; Host validates the text (non-empty, bounded), derives the title deterministically (first non-empty line, title-capped), stores the full original text as `core`, `motivation: ''`.
3. AI organize: never implicit; one provider call using the calling conversation's model route (`source.kind: 'plugin'`); on failure the user's text is preserved in the form and direct save remains available; while a prepare is in flight the mode buttons are disabled and re-entry is a no-op.
4. No fabrication ever: no synthetic assistant message, no synthetic `capturedContext`, no synthetic Workspace binding. Quick-capture Ideas persist honestly with empty provenance.
5. Chat messaging is untouched: quick capture sends no chat message, never clears the composer draft, never touches the T10 resurfacing budget (a quick-captured Idea participates in future resurfacing like any other Idea — empty provenance means no conversation-exclusion).
6. The existing assistant-message 保存为 Idea flow keeps every current semantic, including its stricter model-output validation and the source-snapshot provenance.
7. Wire additions (new remote methods on the existing `idea` namespace only): `idea.prepareQuickCapture({ sessionId, text, mode: 'direct' | 'ai' })` → `{ preparationId, draft }`; no other namespace, no new storage table, no migration.

## Verification plan (binding order)

Focused tests → T9/T10/T11 regression (package suite) → architecture/scope audit → static gates (`generate:typert`, typecheck, build) → **exactly one** fresh Canonical Full → acceptance report. Full runs only after every focused/regression failure is fixed; no executable drift after Full; no real provider; Harness read-only.
