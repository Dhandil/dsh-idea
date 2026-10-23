# P2-Lite Implementation Instructions 候选

状态：`DSH_IDEA_P2_LITE_REPAIR_READY_FOR_FINAL_REVIEW`。**主体已独立接受；本轮只修复 AI 更新的持久来源阻塞及配套 opt-in 原子无变化保护，等待最终审查，不是开工指令。** 日期：2026-10-23。源码核查基线 `d36325aed1373a9a2dedeced8e367a5bb32e6395`，修订参照 `241fc0b93e1f3d4f2393b3fd9f16f023e8d94d0a`。

唯一新设计依据：[P2-Lite Architecture Freeze 候选](../architectue/DSH_IDEA_P2_LITE_ARCHITECTURE_FREEZE.md)。原 P2A/原 P2B 自动引用归属及用户多版本流程已被新产品决策覆盖；G0 证明分支不合并。本文只列未来范围与验证设计，本轮不修改或测试产品。

## 1. 最小实施范围（持久来源修订）

| 顺序 | 候选范围 | 要求 |
| --- | --- | --- |
| 0 | 独立最终审查 | 主体交互保持；确认本次 evolve + SourceDiscussion 持久来源及 opt-in 原子零写保护，未最终接受不实施。原仅临时来源方案已撤回。 |
| 1 | 新增小型 Host update preparation/registry，例如 `src/preparation/update.ts`、`update-registry.ts` | 绑定明确目标/current 标记、一次 Host SourceDiscussionDraft、一个生成 flight、独立更新票据；不混入新建 preparation 或旧 discussion/evolution registry。沿用 64 项/30 分钟有界设计；有变化提交时通过既有 aggregate 持久化该来源。 |
| 2 | `src/preparation/context.ts` 的最小可复用校验/辅助；`pipeline.ts` 必要接线 | 官方 readSurface 一份 detached 来源；唯一有 text 的 finalized 锚点、inherited/未来 replacement 检查、既有 12/12,000 预算。不要复制并悄悄改变原新建捕获规则；新规则可限新更新入口。路由读取不提供第二份来源正文。 |
| 3 | 复用 `src/evolution/prompt.ts`、现有 parser、route、extractModelText | currentDraft + 空 historySummary + bounded messages；一次直接调用，零分类、零工具、零隐藏重试。更新不套用新建特有 motivation 非空门。旧 Evolution Prompt/服务调用者兼容。 |
| 4 | `src/remote-host/service.ts`、`types.ts`、必要错误映射及正常 Typert 生成 | prepareUpdateFromMessage / commitPreparedUpdate 两个薄入口；只读 list/search/get 复用。target/base/source 由 Host 绑定；AI commit 唯一委托域 evolve，固定启用 skipUnchanged，以既有 continued-discussion reason 保存本次来源。普通手工编辑继续 manualEdit。新增 requestKey/receipt 内存保护，不伪造既有 preparationId。 |
| 4a | `src/service.ts` 的 evolve 可选参数和同队列保护；域聚焦测试 | 只扩展默认关闭的 skipUnchanged；使用现有 schema、sameIdeaDraft、enqueueIdeaMutation 和 mutate，冲突优先，无变化在 records.update 前直接返回。旧 evolve 默认及 manualEdit 契约不变，不新增 writer 或表。 |
| 5 | `src/client/state.ts`、`IdeaSaveDialog.tsx`、`IdeaAssistantActions.tsx`、`slots.ts`、`index.ts`、locale/styles 必要增量 | 立即选择态 → 目标 picker → 准备态 → 同窗可编辑预览 → 明确提交。按 operation generation 防迟到，复用真实 abort 和双击保护，不自动模型调用。可新建一个小 picker；不重构无关客户端。 |
| 6 | `IdeaSection.tsx`、`read-state.ts`、必要 locale/styles | 当前内容单一投影；隐藏历史/演化/专用讨论入口，停止对应详情后台读取；“保存为新版本”改为“保存”。保留内部 current 标记及旧后端类型，清理仅依赖失效 UI 的状态/样式，不删除域服务。 |
| 7 | focused Host/Client tests + 隔离浏览器 | 按第 3 节矩阵，typecheck、Host/Client build；受控模型替身，真实 Provider 0。完成后清理任务资源，报告交审，不自行合并 main。 |

**域 writer 的必要增量仅限 4a**：AI 更新不能继续走会丢失新来源的 manualEdit，也不能全局改变旧 evolve。复用现有 SourceDiscussionDraft/SourceDiscussion 类型，不改持久 types/schema、Storage domain version、表、Migration 或 reason 枚举。若还需新增这些持久结构、专用讨论、新 Agent Loop 或扩大 writer 范围，先停止并提交设计差异，不读取私有 Harness 状态。

候选路径只是模块范围，不要求为了文件名拆分/重命名现有服务。已接受功能的测试依赖保持；不移植 PERF-C2C/P0/P0R 驱动或 G0 三份证明 helper。

## 2. 操作与安全语义核对

### 2.1 明确操作决定模型预算

- 打开灯泡总结选择态、库查询、选择目标、取消：零模型、零 durable Idea 写。
- 用户确认“生成草稿”：新建或更新恰走一条 pipeline；成功准备至多一次 stream，不先调用新建再调用更新。
- 相同 requestKey + 相同参数 join 原 flight；同 key 不同参数拒绝。失败后重新生成必须是用户明确动作，不自动重试。
- 模式/目标变化 abort 旧 flight，使其票据/结果不再能提交到另一目标；用户编辑草稿有离开确认。
- 准备只读取/生成，任何取消或合法失败均不保存；提交中不能承诺 abort 回滚。

### 2.2 Host 更新票据

entry 至少绑定 `updateId/requestKey`、session/assistant anchor、明确选择的 ideaId、Host base 标记、Host current draft、Host SourceDiscussionDraft、创建时间和操作状态。票据本身仅内存；有变化的已批准更新必须把其中来源通过 evolve 存入既有 aggregate，不能在票据过期/消费后丢失更新出处。Client 仅收到目标摘要、草稿和范围统计，不能回传或覆盖可信来源正文、锚点或范围。

保存 state machine 区分 prepared / committing / committed / 已知失败 / 结果未确认。相同规范化 payload 的并发/成功重放使用原 flight/receipt；不同 payload 拒绝。有限 TTL/驱逐或重启使 entry 不可用时返回过期/结果需核对，不恢复为可执行新写。活动 flight 不驱逐；无容量时拒绝新 prepare。不得照搬现有 create 的不同 payload 无区分行为作为新契约。

AI 更新提交只用 Host target/base/source 调 `IdeaService.evolve(..., 'continued-discussion', { skipUnchanged: true })`，不调用依赖旧 discussion 的 EvolutionService.commit，不转调 manualEdit。返回 no-change 也记录票据结果，不能保留一张可换 payload 再写的已完成票据。updated/no-change 必须从 writer 返回的 aggregate 判定，不另读已可能漂移的 current。提交结果未知时不清空票据再自动重写。新建路径继续用既有 preparation/create，不接受 updateId；更新不接受旧 discussion proposal。

### 2.3 当前内容与兼容数据

保留现有内部 currentVersionId、不可变旧记录和乐观并发。新库/详情/编辑不呈现版本管理操作；不为“当前内容”新增表或原地覆盖历史记录。

普通手工编辑保持 manualEdit 的 manual-edit reason 和不新增来源语义；其后旧来源仍留存，但不伪造为这次手工编辑的出处。AI 更新有变化时，用既有 continued-discussion reason，在一个 aggregate update 中追加一份本次 SourceDiscussion、一份内部内容记录及一条事件，current sourceDiscussionIds 只引用该次 Host 新来源，旧数据不删。当前内容详情的 source 应指向本次真实 Session/assistant 锚点，不能显示旧来源或别的目标来源。

来源必须与本次模型输入的 bounded messages 一致，并保存 Host 确定的 sessionId、anchorMessageId、startSeq/endSeq；不在提交时重新捕获追加的消息，也不把当前 Idea baseline 当作对话正文。capturedAt 仍按既有 evolve 在提交时赋值。无变化、未批准、取消或冲突时零来源追加。SourceDiscussion 只是快照，不创建 IdeaDiscussion 或会话。仅 UI 隐藏旧历史/演化流程，旧 getVersion/getVersions、讨论和演进 RPC 继续兼容。旧 Session 可以经 Harness 正常会话入口打开。

普通 `+ → Idea` 的固定 pin、一次上下文注入和 untrusted data 规则保持；旧 pin 不自动升级为当前内容。无引用/多引用/旧引用与 picker 的资格无关，用户仍须明确选目标。新路径不做 canonical/Inbox/recall 归属恢复，不向用户历史补造绑定事件。

### 2.4 原子无变化保护的实现约束

以 Freeze 第 2.2 节为准，新增的第六个可选 options 参数省略或 false 时严格保持旧 evolve 的追加行为、错误边界和 aggregate 返回类型；不要给旧 Remote/旧 discussion commit 自动开启。普通 manualEdit 签名、来源语义和既有测试不改。

对启用路径：保持 draft/source 校验及原删除准入保护；进入既有 per-Idea mutation 队列后读 canonical state，先校验 expected base，再按现有 sameIdeaDraft 比较规范化 current draft。相同即返回 detached aggregate，不调用 records.update/mutate，不分配新 ID，不修改时间或索引。新 source 不参与内容比较，否则每次对话不同都会错误地追加空更新。

有变化才在同一队列槽继续既有 evolve 的单 aggregate mutate，由其 CAS 再验证后追加来源、内部记录和事件；不先写 source、不先 manualEdit、不在队列外先判 no-op，也不嵌套入队造成死锁。handler 或 Client 的 UI 比较只能用于反馈，不能代替域级 gate。若实现需要大改通用 mutate 或 Storage 的无变化语义，停止提交设计差异。

## 3. 未来聚焦回归矩阵（本轮均 NOT RUN）

| 编号 | 场景 | 预期 |
| --- | --- | --- |
| L01 | 空库、无引用、长对话、多引用、旧 pin | 新建可用；有可编辑目标时可主动选库更新；无自动预选、无识别模型。 |
| L02 | 库 list/search/get 与同标题多 Idea | 本地当前内容查询；用户点选确切 ID；空/错误/迟到搜索结果不替换已选目标。 |
| L03 | 伪造 Client title/body/base/source、陌生 updateId | Host 重读并绑定；不信 echo；不跨目标/新建/旧 proposal 提交。 |
| L04 | 选择后目标被删除/归档，base 漂移 | 可见存在性/状态/版本变化在 prepare 前拒绝，零模型；pending deleting 的已知预防边界如 Freeze，不读取 private 状态。 |
| L05 | 生成中/预览后/保存队列内漂移 | 一次模型后如有漂移不自动重拟；commit CAS 冲突且零部分写，用户编辑保留。 |
| L06 | 单 surface、live/cold、同 cursor 不同内容的独立读取 | 内容来自一次 readSurface；不拼 raw 或另一份正文，不依赖 cursor 相等；Host capture 固定。 |
| L07 | 缺失/重复锚点、attempt/chunk、tool-only、inherited 锚点 | 只接受真实有 text 的合法锚点；非法来源零模型/提交票据。 |
| L08 | fork 本地锚点、compaction、未来 replacement | 来源属于当前逻辑 Session；只按当前 surface 捕获，未来 replacement 触发拒绝；不从隐藏 raw 恢复正文或旧 pin。 |
| L09 | 锚点之后内容、超预算和截断 | 12 条/12,000 字符及原规范化；不包含未来内容，显示范围/截断；不宣称讨论语义属于选中目标。 |
| L10 | 当前 Idea 字段未被讨论否定、空 motivation、恶意正文 | Prompt 含正确 Host 当前 draft，不含历史摘要；合法空字段不伪造；Idea/对话作为不可信数据，严格 parser。模型质量须另评，不靠替身宣称已证实。 |
| L11 | 单次准备、重复点击、同 requestKey 并发、失败 | 至多一条直接 stream；不增加分类、Agent/Judge、工具或隐藏重试；请求不同绑定复用 key 拒绝。 |
| L12 | 准备/预览取消，关闭/Escape/遮罩，快速双击 | stream 真 abort、无写；无 signal 的 readSurface 期间取消阻止读后的模型/注册，不承诺底层 I/O 中断。第二击不误取消刚打开 Modal，后续正常遮罩仍可关闭。 |
| L13 | 导航、Session 切换、卸载、切目标/模式、迟到响应 | generation/绑定防串状态，无重开、无误保存；新生成须用户动作。 |
| L14 | 明确确认前后 | 准备和预览零 Idea 写；有变化的确认更新同次原子新增本次来源、内部记录和事件各一项，仅改变选中目标；旧记录不删除，列表仍一 Idea 一行。 |
| L15 | 无变化、规范化等价、列表顺序变化 | 前两者在域 opt-in 路径内零 records.update/持久 put 调用，存储字节、current 标记、updatedAt、内部记录、来源、事件、索引均不变；返回 no-change。列表顺序变化依既有语义视为变化，有变化时来源正确关联。 |
| L16 | 与当前相同但 base 已陈旧 | 冲突优先于无变化；不能用 no-op 绕过 CAS。 |
| L17 | 同票据同 payload 并发/重放、不同 payload、两个票据同 base | 同 payload join/同 receipt，其他按绑定/冲突拒绝；有变化更新的内部记录/本次来源/事件各最多新增一项。no-change 票据同样消费提交资格，不可换 payload 再写。 |
| L18 | Storage 失败、响应丢失、Host 重启、TTL/驱逐 | 区分已知未写和结果未确认；保留草稿，不自动新 prepare/再写；有变化的成功更新重启后仍可读本次来源及引用，不依赖内存票据；无跨重启 exactly-once 承诺。 |
| L19 | UI 当前内容、普通手工编辑 | 无版本列表/ordinal/“保存为新版本”；编辑/返回/取消/未保存确认正常；无 getVersions/旧 readiness 背景调用。 |
| L20 | 新建、Quick Capture、+ 引用、Related、提醒、归档/恢复/删除、Prompt V2、P1 | 原语义保持；新建来源保存不丢，普通注入不重复，G0 不导入，旧讨论 Session/RPC 和底层历史读取兼容。 |
| L21 | 浅/深色、窄窗口、键盘、IME 列表及长文本 | 复用 UX-A 表单，模式/目标/预览/冲突均可访问，不回退既有交互保护。 |
| L22 | Host 来源正确性及防伪造 | 从已固定 Host capture 逐字段核对 sessionId/anchor/start/end/capturedContext，与实际模型 bounded messages 一致；提交前追加别的消息或 Client 伪造来源均不能替换。来源归属选中目标，current sourceDiscussionIds 引用新增快照；不混入 baseline、recall、工具或其他 Session。 |
| L23 | 相同 draft + 不同来源/时间，opt-in 与旧默认对照 | skipUnchanged=true 仍是零写，连新来源都不单独保存；旧五参数及显式 false 的 evolve 按原语义各新增来源/内部记录/事件，即使 draft 相同；manualEdit 仍为原 no-op/无新来源语义。 |
| L24 | 队列竞争与冲突优先 | 两个 AI 更新同 base、AI 与手动编辑/归档/删除竞争；用受控屏障验证 no-op 检查和写入在同一槽。较早变化使后续 stale 请求报 conflict，不能因等于最新内容转 no-change；较早合法 no-op 不阻止后续合法变化。不死锁、不重复/孤立来源。 |
| L25 | 来源与内容单次原子提交、旧接口兼容 | 有变化走一次 aggregate update，来源/内部记录/事件同时可见；受控已知写前失败零部分写，结果不确定时不宣称已回滚。验证旧 EvolutionService/Remote、manualEdit、新建、Quick Capture 的签名/返回/默认行为不变，无 schema/domain version/Migration 变化。 |

已有相关测试：`service.spec.ts`、`lifecycle.spec.ts`、`remote-lifecycle.spec.ts`、`client-lifecycle.spec.tsx`、`preparation-context.spec.ts`、`preparation-service.spec.ts`、`client.spec.tsx`、`client-read.spec.tsx`、`client-evolution.spec.tsx`、`evolution.spec.ts`、`remote-evolution.spec.ts` 及相关引用/Quick Capture 测试。新增 AI 更新聚焦用例覆盖 L22–L25，特别为域 evolve 的 opt-in/default 做直接调用对照，不能只验证 handler。实施时只选择受影响子集，不把本清单视为要求本轮重跑全量。UI 旧演化用例改为“新 UI 不呈现旧入口”的预期；后端兼容断言继续验证。

未来最小浏览器验收：隔离 DSH_HOME + 真实 Web + 受控模型替身，分别完成新建、无引用主动选库更新、预览编辑确认、冲突、无变化、取消/切 Session 与正常引用读取；通过只读 RPC 确认当前内容、本次 Host 来源及旧数据保留，Host 聚焦用例另核验 aggregate 的来源引用和零写计数。明确记录模型替身调用次数、资源归属和清理，不触碰正常 Profile、不用真实 Provider。

## 4. 本轮交付与停止

前轮文档落地记录（reviewed SHA）：仅基于 main 只读核查源码/已有测试，新增两份候选文档，在原 P2A 两文档顶部增加覆盖标记；原历史正文不改。未实现任何新契约或 UI，未修改产品、Storage、Migration、Harness Core、依赖或真实 Profile，未运行测试/构建/浏览器/Web，Provider 请求 0。

以上记录保留原文档落地事实。本次定点修订以 reviewed SHA 为起点，**只修改两份 P2-Lite 文档**，撤回仅临时来源方案，冻结 opt-in evolve 的持久来源与原子无变化设计；未改原 P2A 文档、产品代码或旧契约，未运行任何测试/Provider。所有新增回归均为未来要求，不冒称已经通过。

G0 分支及其他分支原样保留，未 cherry-pick/merge 其证明代码。所有 `.DS_Store`、`.playwright-mcp/` 等既有无关 drift 保留。本独立文档分支提交、推送、fetch 核验后 STOP，等待独立审查；不自行继续原 P2B、不合并 main。
