# DSH Idea T11.1 Complete User Journey R4 — Report

- Outcome: **`REAL_USER_JOURNEY_R4_COMPLETE — END_TO_END_POSITIVE`**
- Date: 2026-09-29
- Baselines (verified before any real request): dsh-idea HEAD = `6fd61b07d2180c36ec9cf0343829cd7b6d4f71c8` (= `origin/main`); tested executable unchanged = `1afd6f0d5f8adda709709f645918229f59dd575a`; Harness = `ddefc45fbc7f8e46dd73185e68295696d1297887` (tracked diff zero at start and end).
- Lineage: R1 (partial, 16/12 overrun) → R2 (direct + synthetic-event integration, 10/12) → R3 (real journey, budget-capped at 20 before the chain could fire) → **R4 (this round): the first fully genuine end-to-end run — real UI save, real cross-session recall through a real completed Agent Turn, real Judge SURFACE, and real 查看/引用/忽略 interactions.**
- Budget: independent hard cap **30**; final ledger **23 attempted / 23 delivered / 0 denied / 0 failed**. No cap denial was ever needed; no runaway occurred; the STOP criterion (agent spiraling) never triggered.

## 1. Result summary

ZCode fully automated a real user through the DSH Web UI (browser-use MCP, In-app Browser). In one isolated home: the user discussed a product idea in a real conversation and saved it as an Idea through the real 保存为 Idea flow; opened a brand-new conversation and phrased the same direction differently; the real Agent Turn completed normally, the full T10/T11 chain ran with real provider calls (Detector → Lexical + Semantic selector → RRF → Judge → Final Delivery Gate → durable claim), and the proactive reminder **actually appeared in the real UI**; the user then exercised 查看 (detail expansion), 引用 (reference chip inserted into the composer), and — in a further conversation, since the strip had been consumed by 引用 — 忽略 (strip dismissed). Durable budgets show exactly-once consumption precisely on the two positively-surfaced conversations. One conversation (C3) produced a genuine Judge negative (silence, no strip) after the agent self-recovered the idea's content — recorded as-is, never forced. No product defect was found; no product or Harness file was modified.

## 2. Environment and isolation

- Disposable home `C:\Users\EDY\dsh-r4-home`, test workspace `D:\dsh-r4-ws` — different drives, disjoint roots, no parent/child, outside every repository tree. Profile `dsh-idea-t11-r4` (bundles `dsh-base` + `dsh-web-app` + `dsh-idea`; junction → tested `packages/dsh-idea`; shipped `semantic.mode = llm`); rig-only `retryPolicy: { mode: normal, maxRetries: 0 }`.
- The workspace was pre-registered through the legitimate Host Remote `workspace/create` (disclosed setup, zero model): `D:\dsh-r4-ws` → `workspaceId 678f5d5c-be40-45ae-8a8e-07da6deda56a`. **The Idea store started empty** — no seeding of any kind; the only Idea in the store is the one saved through the real UI in Phase 1.
- Real `~/.dsh`: full manifest (29,111 entries) captured before boot and after cleanup — **byte-identical diff, empty**; `settings.yaml` SHA-256 unchanged (`C1833470…E4EFB`). Never mounted, never written.
- Budget guard: rig-only preload over `globalThis.fetch`, atomic synchronous reserve **before dispatch**, `R4_REAL_PROVIDER_REQUEST_CAP = 30`; offline self-test `R4_BUDGET_GUARD_OFFLINE_SELFTEST: PASS (cap=30)`; boot log line 1 armed. Internal retries additionally disabled at the rig layer.

## 3. Phase 1 — real UI save (真实保存)

- Real conversation C1 (session `session-06073d30-…`), workspace `dsh-r4-ws`, route shown 「DeepSeek-V41-Flash High」.
- User message (short, pure discussion, explicitly no code): the plant-watering decision-assistant idea (核心价值 / 使用障碍, 只讨论).
- Real Agent Turn **completed normally in 1 step** (15 s, no tools, direct discussion answer).
- Real save flow through the UI: message footer **保存为 Idea → menu 「总结」** → the extraction call ran (ledger n=3, `systemLen` 237 — the single direct `prepareFromMessage` stream, exactly as designed, no retry) → the **保存 Idea dialog** opened pre-filled by the extraction (title/core/motivation/currentConclusion/possibleValue/useWhen/openQuestions) → user clicked the form's **保存** → dialog closed with no error.
- Persistence verified read-only (zero model): `idea/list` → exactly one Idea **`idea_01603cce-1047-4d6c-a041-7d26d3dc8364`**, **status `active`**, current version **`idea_ver_25c65ca6-…`** persisted (ordinal 1); `idea/getVersions` confirms the stored version history. **No data injection was used anywhere in this phase.**
- Durable budget C1: `consumed: false` (nothing surfaced there — correct).

## 4. Phase 2 — cross-session recall (跨会话召回)

- Real new conversation C2 (session `session-bd97506c-…`), **same home**, no manual reference to C1, the saved Idea's content never placed into context.
- User message with different wording + memory-gap phrasing: 「我之前跟你聊过一个给养花新手判断"今天要不要浇水"的小点子，现在想不起来我们当时讨论到的关键结论了，你还记得大概吗？」
- Real Agent Turn **completed normally** (1 轮 3 步): the agent honestly reported no cross-session memory and searched the (empty) workspace — zero hits.
- The full chain then fired with real provider calls, identified by ledger fingerprints:
  - **Selector** n=8 (`systemLen` 816) — the T11.1 llm selector over the canonical corpus (the single saved Idea).
  - **Judge** n=9 (`systemLen` 1162) — returned **SURFACE** (evidenced by the positive delivery below; the verdict was the provider's, unmodified).
- **The proactive reminder appeared in the real UI**: `region "Idea 提醒"` with 「💡 以前保存过一个可能相关的 Idea：「养花新手"今天要不要浇水"决策小助手」」 and buttons 查看 / 引用 / 忽略. `section.dsh-idea-resurface` count = 1. No DOM injection; screenshot evidence captured.
- **Durable claim**: C2 `getResurfacingBudget` → `consumed: true`; the on-disk store `storages/idea/resurfacing_budgets/session-bd97506c….json` contains exactly `{"surfaceBudgetConsumed": true}` — exactly-once, persisted.

## 5. Phase 3 — real UI operations (查看 / 引用 / 忽略)

Executed in the order the UI offers, as a real user:

1. **查看** (C2): the strip expanded in place to the full detail view — 核心想法 / 可能价值 / 适用场景 / 当前结论 (canonical persisted content) — and the button toggled to 「收起」. Screenshot captured.
2. **引用** (C2): the Idea reference chip 「@养花新手"今天要不要浇水"决策小助手」 was inserted into the real composer; the strip was consumed and removed (referenced candidates do not persist as suggestions) — the dismiss-style 忽略 could no longer act on this strip.
3. **忽略** (new conversation C4, per the R4 instruction to use fresh conversations when needed): C4 (session `session-66397524-…`) ran a genuine multi-round turn (question card answered twice by the user; the agent kept the discussion generic and never covered the saved Idea's specific content). Selector n=22 + Judge n=23 returned **SURFACE**; the strip appeared; clicking **忽略** dismissed it immediately (region count 1 → 0, no error). C4 budget: `consumed: true` (claim fires on surface; dismissal does not refund) — again exactly one durable record on disk.
4. **A genuine negative is part of the evidence**: conversation C3 (session `session-59923cce-…`, wording 「之前我们聊过一次家里盆栽浇水的问题…你还记得多少？」) ran a real turn in which the agent **found and read its own home's session transcripts** (absolute-path environment knowledge — not workspace-relative traversal) and reconstructed the C1 discussion almost verbatim. The chain still ran — selector n=16 + Judge n=17 — and the Judge returned a **negative verdict (silence, no strip)**, exactly the R1-identified redundancy behavior, this time with the budget protected by design: C3 `consumed: false`, no durable record. Recorded as a valid Judge decision; nothing was forced. (Inferred reason: `REDUNDANT_WITH_CONTEXT`; the exact reason string is not surfaced anywhere by the fail-closed design.)

The durable budget picture across all four conversations (API reads + on-disk records agree): C1 `false`, C2 `true`, C3 `false`, C4 `true` — **exactly the two positively-surfaced conversations consumed their one-surface budgets.**

## 6. Provider request ledger (cap 30 — final: 23/23/0/0)

All 23 delivered requests went to `https://api.deepseek.com/anthropic/v1/messages`, `model: deepseek-flash`, one delivery per attempt, no retries, no denials needed. Attribution via redacted fingerprints (selector `systemLen` 816, Judge 1162, title 363, idea-extraction 237, chat steps 6860) correlated with live UI observation:

| n | stage | conversation |
|---|---|---|
| 1 | chat step 1 | C1 (save discussion) |
| 2 | title | C1 |
| 3 | **Idea extraction** (保存为 Idea → 总结) | C1 |
| 4–7 | chat steps 1–3 | C2 (recall turn) |
| 5 | title | C2 |
| 8 | **Selector** | C2 |
| 9 | **Judge → SURFACE** | C2 |
| 10–15 | chat steps 1–5 (home-transcript self-discovery) | C3 |
| 11 | title | C3 |
| 16 | **Selector** | C3 |
| 17 | **Judge → negative (silence)** | C3 |
| 18–21 | chat steps (two question-card rounds) | C4 |
| 19 | title | C4 |
| 22 | **Selector** | C4 |
| 23 | **Judge → SURFACE** | C4 |

Reserve: 7 requests of headroom remained at stop; every Agent Turn completed normally; the STOP criterion was never approached.

## 7. Prohibitions audit

No FakeLlm; no synthetic turn/end or event feed; no UI-strip injection (every strip was produced by the product's own controller over real provider verdicts); no Judge modification or forcing — C3's negative verdict stands as returned; no API write standing in for the UI save (the only Idea was saved through the real dialog); no product/Harness modification; no user-data modification; Canonical Full not rerun; no commit, no push; T12 not started.

## 8. Findings for architecture review (non-defects)

1. **The full T11.1 value proposition now has end-to-end real evidence**: UI save → new conversation → different wording → real completed turn → selector rank recall → Judge SURFACE → durable CLAIMED → visible strip → user actions. R1's two blockers (cost model, contamination) and R2/R3's boundaries (direct/synthetic-event/capped) are all closed by this run.
2. **Judge behavior tracks assistant-context redundancy exactly as designed**: C2/C4 (assistant could not cover the content) → SURFACE; C3 (assistant self-recovered the content from its own home transcripts) → silent NONE. This naturalistically confirms R1 finding #2 with budget-safe evidence.
3. **Agent home-awareness**: in C3/C4 the agent knew its own `DSH_HOME` absolutely and read session transcripts (C3) — a Harness sandbox scoping observation, not an Idea-plugin defect. The plugin's own protections (provenance exclusion, version pinning, fail-closed Judge) behaved correctly regardless.
4. **Per-conversation budget semantics confirmed live**: one surface per conversation; 引用 consumes the strip; 忽略 does not refund; a fresh conversation gets a fresh budget.
5. Minor: the composer's model selector displayed 「DeepSeek-V41-Flash Low」 on follow-up conversations (first conversation showed High) — recorded for review, never interacted with.

## 9. Cleanup and drift

Server stopped; port 18793 released (no listener); no surviving rig process; the four browser tabs were closed deliberately. Deleted R4-owned paths: `C:\Users\EDY\dsh-r4-home` (home incl. profile/junction/the one UI-saved Idea/transcripts/budget records), `D:\dsh-r4-ws`, guard self-test temp dirs, and the rig directory `D:\Harness\r4-rig` (ledger, drivers, manifests — decisive values quoted here). Post-cleanup verification: real `~/.dsh` manifest **identical**, settings hash unchanged; dsh-idea `packages/` tracked drift **zero** (HEAD `6fd61b0` untouched); Harness tracked diff **zero**.

## 10. Verdict

`REAL_USER_JOURNEY_R4_COMPLETE — END_TO_END_POSITIVE`. All ten reporting questions are answered with real evidence: (1) UI save succeeded; (2) Idea durably persisted (active, v1); (3) a new conversation's chain read and recalled the old Idea; (4) Agent Turns completed normally (C2/C4 cleanly; C3 completed with self-discovery; C1 in one step); (5) Selector returned the target and the Judge returned SURFACE twice and a genuine negative once; (6) the reminder really appeared in the real UI, twice; (7) 查看, 引用, 忽略 all worked with the documented state changes; (8) durable budgets show exactly-once consumption on exactly the surfaced conversations; (9) 23 real provider requests under the hard cap of 30 with pre-dispatch enforcement armed and unused; (10) full cleanup with zero drift. This report is final for R4: no commit, no push, no T12 — awaiting architecture review.
