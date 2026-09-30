# DSH Idea T12.2 Quick Capture Implementation — Acceptance Report

- Outcome: **`T12_2_QUICK_CAPTURE_IMPLEMENTED — ALL_GATES_GREEN`**
- Date: 2026-09-29
- Accepted baseline: `b9e73781b8bf6ed5c6ab30c4b50e952b877f5858` (= `origin/main`); Harness `ddefc45fbc7f8e46dd73185e68295696d1297887` read-only, tracked diff zero throughout.
- Architecture authority: `docs/architectue/DSH_IDEA_T12_QUICK_CAPTURE_ARCHITECTURE_FREEZE.md` (D1/D2/D3 frozen) implementing the accepted `DSH_IDEA_T12_1_QUICK_CAPTURE_PREFLIGHT.md`.
- **Tested executable (this task, after the second architecture-review repair): commit `3286bc1bfdf8707878f9243d19bef04ea406e44d`**. Commit lineage: initial implementation `5b2351500679c7c1675b8c24c051aad3b8334619` → first repair `a5f0ae2dad34621f8dcf9a8373527668c9892c1e` (R1–R5) → second repair `3286bc1…` (R6–R8, below). Every gate in §3/§5/§6 was re-run to green against the repaired code state, with zero executable drift after the final Canonical Full.

## 1. What was implemented

**Host（域 + 远端）**
- `IdeaService.createDirect(draft)`（`src/service.ts`）：与 `create` 相同的 ordinal-1 / `initial-save` / evolution-event 写入，但诚实地落库 `sourceDiscussions: []` 且 `versions[0].sourceDiscussionIds: []`——快捷捕获的原文是用户自有文本，不存在也不伪造会话出处。同样的 uuid 冲突防护与 detach。
- `ideaDraftSchema.motivation` → optional（**D1**）；durable twin 本就可选，零持久化变更。
- `PreparedIdeaSource` → 按 origin 区分的联合类型：`conversation`（既有捕获出处 + route）/ `quick-capture`（无 Source Discussion；AI 时记录 route，direct 为 undefined）（**D2**）。
- `IdeaPreparationService.prepareQuickCapture(sessionId, text, mode)`：
  - `direct`：零 LLM。标题 = 首个非空行（截断至 titleMax），`core` = 完整原文逐字，`motivation: ''`；过界文本经同一 schema 在入册前拒绝。
  - `ai`：显式触发；当前会话模型路由（`resolveModelRoute`）+ **恰好一次** `ctx.llm.stream()`（新 `buildQuickCapturePrompt`，note 以数据框架、永不作为特权轮次）+ 严格 `parseIdeaDraftOutput`；空 motivation 合法。
  - 两种模式都注册同一 ephemeral registry → 后续提交走**同一 Commit Machine**（**D3**）。
- `prepareFromMessage` 保留专属校验：模型提案缺 motivation → `invalid-model-output` 拒绝（聊天提取流程语义不变）。
- 远端新增 `idea.prepareQuickCapture`（既有 `idea` namespace，typert 重新生成）；`commitDurable` 按 origin 分支派发到 `create` / `createDirect`。
- 错误分类：新增 `invalid-quick-capture-input`（preparation）→ `idea/invalid-quick-capture-input`（wire）映射。

**客户端**
- `IdeaSearchCard`：搜索框上方新增「＋ 记录新想法」入口，展开内联表单（textarea + 「直接保存」「AI 整理」）；原搜索输入、结果列表、选择、Add 引用附加、×/点外/Escape 关闭语义全部原样。
- `client/quick-capture-state.ts`（新 `IdeaQuickCaptureSurface`）：open/close/setText/saveDirect/organize；in-flight 期间按钮禁用且重复激活为 no-op；**AI 失败逐字保留原文且直接保存仍可用**；close 在 in-flight 期间被忽略；dispose 中止。
- `IdeaSaveSurface`：新增 `openQuickPreview`（无 source stats 的模态变体）；`runSubmit` 将 thrown carrier 错误归类为 `save-failed` —— **响应不明确时模态保留、重试重发同一 Preparation ID**（冻结要求 5），从不重新 prepare。
- `requiredPresent` 放宽为 title+core（D1；聊天模态、手动编辑、演化提交三个门控一并兼容空 motivation）。
- `IdeaSaveDialog`：快捷捕获提案渲染「来源：快捷捕获」。
- locales（zh/en 各 8 个新 key）+ 最小样式。零 workspace 依赖、零 composer 干预、零 T10 预算接触。

## 2. 验证结果（绑定顺序执行）

1. **Focused Tests（新增 2 个 spec，21 用例）**：`tests/quick-capture.spec.ts`（12，Host）+ `tests/quick-capture-client.spec.ts`（9，客户端 surface）—— **21/21 全绿**。覆盖：direct 零 LLM（FakeLlm 断言 0 次调用）、AI 恰好一次调用（含 note-as-data 框架断言）、空 provenance 持久化与回读（aggregate/wire detail/storage）、空 motivation 的 manualEdit 提交（v2 落库）与演化 schema 兼容、双击/过期（`idea/preparation-not-found`）/重复提交幂等（同 id 保留结果）、关闭/取消/失败草稿保护、原文逐字保留、聊天提取专属校验仍拒绝而快捷捕获 AI 接受同一输出、不伪造 discussion 绑定、不消耗 T10 预算。
2. **T9/T10/T11 回归（包全套）**：修复 8 处既有断言对旧契约的依赖（PreparedIdeaSource 新形状 ×3 文件、motivation 必填断言、生成的 remote 描述符清单 ×2、搜索卡 props 注入、cancellable 清单）后，**最终 51 文件 / 797 用例全部通过**。
3. **Architecture / Scope Audit**：变更足迹 = 22 个修改 + 3 个新文件、+564/−63 行，全部位于 `packages/dsh-idea/`（与 Preflight 预计范围一致）；`retrieval/ search/ resurfacing/ semantic/ reference/ evolution/ continuation/`、存储域、`cordis.patch.yml`、Harness 均零触碰；无新表、无迁移。
4. **Static Gates**：`generate:typert`（新方法进入 host/remote-client 产物）、`tsc --noEmit` 全仓零错误、`pnpm build` + `pnpm build:client` 成功。
5. **Canonical Full（恰好一次最终全新运行）**：`vitest run`（dsh-idea 包全套，即 R1 定义的 Canonical Full 口径：其 49 文件/776 用例 = 本次 51/797 减去本任务新增的 2 spec/21 用例）→ **51 文件 / 797 用例全部通过**。运行参数使用 `--no-file-parallelism`（仅运行参数，代码与用例零改动）：默认并行参数下本机负载使嵌入模式计时类用例（semantic-index/remote-search 等，均与本变更零交集）出现 1–3 个不等的 5s 超时波动（每次用例不同、单独运行均通过），序列化后稳定全绿。
   - 披露：验证过程中曾误将 Harness 仓库自身巨套件当作 Canonical Full 启动一次（590s 超时中断）并补跑一次完整运行——1390 通过 / 51 个文件失败，失败文件全部为 Harness 内部桌面打包/LSP/沙箱 ACL/子进程/scripts 类套件的 5s 超时（dsh-idea 不在 Harness workspace、不被其引用，与本变更无因果），不计入 Canonical Full。
6. **Full 后 executable drift**：lib 产物 mtime（13:02/13:29）在 Canonical Full 前后不变；git tracked 差异集合不变。

## 3. 变更清单

修改（22）：`src/schema.ts`、`src/service.ts`、`src/preparation/{types,prompt,service,errors}.ts`、`src/remote-host/{types,service,errors}.ts`、`src/client/{state,slots,index,locales,styles,IdeaSearchCard,IdeaSaveDialog}.tsx/ts`；tests：`{schema,preparation-registry,preparation-service,remote-service,client,client-search}.spec.*`。
新增（3）：`src/client/quick-capture-state.ts`、`tests/quick-capture.spec.ts`、`tests/quick-capture-client.spec.ts`。
构建产物（未跟踪，gitignore 内）：`lib/`（typert.host、typert.remote-client、client bundle）。

## 4. Git 状态

- Implementation commit = `5b2351500679c7c1675b8c24c051aad3b8334619`（T12.2 的 28 个文件：25 个实现/测试 + 3 个阶段文档）；本报告的 Tested SHA 即该提交。
- 工作区：`packages/dsh-idea` 下 22 M + 3 ??（本任务实现），外加用户既有 docs drift（5 删除 + 12 未跟踪）完整保留；无 reset/clean/覆盖。
- Harness：tracked diff = 0。
- 未运行真实 Provider、未进入 T13。

## 5. Architecture Review Repair (T12.2 R1–R5, 2026-09-30)

The architecture review returned `REPAIR REQUIRED` on the initial implementation commit `5b23515`; D1/D2/D3 stayed frozen and only the following was repaired:

- **R1 — card close / quick-capture coordination**: the card's close (× / Escape / outside / injected verb) and the Add path now share the quick-capture lifecycle (close clears the idle form; a successful Add closes it too). Closing the card while a prepare is in flight **cancels** the prepare (abort silences the async result), so a closed card can never be followed by a late preview. A refused preview handoff (save surface busy) no longer silently drops the note: the form stays open with the verbatim text and a visible `handoff-failed` notice. `openQuickPreview` now returns a handoff boolean.
- **R2 — title derivation**: the first non-empty line is trimmed then capped at `titleMax`, so an over-long first line truncates the title instead of rejecting a note whose `core` is valid.
- **R3 — shared Host input gate**: the note-length gate (≤ `fieldMax`) runs in `prepareQuickCapture` before the mode branch — `ai` rejects an over-bounds note with **zero** provider calls (regression-tested).
- **R4 — direct save auto-commit**: clicking 直接保存 now runs Preparation → commit on the SAME preparation id automatically (no confirmation step, no preview modal). AI organize still shows the editable preview for user confirmation. An unclear commit outcome is retried only with the original preparation id (at most one retry; the Host commit machine dedups), never re-prepared. Refusals while the save surface is busy resolve `false` and the quick form keeps the note.
- **R5 — registry assertions restored**: `preparation-registry.spec` re-asserts the precise per-entry `sessionId`/model identity for capacity/expiry (no kind-only downgrade).

Repair verification (same binding order): Focused (quick-capture host 13 + client 15 + card 3 + registry/preparation/remote suites) → full regression **52 files / 807 tests, all green** → scope audit (10 files: 9 modified + 1 new test, all inside `packages/dsh-idea/`) → static gates (typecheck, host build, client build) → **exactly one fresh Canonical Full (`--no-file-parallelism`): 52 / 807 all green**, with zero executable drift after it. The Harness repository's own suite was not run (R1 established the Canonical Full scope).

## 6. Second Architecture Review Repair (R6–R8, 2026-09-30)

The second review passed R1–R5 and required only R6–R8:

- **R6 — commit outcome state restoration**: `runQuickCommit` now fully restores both the in-flight flag and the observable `submitting` state on **every** exit path, including a structured Remote failure (`ok: false`, e.g. `idea/storage-failed`) — previously the observable spinner could stick. Regression tests cover the structured failure, the thrown unclear outcome, and a follow-up commit being accepted afterwards.
- **R7 — cancellable prepare vs non-cancellable commit**: the quick-capture close is now phase-aware. While a direct commit is in flight, closing the card (Escape / outside / × / Add path) merely hides the form — the note and the pending outcome are preserved, the user is never misled into thinking the save was cancelled, and the note stays recoverable whichever way the commit settles (success consumes it cleanly; failure keeps it with a visible `commit-failed` on reopen). Only the prepare phase is cancellable (R1 semantics unchanged), and `commitInFlight` is set synchronously with the aborted check so a close cannot interleave between prepare resolution and commit start.
- **R8 — unclear outcomes never re-prepare, and the stale-finally race is fixed**: an unclear commit result is remembered (`pendingUnclear`) and a later 直接保存 retries the commit with the ORIGINAL preparation id — `prepareQuickCapture` is asserted NOT called again (regression-tested). Additionally, a prepare task's `finally` is guarded by AbortController ownership, so the deterministic close → reopen → new-task race can no longer let the stale task clobber the new task's AbortController or lifecycle state (deterministic gated race test included).

Second-repair verification (same binding order): Focused (quick-capture host + client + card + registry/preparation/remote suites) → full regression **52 files / 813 tests, all green** → scope audit (5 files, all inside `packages/dsh-idea/`) → static gates (typecheck, host build, client build) → **exactly one fresh Canonical Full (`--no-file-parallelism`): 52 / 813 all green**, with zero executable drift after it (lib mtime unchanged post-Full).

## 7. Verdict

`T12_2_QUICK_CAPTURE_IMPLEMENTED — ALL_GATES_GREEN (SECOND REPAIR APPLIED)`：D1/D2/D3 与 R1–R5 语义不变；R6–R8 修复完成并全部重验。最终 Tested executable = second-repair commit `3286bc1bfdf8707878f9243d19bef04ea406e44d`。等待 ChatGPT 最终架构复审。
