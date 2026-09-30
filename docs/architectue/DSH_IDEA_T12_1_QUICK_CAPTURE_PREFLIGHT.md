# DSH Idea T12.1 Quick Capture Foundation — Preflight Report

Status: `T12_1_PREFLIGHT_PASS — NO_HARD_BLOCKER (3 decision points open)`
Date: 2026-09-29
Scope: read-only preflight for the Quick Capture feature (「＋ 记录新想法」inside the existing Idea panel, two save modes: plain-text direct save without LLM, and explicit AI-organize with confirmation). Zero product/test/Harness modifications; no provider calls; Canonical Full not run; nothing committed.

Baseline verified: dsh-idea HEAD = `b9e73781b8bf6ed5c6ab30c4b50e952b877f5858` (= `origin/main`); tested executable unchanged `1afd6f0…`; Harness `ddefc45…` read-only, tracked diff zero. All file references below are `packages/dsh-idea/src/...` at this HEAD.

## 1. 当前代码事实

**IdeaSearchCard / 搜索面板结构（`client/IdeaSearchCard.tsx`）**
- 挂载点：`client/index.ts:237-259` 把卡片注册在 `conversation.input.overlay` slot（id `idea-search`，order 5）；打开入口是 composer `+` 菜单的 `idea` command（`client/index.ts:284-294`，`available: () => true`）。方向要求的「在原面板搜索框上方增加入口」= 在该卡片 header 与 `<input>` 之间加一个纯 additive 按钮，不需要新 toolbar 按钮或新 command。
- 卡片内部结构：header（× / Escape / 点外关闭，零副作用）→ 搜索输入框（autoFocus）→ `role=listbox` 结果列表（title+core 两行）→ footer（Add，选中才可用）。Escape 是 window 级监听，关闭整卡——快捷捕获 UI 放进卡片后继承这一契约（关闭零写入）。
- `client/search-state.ts` 的 `IdeaSearchSurface`：per-Session、只读（open/query/select/retry/close，epoch 防陈旧回写），与保存完全解耦。

**IdeaService.create 与 Aggregate Schema（`service.ts:145-196`、`schema.ts`）**
- `IdeaService.create(draft, source)` 的 `source: SourceDiscussionDraft` 是**必填**，且 `sourceDiscussionDraftSchema` 要求 `sessionId` 非空 + `capturedContext ≥ 1`（schema.ts:94-100）。create 固定写入恰好一个 sourceDiscussion 并让 v1 引用它（service.ts:167-190）。
- **持久层早已兼容空 provenance 与空 motivation**（关键事实）：
  - `ideaAggregateSchema.sourceDiscussions: z.array(sourceDiscussionSchema)` —— **无 min(1)**（schema.ts:259）；
  - `ideaVersionSchema.sourceDiscussionIds: z.array(...)` —— **无 min(1)**（schema.ts:133）；
  - superRefine 只校验"引用的 id 必须存在"（schema.ts:318-328），空数组引用空集合合法；v2→v3 迁移本身就会把缺失引用规范化为 `[]`（schema.ts:185）；
  - `durableDraftSchema.motivation: z.string().max(fieldMax)` —— **无 min(1)**（schema.ts:118），空字符串可持久化并 byte-identical 回读。
- **写路径是唯一缺口**：持久层接受，但 `IdeaService.create` 的函数签名与 `idea.create` remote（preparationId 锚定）都不提供空 provenance 的创建路径。诚实落库（`sourceDiscussions=[]` + `versions[0].sourceDiscussionIds=[]`）只需新增一个最小 create 变体，不需要任何 schema/存储变更。

**空 sourceDiscussions 的下游消费（全部已兼容，逐处核验）**
- `remote-host/service.ts:685-694 citedSourceOf`：`sourceDiscussionIds[0] === undefined → source: undefined`，wire 已处理无引用版本。
- T10/T11 provenance 排除：`resurfacing/candidate.ts:30`、`semantic/service.ts:368/454/529` 均为 `sourceDiscussions.some(d => d.sessionId === sessionId)` —— 空数组 → false → **快捷捕获的 Idea 在任何会话都可被召回/关联**（`createdInConversation=false`），语义正确。
- 搜索/关联/重浮现的词法权重（frozen，`related/types.ts:25-33`）：title 5 / core 4 / motivation 3 / currentConclusion 3 / useWhen 3 / possibleValue 2 / openQuestions 2 —— motivation 为空只使该字段贡献 0 分，不报错（`scoreLexicalFields` 对空文本得 0）；搜索结果行只展示 title+core（`IdeaSearchCard.tsx:87-88`），UI 不受空 motivation 影响。

**motivation 的两处非持久层约束（兼容性缺口）**
- 输入校验 `ideaDraftSchema.motivation: requiredText`（schema.ts:76，min 1）；
- 客户端 `requiredPresent`（`client/state.ts:93-94`）要求 title/core/motivation 全非空才允许 Save；
- 后果：快捷捕获若落库空 motivation，**之后**对该 Idea 的 manualEdit / commitEvolution 会以 `ideaDraftSchema` 校验新版本草稿，编辑者必须先补 motivation 才能保存（客户端同理）。这是行为决策点，不是持久化阻塞（见 §3-D1）。

**AI 模式的模型调用复用方式（`preparation/`）**
- 现有 `prepareFromMessage`（`preparation/service.ts:58-98`）硬锚定 `readSessionSurface` + `captureDiscussionFromSurface(anchorMessageId)` —— 只能从"已定稿的 Assistant 消息"提取。快捷捕获的用户自有文本没有 message 锚点；把用户文本塞进 capturedContext 即是伪造 Source Discussion，**禁止**。
- 可直接复用的是管道层：`pipeline.ts` 的 `resolveModelRoute`（Session 投影优先、host default 回退——与 Harness Session 模型一致）、`extractModelText`（恰好一次 `ctx.llm.stream()`、plugin-source、无重试无工具）、`checkCancelled`，以及 `parser.ts parseIdeaDraftOutput`（严格解析 T1 IdeaDraft）。AI 模式 = 新的小 prompt builder（输入=用户文本）+ 一次同样的单调用抽取，成本 1 次请求，与 T11.1 selector/judge 同款。
- `IdeaPreparationRegistry`（preparation/registry.ts）：ephemeral、TTL 30min、容量 64，`register` 铸造 `prep_` id；remote create 的重复提交幂等完全建立在 preparationId 之上（`remote-host/service.ts` commits Map）。

**保存边界语义（`client/state.ts`，可整体借鉴）**
- 双击：客户端 `submitInFlight` 挡住重复发送（"double-clicks are simply not sent"）；Host 侧幂等由 preparationId 承担。
- 异步失败：`save-failed` 保留 modal 与草稿允许重试；`expired`（preparation 过期）保留编辑；取消在提交中被忽略；dispose 中止 in-flight prepare。
- 保存对话框（`client/IdeaSaveDialog.tsx`）渲染 `来源：当前对话 · N 条消息`——快捷捕获需要自己的来源文案（如「手动记录」），纯 locale 增量。

**无 Workspace 可用性**
- 卡片与 command 都活在"某个已打开的会话"上下文里；无 Workspace 时 Host 存在未绑定默认会话（R2 已实证），`idea.createQuick` 不触碰 workspace；`continueDiscussion` 的 workspace 依赖不在快捷捕获路径上。**结论：无 Workspace 可正常使用快捷捕获。**

**用户既有 docs drift**
- 当前 17 项（5 个 `docs/` 顶层删除 + 12 个未跟踪文档）与 T11.1 收官时完全一致；本 Preflight 只新增本报告文件（`docs/architectue/` 新未跟踪文件），未覆盖、未重命名、未 staging 任何用户文件。

## 2. 可复用的现有能力

1. 搜索卡片 slot/入口/表面/文案/样式全套（T9 验收资产）——快捷捕获是纯增量注入。
2. `ideaDraftSchema` + `parseDraft` 边界校验；持久层 schema（已天然容纳空 provenance/空 motivation）。
3. 模型调用管道（route 解析、单次 stream 抽取、严格解析、取消语义、无重试）——AI 模式零新基础设施。
4. 客户端保存状态模式（SnapshotStore surface、submitInFlight、失败分类、成功 toast、dispose 语义）。
5. 只读核验端点（`idea/list` / `get` / `getVersions`）——保存后的 UI/只读核验不需要新面。
6. 无需新增 storage domain/table/迁移：`ideas` 表记录形状不变。

## 3. 架构阻塞及待决问题

**D1（决策点）motivation 契约**：快捷捕获模式 1"输入一段文本直接保存"不应强迫用户填 motivation。选项 (a) 保持 `ideaDraftSchema` 必填，快捷捕获落库空 motivation——但该 Idea 后续 manualEdit/evolution 必须先补 motivation 才能保存（可用但体验断裂）；选项 (b) 把 `ideaDraftSchema.motivation` 放宽为 `optionalText`——持久层本已按可选设计（durable twin 无 min），词法仅少一个权重字段，但这是 T1 冻结契约的语义变更（touch wire + 客户端 requiredPresent + 文案 + 既有测试）。**需架构裁决；本报告倾向 (b)，理由是持久层设计意图已先行。**

**D2（决策点）直接创建的幂等**：绕过 preparationId 后没有 Host 端 commit-machine 去重。选项 (a) Design A：新增 `idea.createQuick` 直创 remote + 客户端 submitInFlight 防重（与现有"双击不发送"策略同款，最小爆炸半径）；选项 (b) Design B：把 `PreparedIdeaSource` 放宽为可无 source 的 registry 条目，复用 registry+commit machine 幂等（改动 registry/remote-host/commit 三处）。**倾向 (a)。**

**D3（决策点）AI 模式的返回通道**：AI 整理生成提案后确认保存——提案是走 registry（prepareQuickCapture 注册 + 复用现有 create）还是直接把草稿返回客户端、确认后同样走 `createQuick`？前者复用幂等但必须解决"无 Source Discussion 的 preparation"（与 D2 同源）；后者两条模式收敛到同一个直创端点，实现最统一。**倾向后者（与 D2 的 Design A 配套）。**

**非阻塞确认**：
- 伪造边界成立：两条模式都不需要伪造 Assistant 消息或 Source Discussion——模式 1 不经任何 LLM/锚点；模式 2 的 LLM 输入是用户自有文本（新 prompt，不进 capturedContext）。
- `IdeaService.create` 现有签名保持不变，T1–T11 全部既有路径零改动。

## 4. 建议的最小实现方案（供 T12.2 评审）

1. **Host 域**：`IdeaService` 新增 `createDirect(draft: IdeaDraft)` —— parse `ideaDraftSchema` → 写 aggregate：`sourceDiscussions: []`、`versions[0].sourceDiscussionIds: []`、`reason: 'initial-save'`、对应 evolution event；复用既有的 uuid 冲突防护与 `detach`。
2. **Remote**：`idea.createQuick({ draft })` → 域校验 + `createDirect`，返回与 `idea.create` 相同的 result 形状。（typert codegen 随 build 重新生成，属常规构建步骤。）
3. **客户端**：`IdeaSearchCard` 搜索框上方加「＋ 记录新想法」→ 卡片内联迷你表单（一个文本域；title 取首行/前 N 字为默认值可编辑）+ 两个动作：「直接保存」（模式 1）与「AI 整理」（模式 2，可见的显式选择）。模式 2 调一次 `prepareQuickCapture`（1 次 provider 请求）→ 返回提案填入同一表单（可编辑）→ 用户确认后与模式 1 同走 `createQuick`。新 surface `IdeaQuickCaptureSurface`（submitInFlight / failure / success 关卡并关卡片）。Escape/点外关闭 = 零写入，与卡片既有契约一致。
4. **成功后**：关闭卡片；若搜索列表处于打开态，下次打开自然反映新 Idea（blank query = recency list）。
5. **不做**：不加工具栏按钮、不改搜索/引用/Add 行为、不动 T10 dock、不动 `@` 引用 source、不新增 command。

## 5. 预计修改文件范围

| 文件 | 变更 |
|---|---|
| `src/service.ts` | 新增 `createDirect`（additive） |
| `src/remote-host/service.ts`、`src/remote-host/types.ts` | 新增 `idea.createQuick`（及可选 `idea.prepareQuickCapture`） |
| `src/preparation/service.ts`、`src/preparation/prompt.ts` | 仅 AI 模式：新 prompt builder + 单调用方法（复用 pipeline） |
| `src/client/IdeaSearchCard.tsx` | 搜索框上方新增入口 + 内联表单 |
| `src/client/quick-capture-state.ts`（新） | 快捷捕获 surface |
| `src/client/slots.ts`、`src/client/index.ts` | 新注入面接线 |
| `src/client/locales.ts`、`src/client/styles.ts` | 新 key + 少量样式 |
| `src/schema.ts` | 仅当 D1 选 (b)：motivation → optionalText |
| `tests/` | 新增 createDirect/quick-capture spec；若 D1=(b) 另需调整断言 required motivation 的既有用例 |
| **不触碰** | `retrieval/`、`search/`、`resurfacing/`、`semantic/`、`reference/`、`evolution/`、`continuation/`、storage domain、`cordis.patch.yml`、Harness |

粗估：Host+Remote 约 4 文件小增量，客户端约 6 文件，测试 1–2 个新 spec；无迁移、无新表。

## 6. Preflight Outcome

`T12_1_PREFLIGHT_PASS — NO_HARD_BLOCKER`

- 复用现有 `+` → Idea 面板与搜索卡注入结构可行，且为纯增量。
- 持久层**已兼容** `sourceDiscussions=[]` / `sourceDiscussionIds=[]` 与空 motivation 的存储与回读；缺口仅在写路径（需一个诚实落库的直创方法，伪造路径已排除）。
- 三个开放决策点（D1 motivation 契约、D2 幂等设计、D3 AI 提案通道）已给出倾向方案，等待架构裁决后即可进入 T12.2。
- 无 Workspace 可用；T9/T10/T11 回归面经逐点核验为可控（卡片 additive、其余零触碰）。
- 本 Preflight 全程只读：零代码改动、零 provider 调用、零提交；用户既有 docs drift（17 项）原样保留。本报告作为未跟踪新文件落在 `docs/architectue/`，不覆盖任何既有文件。停止于此，等待架构审核。
