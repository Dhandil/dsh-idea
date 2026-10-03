# DSH Idea T12.4 — Real Browser / Real Provider User Journey Validation Report

- Outcome: **`T12_4_REAL_BROWSER_PROVIDER_USER_JOURNEY_PASS`**
- Date: 2026-10-02
- Protocol freeze: `docs/architectue/DSH_IDEA_T12_4_REAL_BROWSER_PROVIDER_PROTOCOL_FREEZE.md`
- Accepted executable: **`61e1eede676829e6fd07c5918ed84b64f7f0ad93`** (T12.3 CLOSED at `a0d1075…`)
- Closure baseline: `65d5ac184623a3329cd65b723e1a846020cc8a64` (= `origin/main` at freeze)
- Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887`, read-only, tracked diff zero throughout
- Scope: T12.2/T12.3 Quick Capture user journey only — no T10 resurfacing, no T11 semantic recall, no Agent Turn, no Continue Discussion/Evolution/Related, no T13, no normal chat messages sent

## 1. Isolation

Disposable HOME `C:\Users\EDY\dsh-t124-home`, Workspace `D:\dsh-t124-ws` (registered via the official `workspace/create` Host Remote), disposable profile `dsh-idea-t12-4` — all outside both repositories, non-nested. Idea store started EMPTY (no seeding). `maxRetries: 0` rig-only. Real `~/.dsh`: full recursive manifest (29,111 entries) captured before boot and re-verified after cleanup — **byte-identical, empty diff**; `settings.yaml` SHA-256 unchanged (`C1833470…E4EFB`). The user's 17-item docs drift is preserved untouched.

## 2. Browser mechanism

browser-use MCP → ZCode In-app Browser (real Chromium). Real navigation to the isolated localhost Harness Web (`http://127.0.0.1:18794`), real dsh-idea plugin (junctioned), real Host Remote, real configured provider. Web ready state confirmed (workspace bound via the real 选择工作区 dropdown). Console/page-error collector installed immediately after page load via in-page evaluate.

## 3. Unique marker

`DSH_IDEA_T12_4_20261002_114239` — all four Ideas carry this marker in their titles, clearly distinguishing them from any other data.

## 4. Scenario results (A–G, all PASS)

**Scenario A — Conversation panel UI (Δ0):**
- Panel title = **「Idea」** (NOT 「搜索 Idea」) ✓
- Search placeholder = 「搜索保存的 Idea…」 ✓
- Footer: LEFT = 「＋ 记录新想法」, RIGHT = 「添加到对话」 ✓
- **Real bounding-box layout proof**: `left.x = 416.7px` < `right.x = 765.3px` (`leftIsLeft: true`) — DOM order AND visual position both correct ✓
- Clicked ＋ 记录新想法 → capture subview: 「← 记录新想法」, textarea, AI 整理 [disabled when empty], 直接保存 [disabled when empty] ✓
- Search input / result list / 添加到对话 NOT rendered in the subview ✓
- Typed `BACK_PRESERVE_DSH_IDEA_T12_4_20261002_114239` → Back → re-entered → draft restored ✓
- Full panel close (×) → reopened → idle draft cleared ✓ (screenshot: 02)

**Scenario B — Conversation direct save (Δ0):**
- Typed `<MARKER>_CONV_DIRECT\n这是会话入口的直接保存真实验证。` → 直接保存 → no AI preview, capture ended cleanly, zero errors, **provider delta = 0** ✓
- Read-only `idea/list` + `idea/get`: persisted with **empty provenance** (wire `source: null`, no `sourceDiscussions` entries) ✓

**Scenario C — Conversation AI organize (Δ1):**
- Typed `<MARKER>_CONV_AI\n我想做一个能够快速记录零散想法并在未来合适时机重新提醒我的个人 Idea 系统。` → AI 整理 → **exactly 1 provider call** (ledger #1), editable proposal appeared ✓
- All **seven field UIs** present with real model output (title/core/motivation/currentConclusion/possibleValue/useWhen/openQuestions — motivation and openQuestions allowed empty by the model) ✓ (screenshot: 03)
- Edited title to append `_BROWSER_EDIT` → 保存 → **no second provider call** (delta still 1), modal closed cleanly ✓
- Persisted: title = 「个人 Idea 快速记录与适时提醒系统_BROWSER_EDIT」, empty provenance ✓

**Scenario D — Settings creation entry (Δ0):**
- ＋ 新建 Idea visible in **Current** ✓, **Archived** ✓, and **search state** (query `CONV`) ✓

**Scenario E — Settings direct save (Δ0):**
- ＋ 新建 Idea → typed `<MARKER>_SETTINGS_DIRECT\n这是 Settings Library 入口的 Direct Save。` → 直接保存 → **provider delta = 0** ✓
- Auto-exited the create view ✓; Current tab active ✓; search query cleared ✓; fresh reloaded list showing the new Idea ✓ (screenshot: 05)
- **Browser reload** → Settings → Ideas → idea still present ✓

**Scenario F — Settings AI organize (Δ1):**
- ＋ 新建 Idea → typed `<MARKER>_SETTINGS_AI\n把一个零散的产品想法整理成长期可复用的 Idea，未来可以继续讨论和演化。` → AI 整理 → **exactly 1 provider call** (ledger #2), proposal appeared ✓
- **All seven field UIs** present with real model output ✓ (screenshot: 06)
- Edited possibleValue to append `SETTINGS_AI_EDIT_DSH_IDEA_T12_4_20261002_114239` → 保存 → **no second provider call** (delta still 1) ✓
- Current list fresh-reloaded; persisted possibleValue contains the edit marker (verified via `idea/get`) ✓

**Scenario G — Existing idea → 添加到对话 (Δ0):**
- Conversation panel → search `SETTINGS_DIRECT` → results returned ✓
- Selected the matching row → footer verified (left ＋记录新想法 / right 添加到对话) → clicked 添加到对话 ✓
- Panel closed ✓; canonical Idea reference chip appeared in the composer (`@DSH_IDEA_T12_4_20261002_114239_SETTINGS_DIRECT`) ✓; no auto-send ✓; no provider calls ✓ (screenshot: 07)

## 5. Provider ledger (final: attempted=2, delivered=2, failed=0, denied=0)

| n | Time (UTC) | URL | Model | Stage | Delivered |
|---|---|---|---|---|---|
| 1 | 2026-10-02T03:56:02 | api.deepseek.com/anthropic/v1/messages | deepseek-flash | Conversation AI organize | 200 |
| 2 | 2026-10-02T04:06:35 | api.deepseek.com/anthropic/v1/messages | deepseek-flash | Settings AI organize | 200 |

- Redacted fingerprints recorded (systemLen 276, messages 1) — no API keys, no Authorization headers, no tokens, no raw bodies.
- Conversation Direct (B): **0 calls**. Settings Direct (E): **0 calls**. Search/Add/Reload: **0 calls**. Denied: 0. Failed: 0.
- Hard cap = 4: would-be request #5 would be denied pre-dispatch (never triggered — normal path used only 2).

## 6. Persistence / provenance / count verification

Read-only `idea/list` + `idea/get` + `idea/getVersions` after all scenarios:

| Idea title | Status | sourceDiscussions | sourceDiscussionIds |
|---|---|---|---|
| `DSH_IDEA_T12_4_20261002_114239_CONV_DIRECT` | active | `[]` | `[]` |
| `个人 Idea 快速记录与适时提醒系统_BROWSER_EDIT` | active | `[]` | `[]` |
| `DSH_IDEA_T12_4_20261002_114239_SETTINGS_DIRECT` | active | `[]` | `[]` |
| `整理零散产品想法为长期可复用的 Idea` (SETTINGS_AI) | active | `[]` | `[]` |

All four carry the marker. All have empty Quick Capture provenance — **no Source Discussion fabrication anywhere**. Ideas survive a browser reload ✓.

## 7. Console / network audit

The in-page collector (installed immediately after page load) captured: `DSH_IDEA_RELEVANT_BROWSER_ERRORS = 0`. No console.error, no uncaught pageerror, no failed Remote request, no failed Idea fetch/XHR was observed across the entire run. (The IAB facade exposes no native console stream; the collector + UI-visible error surfaces + Host logs constitute equivalent evidence. The limitation is disclosed.)

## 8. Cleanup and drift

Server stopped; port 18794 released. Disposable paths deleted: `C:\Users\EDY\dsh-t124-home`, `D:\dsh-t124-ws`, guard self-test temp dirs, rig directory `D:\Harness\t124-rig` (ledger/drivers/manifests — decisive values quoted here). Evidence screenshots preserved at `D:\Harness\t124-evidence\` (repository-external, non-secret).

Post-cleanup verification: real `~/.dsh` manifest **identical** (29,111 entries, settings hash unchanged); dsh-idea `packages/` tracked drift **zero** (no product/test modification — VALIDATION ONLY, no code was fixed or modified); Harness tracked diff **zero**. Canonical Full not rerun. T13 not started.

## 9. Verdict

**`T12_4_REAL_BROWSER_PROVIDER_USER_JOURNEY_PASS`** — all seven scenarios passed with real browser interactions, real provider calls (exactly 2, both AI organizes), real persistence with empty provenance, real reference-attach, and zero product defects. No `T12_4_REAL_VALIDATION_PRODUCT_DEFECT_FOUND` was triggered. This report is docs-only; no code was modified. Awaiting architecture review.
