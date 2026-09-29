# DSH Idea T11.1 Real User Journey R3 — Report

- Outcome: **`REAL_USER_JOURNEY_R3_EXECUTED — SURFACE_NOT_REACHED (BUDGET_CAPPED)`**
- Date: 2026-09-29
- Baselines (all verified before any real request): dsh-idea HEAD = `6fd61b07d2180c36ec9cf0343829cd7b6d4f71c8` (remote-accepted docs closure; = `origin/main`); tested executable unchanged = `1afd6f0d5f8adda709709f645918229f59dd575a` (`packages/` tracked drift zero); Harness = `ddefc45fbc7f8e46dd73185e68295696d1297887` (tracked diff zero).
- Evidence basis: R1 (`REAL_SEMANTIC_VALIDATION_PARTIAL`, 16/12 overrun), R2 (`REAL_SEMANTIC_VALIDATION_R2_PASS`, 10/12, synthetic-event boundary), and `DSH_IDEA_T11_1_REAL_VALIDATION_ARCHITECTURE_REVIEW.md` (`T11_1_REAL_VALIDATION_CLOSED`, which explicitly preserved the boundary that R2-B was **not** an authentic Agent Turn). R3 was commissioned to close exactly that gap: a real user journey through the real Web UI with a real Agent Turn.

## 1. Result summary

Every layer that ran was genuine: a real browser drove the real Web UI, a real user message went through the real Harness Agent Loop, and the turn was served by the real provider (`deepseek-official / deepseek-flash`). The independent 20-request hard cap was enforced exactly — **20 attempted / 20 delivered / 1 denied pre-dispatch / 0 overruns / 0 retries** — and the 21st request was blocked before dispatch, which surfaced in the real UI as the turn's end state (`本轮运行失败 DeepSeek Messages transport failed / TRANSPORT`). Because the turn never reached `turn/end completed`, the T10/T11 client chain (Detector → Lexical → Semantic selector → Judge → Final Gate → claim → strip) never triggered: no selector call, no Judge call, no surface, no claim. The 查看/引用/忽略 interactions were therefore not exercisable — there was no strip to click, and none was injected. The durable resurfacing budget remained `consumed: false` (verified by a zero-model Remote read after teardown of the turn). This is a truthful capped-journey outcome, **not** a product defect and **not** a Judge verdict.

## 2. MCP preflight (gate 1)

The ZCode browser-use MCP (In-app Browser backend, Playwright surface) was verified with a no-side-effect pass: browser startup, real navigation (`https://example.com/`, title "Example Domain" verified in-page), and a rendered screenshot all succeeded. Two initial screenshot attempts timed out at the fixed 3000 ms surface-preparation budget on a cold about:blank tab; a fresh tab with real content succeeded immediately. Nothing was installed, reinstalled, or reconfigured; had the surface remained unavailable the round would have STOPped per instruction.

## 3. Isolation (gate 2)

- Disposable home `C:\Users\EDY\dsh-r3-home` and test workspace `D:\dsh-r3-ws` sit on **different drives** — disjoint roots, no parent/child, unreachable by relative traversal from the workspace. Home is outside every repository tree. The full recursive manifest of the user's real `~/.dsh` (29,111 entries) was captured before boot and re-captured after cleanup: **byte-identical diff, empty**; `settings.yaml` SHA-256 unchanged (`C1833470…E4EFB`). The real Idea store was never mounted or written.
- Profile `dsh-idea-t11-r3` (bundles `dsh-base`, `dsh-web-app`, `dsh-idea`; junction → the tested `packages/dsh-idea`, so the executed plugin code was the tested executable) with `semantic.mode = llm` from the shipped patch, and a rig-only `retryPolicy: { mode: normal, maxRetries: 0 }`.
- 7 synthetic Ideas seeded through the canonical `IdeaService.create` path into the isolated home (zero model calls). Target `rag-chunking` = `idea_1d448ec8-3165-45af-b6d6-014f2c71e7b2` / `idea_ver_23f594d8-…` using the R2-corrected no-echo wording (「长文档语义分块与召回策略」) so the trigger query has no lexical overlap; distractors: `postgres-notes`, `rogue-values`, `platformer-feel`, `windows-env`, `seam-taping`, `crossborder-pricing`.
- Environment setup (disclosed, not part of the user journey, zero model calls): the workspace was registered through the legitimate Host Remote `workspace/create` (`D:\dsh-r3-ws` → `workspaceId df2f94d2-65ee-4347-bcbc-c41f07d9284d`) — the same seam the UI picker drives. Everything after that point was real UI interaction only.

## 4. Hard request budget (gate 3)

- `R3_REAL_PROVIDER_REQUEST_CAP = 20`, enforced by the rig-only preload guard wrapping `globalThis.fetch` in the single server process: synchronous atomic reserve **before dispatch**, would-be over-cap requests throw before the original fetch is invoked, every reserve/denial/delivery appended synchronously to the ledger with redacted fingerprints only. Chat steps, the title request, selector, Judge, and any internal retry all cross this boundary; internal retries were additionally disabled at the rig layer.
- Offline self-test: `R3_BUDGET_GUARD_OFFLINE_SELFTEST: PASS (cap=20)` — 20 calls pass against a fake transport, would-be calls #21–#22 denied pre-dispatch, non-provider host passes uncounted, ledger never contains bodies.
- Runtime: boot log line 1 = `[r3-budget-guard] armed: cap=20 …`. Final ledger: **20 attempted / 20 delivered / 1 denied / 0 failed**; each attempted `n` has exactly one terminal line (no retry ever fired); the denied #21 (02:25:37.009Z) never reached the transport and surfaced in the product as a TRANSPORT step failure — fail-closed behavior observed live.

## 5. Real user journey (all real browser operations)

1. Opened `http://127.0.0.1:18792/?token=…` in the browser; the real Web UI loaded (「DSH 本地构建」).
2. Selected the test workspace through the real 「选择工作区」 dropdown (`dsh-r3-ws`); the composer activated, showing route 「DeepSeek-V41-Flash High」.
3. Typed the trigger message with real keyboard input into the composer: 「我之前研究过一个让电脑把一堆资料变成能提问的知识库的做法，现在想不起来具体细节了」 (detector-admissible MEMORY_GAP phrasing; no corpus echo).
4. Sent it as a real user (Enter in the composer).
5. The real Agent Turn ran: visible thinking, built-in tools (`Pwsh` workspace listings, `Glob **/*`), and the provider title was generated for the session (ledger n=2). At step 5 the agent legitimately invoked `ask_user_question` (「你想我怎么接着帮你？」) and the turn paused awaiting input — no request cost while waiting.
6. Answered as a real user through the question card's answer box + 「提交」: 「就按第2种给我一份完整可落地的方案吧。不过我还是更想先想起我之前研究过的那一套做法，总觉得跟现在这些不太一样。」
7. The turn resumed and ran to **20 steps (1 轮 20 步), 7 分 25 秒, 524K tok, cache 91%**: hardware probing (`Pwsh` GPU/RAM/python probes), writing and iterating a real chunking implementation (`rag_min.py`, multiple `+/-` edits) with test runs and invariant fixes in the workspace.
8. The next agent step's provider request was **denied by the guard pre-dispatch**; the turn ended `本轮运行失败 DeepSeek Messages transport failed (TRANSPORT)` — no `turn/end completed`.

## 6. What was and was not observed

| Layer | Status |
|---|---|
| 真实浏览器操作 | **REAL** — all steps in §5 driven through the real Web UI |
| 真实 Agent Turn | **REAL** — 19 chat steps + 1 provider title (20 delivered requests), paused at `ask_user_question`, ended at the hard cap; never `completed` |
| 真实 Semantic/Judge 调用 | **NOT REACHED** — the chain triggers only on a completed turn; 0 selector, 0 Judge requests in the ledger |
| 正向 Surface | **NOT OBSERVED** — `section.dsh-idea-resurface` count = 0 (class-level check only; no DOM injection of any kind) |
| UI 查看/引用/忽略 | **NOT EXERCISABLE** — no strip existed to click; none was fabricated |
| Durable budget | `consumed: false` (zero-model `idea/getResurfacingBudget` read for `session-ff424e02-abd0-467a-8d92-89f84ffe8e01` after the turn) |
| Provider 请求账本 | 20 attempted / 20 delivered / 1 denied / 0 failed — cap respected exactly, interception pre-dispatch |

No forbidden technique was used: no synthetic `user/message` or `turn/end`, no synthetic event feed, no direct Judge/Selector API call in place of chatting, no Judge modification, no forced `CLAIMED`, no DOM injection, no FakeLlm. The Judge never ran, so no NONE verdict was recorded either — there was no verdict to force or to record.

## 7. Provider request ledger (decisive numbers)

All 20 delivered requests: `POST https://api.deepseek.com/anthropic/v1/messages`, `model: deepseek-flash`, single delivery per attempt, no retries. Attribution from the redacted fingerprints plus live UI observation:

- **n=1** (02:18:14.177) — main agent request, step 1 (`systemLen` 6860, 1 message).
- **n=2** (02:18:14.200) — session title request (distinct short system prompt, `systemLen` 363, dispatched 23 ms after n=1, matching the `first-prompt` title chain).
- **n=3–20** (02:18:16 – 02:25:26) — agent loop steps 2–20; message count grows 3 → 37 with tool results (Pwsh probes, Glob, `rag_min.py` edits, test runs).
- **n=21** (02:25:37) — **DENIED before dispatch** (`denied`, cap=20); the would-be step 21 never left the process; the UI showed the turn failure.

## 8. Findings for architecture review (non-defects)

1. **Cost model confirmed and amplified (R1 finding #1).** With `reasoningEffort: high`, one innocuous recall message produced 19 agent-loop chat steps + 1 title before hitting the cap — and the agent was still mid-task. Any future real-user-journey validation must budget per agent step (this round's 20 was consumed by a single message + one question-card answer). The guard's mid-turn denial behaved correctly and visibly (fail-closed TRANSPORT in the real UI, no retry, no overrun).
2. **R1 finding #2 reproduced naturalistically.** With no access to the Idea store (different drive, no traversal), the agent independently re-derived the `rag-chunking` idea's substance — chunk-size/overlap/heading-metadata chunking, implemented and tested as `rag_min.py`. Had the chain run, the Judge would have seen an assistant reply thoroughly covering the target's content. Recorded strictly as an observation: the Judge never executed and no verdict is claimed.
3. **Observed, not acted upon:** after the failed turn the composer's model selector displayed 「DeepSeek-V41-Flash **Low**」 for the next message (it was High throughout the turn). Flagged for review; no interaction was performed on it.
4. **Workspace gating of the start screen:** a fresh home cannot send the first message until a workspace is bound (composer `data-phase=inert` until then). Environment setup therefore included the legitimate Host `workspace/create` call, mirroring R1's driver; disclosed as setup, not as a journey step.

## 9. Cleanup and drift

Server stopped; port 18792 released (TIME_WAIT residue only, no listener); no surviving rig process — one orphaned `python -m pip list` child from the agent's own probing (the step that hung during the turn) was killed before deleting its working directory. Deleted R3-owned paths: `C:\Users\EDY\dsh-r3-home` (home incl. profile/junction/ideas/transcripts), `D:\dsh-r3-ws`, `packages/dsh-idea/build/r3/` (seed rig, gitignored), guard self-test temp dirs, and the rig directory `D:\Harness\r3-rig` (contents quoted here). Verified after cleanup: real `~/.dsh` full manifest **identical** (29,111 entries, `settings.yaml` hash unchanged); dsh-idea `packages/` tracked drift **zero** (no product/test change of any kind); Harness tracked diff **zero**. Canonical Full not rerun. No commit, no push, no T12.

## 10. Verdict

`REAL_USER_JOURNEY_R3_EXECUTED — SURFACE_NOT_REACHED (BUDGET_CAPPED)`. The journey itself was fully real (real browser, real UI interactions, real user message, real 20-step Agent Turn from the real provider) and the independent hard cap was enforced perfectly at the network boundary with live fail-closed behavior. The T10/T11 positive-delivery chain could not be observed end-to-end in a genuine turn because this build's agentic cost for a single message (20+ requests, still unfinished) exceeds any reasonably capped round — the same structural finding R1 recorded, now measured precisely against a live cap. No product defect is established; no product or Harness file was modified. This report is final for R3: no commit, no push, no T12 — awaiting architecture review on whether a genuine completed-turn surface observation requires a per-step-budgeted round (e.g. cap ≥ 30) or an interaction design that bounds agent exploration.
