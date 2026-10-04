# DSH Idea T13.1 — Resurfacing Preference Memory & Reminder Controls Architecture Freeze

Status: `T13_1_RESURFACING_PREFERENCE_ARCHITECTURE_FROZEN`
Date: 2026-10-02
Baseline: dsh-idea `afa6ae2e570b36241503008d52e7f3e165021d10`; accepted executable lineage `61e1eed…`; Harness `ddefc45…` read-only. Scope: explicit durable user mute/unmute for proactive resurfacing — user control, not recommendation learning.

## D1 — 忽略 ≠ 暂停提醒

The existing Ignore/Dismiss lifecycle is unchanged: it closes the current suggestion only — no durable preference, no cross-conversation effect, no Idea modification, no budget refund. To reduce ambiguity the user-facing copy changes 忽略 → 本次忽略 (Dismiss this time); the internal dismiss lifecycle is untouched. A NEW independent user action 暂停提醒 (Pause reminders) is the durable action.

## D2 — Durable preference is independent of the Idea semantic aggregate

No muted state enters `IdeaDraft`, `IdeaVersion`, semantic content, or evolution history. Muting never produces a new Idea version and never changes title/core/motivation/currentConclusion/possibleValue/useWhen/openQuestions. A new additive table `resurfacing_preferences` (same additive category as `resurfacing_budgets`) is keyed by `IdeaId` with the minimal canonical record `{ muted: true }`. Absence = reminders enabled. Recovery = delete the record (record exists → muted; record absent → enabled). No fields beyond what enforcement needs.

## D3 — Domain version unchanged

`idea/v3` stays `version = 3, compatibleVersions = [1, 2]`. `resurfacing_preferences` is a version-3-additive table exactly like `resurfacing_budgets`. Old stores without records default to enabled. No migration; no rewrite of existing Idea aggregates.

## D4 — Domain service authority

`IdeaService` gains explicit domain verbs (naming per project style):
- `getResurfacingPreference(ideaId)` — synchronous authoritative read from opened domain state; unknown Idea → `idea/not-found`; absence → `{ muted: false }`; record → `{ muted: true }`; detached result; zero writes.
- `setResurfacingMuted(ideaId, muted)` — validate Idea exists; serialize through the existing per-Idea mutation tail (`enqueueIdeaMutation`, which also rejects while deleting); `true` puts the record, `false` deletes it; both idempotent (repeated same value = zero semantic effect).
- Preference mutations never modify `Idea.updatedAt`, never produce a version or evolution event, never trigger semantic re-index, and make zero provider calls.

## D5 — Permanent delete cleanup

The preference is the Idea's auxiliary durable state. Permanent delete cleans `resurfacing_preferences[ideaId]` inside the existing per-Idea delete serialization (the delete's mutation slot), ordered before the final aggregate deletion — a successful delete never leaves an orphan preference able to resurrect deleted context. Delete and mute/unmute cannot race through the slot (serialize per Idea); after delete admission, new preference mutations are rejected (`deleting`). Preference-cleanup failure fails the delete (never reports success while the aggregate is gone but cleanup was silently ignored). Existing delete failure semantics are preserved — no delete-architecture rewrite.

## D6 — USER_MUTED suppression before any model dispatch

New deterministic suppression reason `USER_MUTED`. Muted Ideas are excluded from ALL proactive candidate paths:
- A. T10 lexical `evaluate` — muted Ideas enter the suppressed list with reason `USER_MUTED` and never enter the pool.
- B. T11 embedding branch — muted Ideas are excluded from the eligible set.
- C. T11 llm-selector branch — muted Ideas are excluded from the corpus.
- D. Hybrid fusion / Judge input — the Judge only sees what the branches produced; a muted Idea can never reach it.

Critical early-exit: when every potential Idea is excluded by deterministic reasons (muted/lifecycle), the pipeline ends BEFORE provider dispatch — empty selector corpus → 0 provider calls; empty embedding eligible set → no query embedding → 0 provider calls. Pause Reminder: 0 provider calls. Resume Reminder: 0 provider calls.

## D7 — Conversation resurfacing UI

The suggestion strip becomes 查看 / 引用 / 本次忽略 / 暂停提醒. 暂停提醒 calls the Host durable mute; on Host success the suggestion disappears (`detailOpen=false`, `lastExpireReason='USER_MUTED'`) and the Idea never resurfaces in any conversation while muted. On Host failure: no pretend-pause, no silent dismiss — the suggestion stays, a lightweight error/retry affordance shows, zero provider calls. No optimistic durable success.

## D8 — Settings → Idea Detail reminder control

The Idea Detail view shows the reminder preference: 提醒：已开启 [暂停提醒] or 提醒：已暂停 [恢复提醒]. Active Ideas can toggle. Dormant/archived Ideas already never resurface — dormant semantics are NOT redesigned; the preference persists through archive/restore (archive → restore → still muted) and only permanent delete clears it.

## D9 — Wire / Remote

Minimal wire extension: `IdeaDetail` gains `resurfacingMuted: boolean` (the ordinary `idea.get` projection — no extra read round trip), and a new mutation Remote `setResurfacingMuted({ id, muted })` → `{ muted }` with Host-side identity revalidation. The conversation strip calls the mutation with the canonical `suggestion.ideaId`. The browser never writes storage tables. Typert contracts regenerate via `generate:typert`.

## D10 — Explicitly out of scope

No learned rank weights; no implicit feedback scoring; no dismiss-count penalty; no reference-count boost; no ML feedback model; no TTL or arbitrary cooldowns; no automatic unmute; no global disable-all; no per-project preferences; no Idea Graph/tags/merge/split; no PAH integration. This phase is explicit durable user mute/unmute only.
