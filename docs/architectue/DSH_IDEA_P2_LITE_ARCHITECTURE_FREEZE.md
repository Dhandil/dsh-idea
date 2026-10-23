# P2-Lite Architecture Freeze 候选：当前 Idea 内容更新

状态：`DSH_IDEA_P2_LITE_REPAIR_READY_FOR_FINAL_REVIEW`。**独立审查已主体接受；本轮只修订 AI 更新的持久讨论来源及配套 opt-in 原子无变化保护，等待最终审查，不是实施授权。** 日期：2026-10-23。审查参照：`241fc0b93e1f3d4f2393b3fd9f16f023e8d94d0a`；唯一阻塞项为 AI 更新缺少持久讨论来源，原方案仅临时保存更新来源的取舍已撤回。

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
| `src/service.ts:310`、`:479`、`:885` | manualEdit 做 schema 规范化、同 Idea 队列、expected current 校验；当前基线相同且内容无变化时提前零写返回；变化时追加内部记录并更新当前指针。 | **普通手动编辑继续使用，契约不变。** AI 更新复用相同比较规则和队列保护，但不通过 manualEdit 丢失本次来源。 |
| `src/remote-host/service.ts:452` | manualEdit 返回 canonical current 标记及 `committed`；无变化返回 false。 | 普通手工编辑保留；AI 更新由独立 Host 票据绑定来源，提交至 opt-in evolve。 |
| `src/preparation/service.ts:70`、`context.ts` | 新建从指定 assistant 锚点向前取 12 条 / 12,000 字符，只取 human/assistant 可见 text；一次直接提取，Host registry 保存来源。 | 新建 prepare/create 语义和来源留存不改；更新复用捕获规则与提取管线，不先生成新建草稿再调用一次更新模型。 |
| `src/preparation/pipeline.ts` | readSurface 读当前 surface；路由优先 Session selection 再 Host default；一条直接 stream，无 Agent Loop/工具/隐藏重试，接入 AbortSignal。 | 两种模式复用同一路由、取消和错误分类。 |
| `src/evolution/prompt.ts` | 输入 currentDraft、historySummary、openQuestions、messages；JSON 证据作为不可信背景，保留讨论未否定内容，只输出完整 IdeaDraft。 | 复用纯 Prompt builder，传 **空 historySummary**；只纳入目标当前内容与此次 bounded capture，不带旧版本摘要。内部函数名不要求本轮重构。 |
| `src/evolution/service.ts:101,198`、`src/service.ts:557` | 旧 prepare 依赖专用 IdeaDiscussion 和全讨论 surface；旧 commit 调域 evolve。域 evolve 已把 source、内部记录和事件放在同一 aggregate 写入，但没有无变化短路。 | 不调用旧讨论 prepare/commit、不伪造 discussionId；**直接复用域 evolve，新增默认关闭的无变化选项，仅新 AI 更新启用。** |
| `src/evolution/registry.ts`、`src/preparation/registry.ts` | 内存 64 项 / 30 分钟；前者成功消费后不保留结果 receipt，后者没有更新目标绑定。 | 复用限额和临时 registry 设计，新增轻量更新票据；不直接混用新建 preparationId，避免误入 create。 |
| `src/remote-host/service.ts:search`、`src/search/service.ts` | 当前内容的本地确定性词法搜索，不调用 embedding 或模型；scope=current 排除归档。 | picker 复用 list/search/get；不用 Related Judge 或 semantic 检索识别目标。 |
| `src/client/state.ts`、`IdeaSaveDialog.tsx` | 立即显示 pending、真实 abort、迟到结果保护、同弹窗转预览、保存失败保留草稿、开窗双击遮罩保护。 | 扩展模式/目标选择阶段，复用后续准备与预览体验。不得用假 preparationId 代表选择或准备态。 |
| `src/client/IdeaSection.tsx:397–642`、`read-state.ts:open/runVersions/runReadiness`、`locales.ts` | 详情仍展示历史、讨论、演化提案；打开详情另取历史和 readiness；手工编辑文案为“保存为新版本”。 | 后续 UI 收口须移除旧版本展示/演化入口及无用后台读取，手工保存文案改为“保存”；保留 current 详情、编辑与生命周期操作。 |
| `tests/lifecycle.spec.ts`、`remote-lifecycle.spec.ts`、`client-lifecycle.spec.tsx` | 已有 no-op 字节不变、冲突、归档、失败草稿保留及离开确认断言。 | 后续沿用断言；用户版本界面预期按新决策更新，后端旧接口兼容测试保留。 |

### 2.1 修订后的唯一方案：AI 更新持久来源，手工编辑契约不变

普通手动编辑继续调用原 `manualEdit`，沿用 `manual-edit`、无新来源的既有语义。**AI 辅助更新经用户明确确认且内容有变化时，必须调用域 `IdeaService.evolve`，在一次 aggregate 更新中保存一份 Host 本次捕获的 SourceDiscussion、一份新的内部内容记录及一条事件。** 当前记录的 `sourceDiscussionIds` 精确引用这份新来源，旧版本、来源、事件保持不变。新 UI 仍仅展示当前内容，不增加版本操作。

使用现有 `SourceDiscussionDraft` / `SourceDiscussion` schema，source 从 Host 票据中取得：真实逻辑 Session、实际 assistant 锚点、捕获 startSeq/endSeq 和交给模型的规范化有界 messages。Client 只提交 `updateId + draft`，不能提供或替换可信来源正文/ID/范围。保存时不重新读取更晚的 Session，不把目标当前 draft、历史来源、recall、工具输出混入本次对话快照，不复制旧来源充当新出处。用户编辑预览 draft 不改变这份已固定的讨论来源。

内部 reason 使用既有 `continued-discussion`，不增加 reason 或 AI 标记；它表示本次普通对话产生内容更新，不要求持久 `IdeaDiscussion` 绑定。**SourceDiscussion 是来源快照，不是专用讨论会话。** `capturedAt` 沿用 evolve 的提交时钟语义，内容在 prepare 时固定；不据此宣称它是底层 Session 的精确读取时间。不新增表、Storage 字段、Migration、Session 或 Agent Loop。

无变化是零写结果，不构成一次内容更新，因此不追加本次来源、内部记录或事件。取消、未确认、冲突或失败也不单独存来源；有变化更新的内容与来源必须同次成功或同次失败，不能先存来源再调 writer。原“仅临时保存来源”的方案不再是可选实施路径。

### 2.2 opt-in 原子无变化保护（待实现契约）

建议只给域 evolve 增加兼容的第六个可选参数 `options?: { skipUnchanged?: boolean }`，返回值仍为 `Promise<IdeaAggregate>`。省略或 `false` 完全保留旧语义：即使相同 draft 也按旧规则追加来源、内部记录和事件。只有新 AI 更新 Host 入口固定传 `{ skipUnchanged: true }`；Client 不能控制此选项，旧 discussion commit 不传入，manualEdit 不改。

启用时的操作顺序必须在 **既有 `enqueueIdeaMutation` 的同一个队列槽** 内完成：

1. 维持原 draft/source schema 校验、删除准入及权限/生命周期边界；读取 canonical aggregate，验证 expected current 与 Host 票据 base 一致。对于有效输入，**版本冲突必须先于无变化判断**，不能因草稿等于最新内容而返回 no-change。
2. 用既有 schema 规范化后的完整 IdeaDraft 和 canonical current draft 按同一字段/列表顺序规则比较。新来源或新的捕获时间不参与“内容是否变化”的判定；仅有新讨论证据但内容相同仍是 no-change。
3. 相同则直接返回 detached canonical aggregate，**在调用 `mutate` / `records.update` 之前退出**，不分配新版本/来源/事件 ID，不变更时间，不触发持久化或索引写。不能只在 update transform 中返回原对象并声称零写。
4. 有变化则在同一队列槽内继续原 evolve 的单 aggregate 写入，由既有 `mutate` 再次核对 expected current，原子追加 source、内部记录和事件。不能离开队列后再调公开 evolve 形成检查/写入窗口，也不能嵌套进入同一 mutation 队列。

保护必须位于域 writer，不以 handler/Client 的预判代替。`commitPreparedUpdate` 用 evolve **返回的** current 标记与 entry.base 比较形成 updated/no-change 及 receipt，不额外重读可能已被下一次操作改变的 current 结果。旧五参数 evolve、显式 false、旧 Remote/演进服务和普通 manualEdit 的行为及返回契约分别做回归。

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
| 候选 `idea.commitPreparedUpdate` | `{updateId, draft}`；目标/base/source 只从 Host entry 取。校验用户批准的完整 draft，调用 `IdeaService.evolve(ideaId, draft, source, base, 'continued-discussion', { skipUnchanged: true })`；有变化时原子保存本次来源，返回 canonical 当前结果及 updated/no-change。不能把任意客户端 target/body/source 转为可信绑定。 |

不增加 inspect/candidate/select-token 多级链路，不新增 Session，不调用旧 continueDiscussion。只读库查询和目标确认均为零模型。

以 `buildIdeaEvolutionPrompt({currentDraft, historySummary: [], openQuestions: currentDraft.openQuestions, messages: captured.messages})` 生成提示，复用 route/stream/parser。当前 draft 和对话均作为不可信 JSON 证据，不提升为 System 指令。更新沿用完整 IdeaDraft schema；不机械复制新建讨论提取额外的 motivation 非空检查，因为已有 Quick Capture Idea 可以合法为空，模型不能因此编造证据。

## 4. 并发、无变化、重复与取消

1. **选择及生成前漂移：**get 展示的 current 标记与 Host 准备读取不一致，返回冲突、零模型；用户重新查看并明确生成。提示使用“内容已在其他地方更新”，不展示 vN/rebase。
2. **生成中漂移：**一次 stream 后再验证目标 current/status；已变更则不注册可提交预览，报告冲突；不自动 rebase 或补第二次模型调用。该情形可能已经使用一次模型。
3. **保存前漂移：**无论草稿是否恰与最新内容相同，都由 entry 的原始 base/source 调 opt-in evolve；按第 2.2 节在同一域队列内先校验基线再比较内容，不在 Client 或 handler 先判无变化绕过并发保护。
4. **无变化：**opt-in evolve 复用既有 schema 规范化与 manualEdit 的内容比较规则，但独立保留其旧契约；零持久写、零 current 标记变化、零时间变化、零来源/事件/索引写入；显示“内容无变化”。不得为保存新讨论或返回成功而额外改 updatedAt。无变化结果也消费该提案的提交资格。
5. **重复生成/保存：**Client 单 flight；Host 对相同 requestKey 且相同绑定的准备并发 join，不多次 stream。不同绑定复用 key 拒绝。更新票据独立于新建 preparation，限定为更新操作；保存以 updateId + 规范化 payload 绑定 flight/receipt，相同 payload join/重放原结果，不同 payload 拒绝。两个提案同 base 至多一个有变化更新成功，另一个冲突。
6. **内存与重启边界：**票据/receipt 采用 64 项、30 分钟的有界内存策略，活动 flight 不驱逐；全为活动项时拒绝新准备。已知成功 receipt 重放前不重新调用 evolve，不重复追加来源；不得把已驱逐/重启丢失的票据视为新请求。没有跨重启 exactly-once 声明，不增加 durable receipt。有变化更新已成功保存的来源不依赖临时票据存活，重启后仍可从既有持久 aggregate 读取。
7. **取消：**准备态取消、关闭、Escape、正常遮罩、导航/Session 卸载接通真实 AbortController；取消后不注册可提交结果、不写 Idea。旧 generation/target/Session 的迟到响应不能打开或覆盖新弹窗。沿用开窗双击遮罩保护。切换目标/模式使旧提案失效，不能带原 draft 自动保存给新目标。
8. **提交边界：**真正提交前取消是零写；进入 evolve 写入队列后没有回滚式 abort 保证，提交中关闭/取消沿用现有禁用语义。网络断开不等于未保存，需保留相同 updateId/payload 和结果未确认状态，不能重准备后自动再写。
9. **失败：**已知校验/版本/生命周期拒绝零写并保留草稿；一般 Storage/网关未知结果不作为成功或安全重试证明，标记结果未确认并刷新当前内容核对，不盲目再调用 writer。只在可证明未写时允许同票据显式重试，不能自动调用模型修复。

现有 `get` 是普通只读快照，**不暴露 private deleting admission 状态**。本次域改动仅限第 2.2 节 opt-in 保护，不新增删除状态读取；删除已经准入但尚未完成时，prepare 可能仍花费一次模型，最终 evolve 仍按既有 deleting/存在性/队列拒绝。不能声称“所有 deleting 竞态均在模型前零调用”。如审查要求这种更强预防，需另行确认新增只读可编辑性 gate 的范围，不能读取私有集合或调用 writer 探测。

## 5. Client 收口：一份当前内容

灯泡「总结」立即打开同一弹窗，先选择「保存为新 Idea / 更新已有 Idea」；此时零模型、无 preparationId。更新模式显示库 picker 与所选当前内容摘要。用户点击「生成草稿」才启动对应的一次准备；准备态原位转为可编辑预览，最终按钮分别为「保存新 Idea」/「确认更新」。本交互增加一次明确生成动作，用于避免先按新建生成、切换更新后又花一次模型；不是偷偷改变已有生成结果的保存目标。

已有提案切换目标/模式，先确认放弃未保存草稿，取消/丢弃后由用户再次明确生成，不自动再调用模型。错误保留当前编辑；成功刷新库与详情，只渲染更新后的当前内容。

后续最小 UI 收口：

- 列表、详情、hover、普通手工编辑只显示当前内容，去掉版本历史区、用户可见 ordinal、历史选择及“保存为新版本”提示；普通编辑保存改为“保存”。
- 隐藏专用「讨论」和「生成演化提案」入口，不新增专用会话；停止新详情页的 getVersions 和旧 readiness 后台请求。旧讨论/演进后端、历史 RPC 和已有 Session 数据保留，仅停止从新 UI 触达旧流程。
- 保留编辑、归档/恢复/删除、提醒 Switch、Quick Capture、相关 Idea、`+ → Idea`、Prompt V2，以及 P1 不显示关联卡片的结果；不顺带移除后端或做领域重命名。
- 新增 `+ → Idea` 仍按现有 canonical 机制引用当时当前内容。旧 pin 和旧对话记录不改写、不静默改绑当前内容；历史引用只是既有对话引用事实，不恢复成新 Idea 库的多版本浏览器。**更新目标始终来自本次库选择，不来自 pin。**
- 明暗主题、窄窗口、键盘选择、选择/加载/空库/无变化/冲突反馈遵循现有视觉语言。已有编辑返回/取消的未保存确认与 IME 列表行为保持。

## 6. 定点修订与最终审查边界

主体及产品交互保留独立审查的接受结论；本轮仅提交下列来源修复及其必要回归，最终审查通过前仍不实施：

| 项目 | 推荐与限制 |
| --- | --- |
| 新更新来源持久化 | 有变化的 AI 更新必须通过 opt-in evolve 原子保存本次 Host SourceDiscussion；不接受仅临时保存或调用 manualEdit 丢弃来源。普通手工编辑保持 manualEdit。 |
| 原子无变化与兼容 | 同一域队列内冲突优先、相同内容在 records.update 前直接返回；旧 evolve 默认追加及 manualEdit 契约不变。新增来源正确性、零写、并发及兼容回归。 |
| 单 surface 来源 | 不做 raw 自动归属；一次 readSurface + 强化锚点前置校验，须聚焦验证 live/cold/fork/replacement/truncation/取消。 |
| 一个额外生成动作 | 先选模式/目标再生成，杜绝切换目标隐式双调用；复用现有即时反馈与真实取消。 |
| 删除与未知提交 | 删除中准备可能消耗一次模型；提交原保护不变。未知结果采用保守核对；无跨重启强幂等。 |
| 兼容面 | 新 UI 停止旧用户演进流程，旧 schema、版本/来源/事件、RPC、后端与已存在引用保持；不迁移或清理。 |

实施范围、未来回归矩阵与停止条件详见配套 Instructions。本轮只读核查源码/已有测试并提交文档，未运行测试或构建，未启动浏览器/Web，Provider 请求为 0，未读取或修改真实 Profile。未修改产品、Storage、Harness Core 或任何用户数据。未开始原 P2B 或 P2-Lite 实施，未合并 main。

本次在已审查提交之上只修订两份 P2-Lite 文档，不再改原 P2A 的覆盖标记或历史正文。上述 evolve 选项和新原子保护均为待实现设计，不描述为现有能力；旧源码缺少该保护的历史事实保留。
