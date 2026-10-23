# P2-Lite Architecture Freeze 候选：当前 Idea 内容更新

状态：`DSH_IDEA_P2_LITE_ARCHITECTURE_READY_FOR_REVIEW`。**产品方向来自用户新决策；下述技术取舍为待独立审查的候选，不是实施授权或架构已验收。** 日期：2026-10-23。

基线：`d36325aed1373a9a2dedeced8e367a5bb32e6395`，开工 fetch 后与 main / origin/main 一致。分支：`codex/dsh-idea-p2-lite-architecture`。源码只读参照：Harness `86a402200d95fecef4529d969836f1fe13c6cb0d`（0.2.1-alpha.4）。配套：[Implementation Instructions](../implements/DSH_IDEA_P2_LITE_IMPLEMENTATION_INSTRUCTIONS.md)。

## 1. 产品决策及替代关系

一个 Idea 在库、详情和编辑中只展示一份当前有效内容。普通对话的灯泡「总结」支持：

1. **保存为新 Idea**：有界对话 → 一次提取 → 可编辑预览 → 用户明确保存。
2. **更新已有 Idea**：用户从 Idea 库明确选择 → Host 读取该 Idea 当前内容与有界对话 → 一次更新提案 → 可编辑预览 → 用户明确确认更新。

不实施自动引用归属恢复、候选 pin 推断、历史版本 rebase 或面向用户的多版本演进流程。没有引用、引用多个 Idea、只有旧引用或讨论很长，都不影响用户主动选库目标；选择不代表系统证明该讨论属于这个 Idea。

原 [P2A Freeze](DSH_IDEA_P2A_CONVERSATION_EVOLUTION_ARCHITECTURE_FREEZE.md)及配套 Instructions 加覆盖标记，历史正文和已发生的验收保持不变。原 P2B 暂停。G0 分支 `codex/dsh-idea-p2b-g0-source-proof` 保留在 `d7677a0b522609c500b72cb058f4e14b28f867a5`，不合入本分支或 main；本轮不重新评定其证明结论。

**当前内容的产品投影与底层留存分开：**本方案继续通过现有 `currentVersionId` 指向唯一当前内容，底层仍可追加不可变内部记录。没有删除、覆盖、折叠或迁移旧版本、来源、事件、讨论绑定或用户 Session。内部并发标记不变成用户需要理解的版本操作。

## 2. 源码影响核查

以下位置相对 `packages/dsh-idea/`，结论来自指定 main 源码及已有测试的只读检查；本轮没有执行这些测试。

| 位置 | 已核实行为 | 最小复用 / 差异 |
| --- | --- | --- |
| `src/service.ts:275`、`src/remote-host/service.ts:list/get` | 一条 aggregate 只投影当前内容；list 不是多版本多行。 | 无须新建“当前 Idea”表或修改 Storage 模型。 |
| `src/service.ts:310`、`:479`、`:885` | manualEdit 做 schema 规范化、同 Idea 队列、expected current 校验；当前基线相同且内容无变化时提前零写返回；变化时追加内部记录并更新当前指针。 | **推荐作为唯一更新写入路径，域 writer 不改。** 冲突保护不因 UI 隐藏版本而删除。 |
| `src/remote-host/service.ts:452` | manualEdit 返回 canonical current 标记及 `committed`；无变化返回 false。 | 普通手工编辑继续使用。新模型预览增加薄的 Host 绑定，内部委托域 manualEdit。 |
| `src/preparation/service.ts:70`、`context.ts` | 新建从指定 assistant 锚点向前取 12 条 / 12,000 字符，只取 human/assistant 可见 text；一次直接提取，Host registry 保存来源。 | 新建 prepare/create 语义和来源留存不改；更新复用捕获规则与提取管线，不先生成新建草稿再调用一次更新模型。 |
| `src/preparation/pipeline.ts` | readSurface 读当前 surface；路由优先 Session selection 再 Host default；一条直接 stream，无 Agent Loop/工具/隐藏重试，接入 AbortSignal。 | 两种模式复用同一路由、取消和错误分类。 |
| `src/evolution/prompt.ts` | 输入 currentDraft、historySummary、openQuestions、messages；JSON 证据作为不可信背景，保留讨论未否定内容，只输出完整 IdeaDraft。 | 复用纯 Prompt builder，传 **空 historySummary**；只纳入目标当前内容与此次 bounded capture，不带旧版本摘要。内部函数名不要求本轮重构。 |
| `src/evolution/service.ts:101,198` | 旧 prepare 依赖专用 IdeaDiscussion 和全讨论 surface；commit 调 evolve。evolve 当前没有 manualEdit 的无变化短路。 | 不调用旧 prepare/commit/evolve 来伪装普通更新，不伪造 discussionId。 |
| `src/evolution/registry.ts`、`src/preparation/registry.ts` | 内存 64 项 / 30 分钟；前者成功消费后不保留结果 receipt，后者没有更新目标绑定。 | 复用限额和临时 registry 设计，新增轻量更新票据；不直接混用新建 preparationId，避免误入 create。 |
| `src/remote-host/service.ts:search`、`src/search/service.ts` | 当前内容的本地确定性词法搜索，不调用 embedding 或模型；scope=current 排除归档。 | picker 复用 list/search/get；不用 Related Judge 或 semantic 检索识别目标。 |
| `src/client/state.ts`、`IdeaSaveDialog.tsx` | 立即显示 pending、真实 abort、迟到结果保护、同弹窗转预览、保存失败保留草稿、开窗双击遮罩保护。 | 扩展模式/目标选择阶段，复用后续准备与预览体验。不得用假 preparationId 代表选择或准备态。 |
| `src/client/IdeaSection.tsx:397–642`、`read-state.ts:open/runVersions/runReadiness`、`locales.ts` | 详情仍展示历史、讨论、演化提案；打开详情另取历史和 readiness；手工编辑文案为“保存为新版本”。 | 后续 UI 收口须移除旧版本展示/演化入口及无用后台读取，手工保存文案改为“保存”；保留 current 详情、编辑与生命周期操作。 |
| `tests/lifecycle.spec.ts`、`remote-lifecycle.spec.ts`、`client-lifecycle.spec.tsx` | 已有 no-op 字节不变、冲突、归档、失败草稿保留及离开确认断言。 | 后续沿用断言；用户版本界面预期按新决策更新，后端旧接口兼容测试保留。 |

### 2.1 推荐方案与来源留存取舍

**推荐 A：一次更新提案 + manualEdit。** Host 只把当前 draft 和有界对话交给模型，最终经用户编辑确认后调用既有域 manualEdit。无需修改写入算法、reason 枚举、表、schema 或 Migration。

明确代价：manualEdit 新记录的 reason 仍为既有 `manual-edit`，`sourceDiscussionIds=[]`；**本次更新的对话 capture 只在临时 Host 票据中，不新增 durable 来源快照**。旧来源仍在 aggregate 中原样保存，但新当前内容可能不再有 `detail.source`。不能把旧来源链接复制过来冒称本次更新出处，也不能宣称具备新更新的持久来源审计。模型仅辅助拟稿，最终保存是用户批准的内容编辑；不增加 AI 专用持久化标记。

这一取舍属于待审查技术决定，不把产品新方向等同于用户已明确批准丢弃新的 provenance。若独立审查要求每次更新永久记录本次来源，则需改审 B：在原域队列内扩展具有 source 的受控编辑入口，复用既有来源 schema 并保持原子 no-op；或给 evolve 增加相同无变化防线。两者均扩大产品域实现和回归范围，**不作为本最小方案的隐式工作**。不新增平行 provenance 存储或绕过 writer。

## 3. Host 来源、目标与一次提案

### 3.1 目标明确选择

picker 从 `list(current)` / `search(scope=current)` 读取，用户明确点击一个 Idea，再用 get 展示其当前内容摘要。允许现有非归档可编辑状态，具体生命周期与 manualEdit 一致；不硬编码旧 evolve Remote 的 active-only 成功假设。无目标不允许生成更新提案。

Host 接收的 ideaId 只是本次选择意图，必须重新读取目标的存在性、当前状态、当前 draft 和内部 current 标记。客户端 title/body/reference/version 均不作为事实；客户端携带的 expected 标记仅用于比较，Host 不信其正文。没有历史 pin 确认或从 recall 恢复目标。即使对话引用了别的 Idea，也只更新用户明确选择并确认的目标。

### 3.2 一次公开 surface 读取即可完成本方案来源

更新准备使用现有 `readSessionSurface → sessionQuery.readSurface`，**一次调用返回的完整 surface 作为唯一来源**，立即保存在 Host 操作内存中。官方 Harness `packages/session-query/session-query/src/index.ts:310` 明确从一次 corpus observation 返回 cloned header/current surface/inherited count。本方案不需要同时关联 raw Inbox，因此不引入原 P2B 的 raw/claim replay 或第二份正文。

显式校验当前 surface 上唯一的 finalized assistant/message、可用 text，以及 inherited 边界；不以 attempt/live chunk/tool-only 代替。按 surface 顺序只捕获至所选锚点；锚点前若含 seq 晚于锚点的 replacement，返回来源变化。继续使用 12 条 / 12,000 字符预算和既有截断，向预览显示有界范围/截断提示。较晚引用、隐藏内容、工具输出、插件 recall、历史搜索或其他 Session 都不补入正文。

这里承诺的是 Host 当前可见对话快照，不声称恢复了模型当时全部上下文或证明语义归属。读取失败或锚点不合法时不调用模型、不注册可提交票据。路由解析可以另外 observe **模型配置**；不得拿该读取的正文、cursor 或 raw 证明来源一致。capture 已固定后，后续对话追加不扩展该提案范围。

现有 `readSurface` 不接受 AbortSignal。取消发生于读取期间时，在读前/读后检查 signal，阻止后续模型调用、票据注册及迟到呈现；不承诺中断已经发生的底层只读 I/O。模型 stream 则继续传递真实 signal。为此不修改 Harness Core，也不使用另一份正文作取消兜底。

G0 的单 observation 经验保留，但 **不合入 G0 分支代码、不把 G-REFERENCE 当作 P2-Lite 前置 Gate**。未来正常新增路径须为上述单 surface 来源做聚焦测试，不冒称本轮已经验证运行时。

### 3.3 最小契约候选

只新增两个更新 RPC；名称待正常 Typert 生成，不提前手写生成产物：

| 入口 | 契约与约束 |
| --- | --- |
| 既有 `idea.prepareFromMessage` / `idea.create` | 新建保留，不增加目标参数，不接收更新票据，不破坏 Quick Capture。 |
| 候选 `idea.prepareUpdateFromMessage` | `{requestKey, sessionId, messageId, ideaId, expectedCurrentVersionId}`；Host 验证目标及期望标记，捕获一次来源，读 route，至多一次直接 stream，返回 `{updateId, targetSummary, draft, sourceStats}`。内部 entry 保存 Host 目标、base 标记/当前 draft、capture 和调用绑定。 |
| 候选 `idea.commitPreparedUpdate` | `{updateId, draft}`；目标/base 只从 Host entry 取。校验用户批准的完整 draft 后委托 `IdeaService.manualEdit`；返回 canonical 当前结果及 updated/no-change。不能把任意客户端 target/body/source 转为可信绑定。 |

不增加 inspect/candidate/select-token 多级链路，不新增 Session，不调用旧 continueDiscussion。只读库查询和目标确认均为零模型。

以 `buildIdeaEvolutionPrompt({currentDraft, historySummary: [], openQuestions: currentDraft.openQuestions, messages: captured.messages})` 生成提示，复用 route/stream/parser。当前 draft 和对话均作为不可信 JSON 证据，不提升为 System 指令。更新沿用完整 IdeaDraft schema；不机械复制新建讨论提取额外的 motivation 非空检查，因为已有 Quick Capture Idea 可以合法为空，模型不能因此编造证据。

## 4. 并发、无变化、重复与取消

1. **选择及生成前漂移：**get 展示的 current 标记与 Host 准备读取不一致，返回冲突、零模型；用户重新查看并明确生成。提示使用“内容已在其他地方更新”，不展示 vN/rebase。
2. **生成中漂移：**一次 stream 后再验证目标 current/status；已变更则不注册可提交预览，报告冲突；不自动 rebase 或补第二次模型调用。该情形可能已经使用一次模型。
3. **保存前漂移：**无论草稿是否恰与最新内容相同，都由 entry 的原始 base 调 manualEdit；保留原队列的 stale-before-noop 规则，不在 Client 或 handler 先判无变化绕过并发保护。
4. **无变化：**按既有 schema 规范化及 manualEdit 比较，零持久写、零 current 标记变化、零时间变化、零来源/事件/索引写入；显示“内容无变化”。不得为返回成功而额外改 updatedAt。无变化结果也消费该提案的提交资格。
5. **重复生成/保存：**Client 单 flight；Host 对相同 requestKey 且相同绑定的准备并发 join，不多次 stream。不同绑定复用 key 拒绝。更新票据独立于新建 preparation，限定为更新操作；保存以 updateId + 规范化 payload 绑定 flight/receipt，相同 payload join/重放原结果，不同 payload 拒绝。两个提案同 base 至多一个有变化更新成功，另一个冲突。
6. **内存与重启边界：**票据/receipt 采用 64 项、30 分钟的有界内存策略，活动 flight 不驱逐；全为活动项时拒绝新准备。已知成功 receipt 重放前不重新调用 manualEdit；不得把已驱逐/重启丢失的票据视为新请求。没有跨重启 exactly-once 声明，不增加 durable receipt。
7. **取消：**准备态取消、关闭、Escape、正常遮罩、导航/Session 卸载接通真实 AbortController；取消后不注册可提交结果、不写 Idea。旧 generation/target/Session 的迟到响应不能打开或覆盖新弹窗。沿用开窗双击遮罩保护。切换目标/模式使旧提案失效，不能带原 draft 自动保存给新目标。
8. **提交边界：**真正提交前取消是零写；进入 manualEdit 写入队列后没有回滚式 abort 保证，提交中关闭/取消沿用现有禁用语义。网络断开不等于未保存，需保留相同 updateId/payload 和结果未确认状态，不能重准备后自动再写。
9. **失败：**已知校验/版本/生命周期拒绝零写并保留草稿；一般 Storage/网关未知结果不作为成功或安全重试证明，标记结果未确认并刷新当前内容核对，不盲目再调用 writer。只在可证明未写时允许同票据显式重试，不能自动调用模型修复。

现有 `get` 是普通只读快照，**不暴露 private deleting admission 状态**。推荐 A 不为此修改域服务；删除已经准入但尚未完成时，prepare 可能仍花费一次模型，最终 manualEdit 仍按既有 deleting/存在性/队列拒绝。不能声称“所有 deleting 竞态均在模型前零调用”。如审查要求这种更强预防，需另行确认新增只读可编辑性 gate 的范围，不能读取私有集合或先调用无变化 manualEdit 探测。

## 5. Client 收口：一份当前内容

灯泡「总结」立即打开同一弹窗，先选择「保存为新 Idea / 更新已有 Idea」；此时零模型、无 preparationId。更新模式显示库 picker 与所选当前内容摘要。用户点击「生成草稿」才启动对应的一次准备；准备态原位转为可编辑预览，最终按钮分别为「保存新 Idea」/「确认更新」。本交互增加一次明确生成动作，用于避免先按新建生成、切换更新后又花一次模型；不是偷偷改变已有生成结果的保存目标。

已有提案切换目标/模式，先确认放弃未保存草稿，取消/丢弃后由用户再次明确生成，不自动再调用模型。错误保留当前编辑；成功刷新库与详情，只渲染更新后的当前内容。

后续最小 UI 收口：

- 列表、详情、hover、普通手工编辑只显示当前内容，去掉版本历史区、用户可见 ordinal、历史选择及“保存为新版本”提示；普通编辑保存改为“保存”。
- 隐藏专用「讨论」和「生成演化提案」入口，不新增专用会话；停止新详情页的 getVersions 和旧 readiness 后台请求。旧讨论/演进后端、历史 RPC 和已有 Session 数据保留，仅停止从新 UI 触达旧流程。
- 保留编辑、归档/恢复/删除、提醒 Switch、Quick Capture、相关 Idea、`+ → Idea`、Prompt V2，以及 P1 不显示关联卡片的结果；不顺带移除后端或做领域重命名。
- 新增 `+ → Idea` 仍按现有 canonical 机制引用当时当前内容。旧 pin 和旧对话记录不改写、不静默改绑当前内容；历史引用只是既有对话引用事实，不恢复成新 Idea 库的多版本浏览器。**更新目标始终来自本次库选择，不来自 pin。**
- 明暗主题、窄窗口、键盘选择、选择/加载/空库/无变化/冲突反馈遵循现有视觉语言。已有编辑返回/取消的未保存确认与 IME 列表行为保持。

## 6. 待独立审查的技术取舍与退出条件

产品方向不再待定；以下实现选择须审查后才能开工：

| 项目 | 推荐与限制 |
| --- | --- |
| 新更新来源持久化 | 选 A 复用 manualEdit，接受新来源仅临时保存、旧来源不删除；若需新来源审计则改审 B，不能在实施时悄悄扩大。 |
| 单 surface 来源 | 不做 raw 自动归属；一次 readSurface + 强化锚点前置校验，须聚焦验证 live/cold/fork/replacement/truncation/取消。 |
| 一个额外生成动作 | 先选模式/目标再生成，杜绝切换目标隐式双调用；复用现有即时反馈与真实取消。 |
| 删除与未知提交 | 删除中准备可能消耗一次模型；提交原保护不变。未知结果采用保守核对；无跨重启强幂等。 |
| 兼容面 | 新 UI 停止旧用户演进流程，旧 schema、版本/来源/事件、RPC、后端与已存在引用保持；不迁移或清理。 |

实施范围、未来回归矩阵与停止条件详见配套 Instructions。本轮只读核查源码/已有测试并提交文档，未运行测试或构建，未启动浏览器/Web，Provider 请求为 0，未读取或修改真实 Profile。未修改产品、Storage、Harness Core 或任何用户数据。未开始原 P2B 或 P2-Lite 实施，未合并 main。
