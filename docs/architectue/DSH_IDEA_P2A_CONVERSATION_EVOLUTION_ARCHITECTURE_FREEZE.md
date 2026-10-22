# P2A Architecture Freeze：普通对话中的 Idea 版本演进

状态：`DSH_IDEA_P2A_ARCHITECTURE_READY_FOR_REVIEW`，**待架构审查的冻结候选，不是实施完成或已批准开工**。日期：2026-10-22。

基线：`c0194edf477d836e6a8b2099b19db20717723b60`。只读 Harness 参照：`86a402200d95fecef4529d969836f1fe13c6cb0d`（0.2.1-alpha.4）。配套：[Implementation Instructions](../implements/DSH_IDEA_P2A_CONVERSATION_EVOLUTION_IMPLEMENTATION_INSTRUCTIONS.md)。

设计依据：本次用户给出的 P2A 范围与禁止事项。所称“本次 ChatGPT P2 方案”完整正文未附在当前任务中，已请求补充；本文不能宣称已逐条比对该正文。下列具体交互、保守的历史版本策略及 RPC 名称是供本次审查确认的决策，不是对未提供方案的转述。补充方案如与本文冲突，应先修订并重审，不由实现者自行取舍。

## 1. 目标与不变量

在当前普通 Session 的某条已完成 assistant 回复上，灯泡「总结」提供「新 Idea / 更新已有 Idea」。普通 `+ → Idea` 引用可成为更新目标候选，**不创建、不切换到专用讨论会话**。模型仅拟稿，用户明确批准后由域服务追加一个线性版本。

冻结要求：

1. 不自动提交、不自动合并、不静默把历史引用换成最新版本，不增加目标识别模型调用。
2. 保留固定版本引用、Prompt V2 的资格判定与跨轮历史边界、不可信数据封装、原权限与 Provider 路由。
3. 复用现有准备/演进 parser、prompt、route/stream、proposal registry 和 `IdeaService` 单写入路径；不得让 Client 或新 Remote 直接写 Storage。
4. 不变更持久化 schema、域版本、Migration、线性历史、`sourceDiscussionIds` 或现有 reason 枚举。
5. 保留旧讨论按钮、讨论后端和现有 RPC；P1 已移除的关联卡片不恢复。普通对话新路径不得调用 `continueDiscussion`、Session create 或旧的全讨论尾部捕获来替代锚点捕获。

## 2. 源码核查：现状与需要补足之处

路径相对于 `packages/dsh-idea/`，行号对应本基线。

| 已核实位置 | 当前行为 | 对 P2 的约束 |
| --- | --- | --- |
| `src/preparation/context.ts:85` | 按 assistant ID 找锚点，向前取最多 12 条 / 12,000 字符，只收真实 `source.kind=user` 及 assistant 的 text；插件 recall、工具及 reasoning 不入捕获。 | 捕获不等于模型当时的全部上下文，不能从缺失 recall 推断“未引用”。新解析器还须先独立校验锚点有可用 text；现收集循环不能代替该前置校验。 |
| `src/reference/service.ts:64` | 解析 canonical pin，Host 按精确版本取值；直接用户 mention 被改写为可读标题；另外追加一条带不可信 wrapper 的 recall。 | 捕获正文通常不再有 canonical pin；不能按标题、客户端 label 或自然语言识别写入目标。 |
| `src/preparation/service.ts:70`、`src/remote-host/service.ts:146` | 一次总结为一次直接模型提取；Host registry 持有来源；create 按 preparation ID 合并并发和重放结果。 | 新 Idea 保留既有保存语义；来源仍不能从 Client 回传正文取信。 |
| `src/evolution/service.ts:63,101` | readiness / prepare 依赖专用 `IdeaDiscussion`；prepare 捕获整段讨论当前尾部，用 continuation 中冻结的基线。 | 普通对话需要新的 preparation 入口；不能伪造 discussion ID 或借调用旧入口隐式创建会话。 |
| `src/evolution/service.ts:198`、`src/evolution/registry.ts:38` | base 校验后调用 evolve，成功消费 proposal；重复提交报 proposal-not-found。registry 64 项、30 分钟，重启丢失。 | 不得宣称已有“重复请求返回同一成功结果”；P2 要单独定义提案提交 receipt。 |
| `src/service.ts:90,310,557` | manualEdit 有规范化无变化拦截；evolve 当前总会追加来源、版本及事件。变更由同一 Idea 队列及乐观版本检查串行保护。 | 复用比较规则，但 P2 无变化检查必须进入同一原子写入边界；不能直接复用 manualEdit 丢失来源。 |
| `src/types.ts:74,101`、`src/schema.ts:98` | 演进 reason 已有 `continued-discussion`；SourceDiscussionDraft 已允许当前 Session、anchor、seq 范围和 bounded 捕获。 | 普通对话使用现有来源快照形状即可，不增加 durable 字段；`SourceDiscussion` 不是专用会话绑定 `IdeaDiscussion`。 |
| `src/client/state.ts:180`、`IdeaAssistantActions.tsx` | 总结现有 preparation pending、真实 abort、迟到结果防护；灯泡还有相关 Idea 操作。 | 延续即时反馈、取消、导航卸载与双击保护，不影响相关 Idea 和普通引用操作。 |

Harness 公开接口核查：`packages/session-query/session-query/src/index.ts:140,184,310` 提供 `observeSession`、`readSession`、`readSurface`；`observation.ts:17` 提供固定 cursor 的原始事件 lease。`packages/core/agent-loop/src/inbox.ts:109,227` 持久记录 inbox splice，领取后 pre-step；`agent.ts:434` 才追加经插件改写的用户消息。因此原始输入和实际 admission 必须按消息 ID、领取及 admission 关系交叉验证，不能只取“最近一条插入”。

以上均为源码只读结论。本轮未读取真实 Session、Profile 或凭据，未运行测试、浏览器或 Provider。

## 3. Host 可信来源与候选解析

### 3.1 同一快照和有界锚点

Host 只读取请求指定的 Session，不做全局会话搜索。以 `observeSession(..., projectionMode: 'none')` 固定 raw cut，再取官方 `readSurface`；必须核对 Session/header、`capturedThroughSeq === observation.cursor`，否则返回 `source-changed`，不调用模型。所有 lease 在 finally 释放。不得把两个不同 cursor 的读取假定为一次原子观察，也不得复制 Harness 私有 surface fold 绕过插件投影。

锚点必须是当前 surface 上唯一匹配的、已结算且具有可用 text 的 `assistant/message`，不是 live chunk、attempt、tool-only 回复、替代后已隐藏的消息或别的 Session 的 ID。capture 含锚点，绝不含锚点之后的回复/引用；若当前 surface 在锚点之前的位置含有 raw seq 晚于锚点的替代内容，保守返回 `source-changed`，不混入未来内容。首版更新路径拒绝 inherited/fork 前缀中的锚点；普通本地锚点可使用其逻辑 Session 的有界前文，来源只归属于当前逻辑 Session，不能冒称原父 Session 的新讨论。

复用 12 条 / 12,000 字符预算及既有规范化、截断规则；新增 **仅内存** 的每条 selected event seq、message ID、截断标志，用于证明候选与实际捕获的对应关系。durable `capturedContext` 仍只有 `{role,text}`。`startSeq/endSeq` 是捕获边界，不代表其中每个原始事件都被纳入，也不代表未截断。

### 3.2 引用证明

针对捕获实际选中的 human event：

1. 从同一 raw cut 重放官方 inbox splice 语义，找到与 admitted user ID 对应、已领取且未取消的唯一原始直接用户输入。排除仅排队、已取消/替换、pre-step 拒绝、claim 后未 admission 的输入；ID 重用或映射歧义不得猜测。
2. 用已有 canonical URI parser 从该原始输入解析 pin；Host 读取该精确 IdeaVersion。需要核对该 admission 的 dsh-idea 引用 recall 中的 pin 一致性，作为是否实际采用该引用的交叉证据。**recall 不是捕获正文，也不是独立信任根**；只凭 source 字符串、标题、模型引用的 JSON 或 wrapper 都不能授权写入。
3. 无原始输入、缺少 admission 证明、纯文本伪造 wrapper、只有 assistant/其他插件提及目标、格式异常，均不能产生可写候选。原始 canonical mention 仍完整保留在 admitted 用户事件时，可直接证明，无须强行要求 inbox 格式一致；仍须检查真实 user source 和 Host 版本解析。
4. 截断的人类消息不用于自动目标推导，避免用模型根本没见到的截断片段作判断；UI 提示范围不足。锚点以后的输入，以及 capture 范围以外更早引用，一律不补入。

若旧日志缺少上述证据，更新入口显示明确不可用原因，允许「新 Idea」沿用既有流程，不新增 Session 事件来补造历史、不迁移日志、不偷偷扩大全会话扫描。实现首个离线 spike 必须证明官方日志足以支持上述关联；不能证明时停止更新路径实施并报告，不降级成标题匹配或“相信 recall”。

### 3.3 候选选择与历史版本

候选按 `(ideaId, referencedVersionId)` 去重，顺序仅用于展示，不构成优先级；同一 Idea 的不同版本不合并。展示 Host 标题、可读 ordinal、当前/历史标记及不可用原因。首版只接受已证明引用候选，不顺带新增全库手工选目标。

| 候选情况 | 冻结交互及 Host 行为 |
| --- | --- |
| 无可证明候选 | 默认新 Idea；更新禁用并说明需先在当前对话范围内引用目标。零识别模型调用。 |
| 唯一可用、当前版本候选 | 可预选更新目标；仍需用户明确选择更新模式并生成草稿，不自动提交。 |
| 多候选（含同 Idea 不同版本） | 必须明确选一个，不默认第一条、最后一条、语义最近或“最新”。 |
| 仅历史版本引用 | 显示引用 vN / 当前 vM；不生成更新草稿，提示先明确引用当前版本或选择新 Idea。不静默 rebase。 |
| 同时有历史和当前候选 | 明确选中当前候选才允许更新，仍展示旧引用存在；不得声称捕获含全部历史 recall。 |
| archived / deleted / missing / 不可读 / 映射不明 | 对应候选不可用，更新零模型调用；新 Idea 是否可用由原总结来源检查决定。 |

inspect 时保存的 current version 不是永久授权。prepare 前再检查目标仍 active 且 currentVersionId 等于选中 pin；commit 再做同一乐观检查。版本漂移返回冲突，不自动换目标、重拟稿或重试模型。

## 4. 提议的最小 RPC 与信任边界

下列为**待实现契约**，当前基线没有这些普通对话入口。生成 Typert 描述必须随未来源码一起更新，不手写生成文件。

| 入口 | 输入 / 输出及约束 |
| --- | --- |
| 新增 `idea/inspectMessageSave` | `{sessionId,messageId}` → Host `captureId`、有界统计、候选及原因；0 模型、0 Idea durable 写入。captureId 是不透明的临时凭据，不是 preparation/proposal ID。 |
| 扩展 `idea/prepareFromMessage` 的可选 `captureId` | 新 UI 的「新 Idea」携带 captureId，Host 校验 Session/anchor 并使用冻结捕获；仍复用原提取/create 流程。老调用无此字段时保持原路径。一次明确生成至多一次模型请求，无隐藏重试。 |
| 新增 `idea/prepareMessageEvolution` | `{captureId,candidateId}` → `{proposalId,ideaId,baseVersionId,draft,sourceStats}`。candidateId 只能解析至该 capture 的 Host 候选；不接受 browser 提供的标题、base draft、来源正文、seq 或 reason。 |
| 新增 `idea/commitMessageEvolution` | `{proposalId,expectedCurrentVersionId,draft}` → `{outcome:'committed'|'unchanged',ideaId,currentVersionId,ordinal}`；只提交编辑内容与期望版本，目标、来源、reason 全从 Host proposal 取。 |

capture registry 使用已有有界临时 registry 模式，64 项、30 分钟，实例隔离；验证调用归属时沿用现有 Remote principal/Host 权限，不把 token 当作新增跨用户授权。capture/proposal 数据不写 Storage 或 Session；Host 重启、TTL 或驱逐后返回 expired，不伪造恢复。取消后不注册可提交的迟到 proposal。

生成更新草稿复用 `IdeaEvolutionService` 的 prompt/parser/route/stream 与 proposal registry：**选中且仍为当前的 Host draft + bounded history digest + 本次锚点捕获**，不是插件 recall 全文或浏览器 draft。全部按既有 prompt 作为不可信 JSON 证据；与当前 baseline 无关的讨论内容不应覆盖其未被证据否定的字段。生成至多一个直接模型请求，没有目标分类调用、Agent 工具循环或自动重试。

## 5. 线性提交、无变化、幂等与来源

普通对话以现有 `continued-discussion` reason 记录“基于对话继续演进”，不新增枚举。这个值不承诺存在专用 `IdeaDiscussion`；旧绑定及历史数据保持原样，UI 可用中性「讨论演进」显示。

提交进入现有 Idea mutation 队列，先校验 active/deleting、base 和 schema，再按 `sameIdeaDraft` 的规范化七字段规则比较，列表顺序有意义：

- **冲突优先**：current 已变化，即便 draft 碰巧等于最新也报 conflict；不冒称本次完成或无变化。
- **无变化**：同一原子队列内、调用 durable update 之前确认与 base 相同，返回 unchanged；Idea 字节、updatedAt、version、sourceDiscussions、evolutionEvents、索引与偏好全部零写入。不能只在 Client 或进入队列前比较。现 `evolve` 需要新增 opt-in 无变化策略/共用内部提交原语，保留旧路径语义。
- **有变化**：仍由现有域写入原语一次原子追加来源、ordinal+1 版本和一个 from/to event，推进 currentVersionId；不分叉、不改历史、不触碰提醒偏好。

来源快照使用该 proposal 冻结的 **当前普通 Session**、点击的 assistant anchor、实际 capture 的 seq 边界和 human/assistant 文本。目标 Idea 及基线从 Host 独立加载，不把 Idea snapshot/recall 伪装成“用户说过的话”，也不把原 Idea 的旧来源归为这次对话。新版本只引用本次新来源快照，既有来源及引用完整保留。

新提交入口采用 Host 内存 `prepared → committing → committed/unchanged` flight/receipt：同 proposal、同规范化 draft 与 expected base 的并发及成功重放返回同一结果；同 proposal 换 payload 拒绝，不第二次保存。先同步占有 flight 再 await，成功/无变化才结算；保存失败保留编辑，不缓存为成功。该策略限定新入口，旧 RPC 的重复提交错误契约不在本任务内被静默改写。

receipt 有界且临时；提案结算后不可重新成为 prepared。网络结果未知时只允许重试同 proposal 和同 payload；不能重新 prepare 然后自动保存。Host 重启/receipt 丢失后返回“结果未确认”，只读刷新供用户核对，不声称跨重启 durable exactly-once。后续若要求强恢复，需另行架构决策，不能借本任务偷偷增加持久 idempotency 字段。Storage 返回结果不确定时也不得简单清除 flight 后再次写；保留 indeterminate，停止自动重试。

## 6. Client 流程与错误反馈

`关闭 → inspecting → 选择模式/目标 → preparing-new 或 preparing-update → 对应可编辑预览 → 明确保存 → 结果`。

- 点击「总结」立即在原 Modal 显示读取/准备态；inspect 不调用模型。默认展示新 Idea；唯一当前候选可在更新页预选，多候选不预选。用户确认模式/目标后「生成草稿」，准备与正式预览为不同状态，不伪造 ID。
- 更新预览显示 Host 目标、基线 vN、来源锚点范围及截断提示；七字段可编辑，按钮明确「保存为新版本」。新模式仍为保存新 Idea，绝不将同一 ID 混给另一条提交接口。
- 切换模式/目标、取消、关闭、Escape、导航或 Session 卸载都 abort；generation + Session + anchor + mode + target 共同过滤迟到响应。保留打开瞬间双击遮罩保护；同状态重复点击只有一个请求。
- 提交中阻止重复操作；结果未知保留同一 proposal/payload；明确失败保留编辑，冲突解释基线已过期并只读刷新，不自动 rebase。用户另存新 Idea 必须显式重新选择，并走自己的 preparation，不能复用更新 proposal 绕过来源。
- 无变化显示「内容无变化，未创建新版本」；成功 receipt 重放后重新只读加载当前状态，不能把旧 receipt 的版本当成最新。
- 目标未选、多候选、历史 pin、来源不可证明/变化/不可用、归档/删除、过期、模型不可用/失败/非法输出、取消、版本冲突、无变化、保存结果未知须有不同提示。所有 disabled 说明可读，明暗主题、窄窗口和键盘导航均覆盖。

## 7. 待决风险与实施门槛

| 风险 | 影响及审查决策 |
| --- | --- |
| 缺少 ChatGPT P2 正文 | 尚不能证明方案逐条一致；须在开工前补齐并比对。尤其确认选择模式发生在模型调用前、首版仅引用候选、历史 pin 拒绝策略。 |
| 旧输入与 admission 的可证明对应关系 | 公开事件具备素材，但未做新 resolver 的离线可执行证明；必须先通过 inbox 编辑/取消/steering/claim 崩溃/插件变换矩阵，不能以源码存在推定任何日志都可自动识别。 |
| 截断、compaction、fork 与超长 raw log | 有意保守禁用部分更新；公开 observation 可能物化整个指定 Session，不能承诺按 capture 大小的内存成本。不得为此扫描其他会话或绕过投影；必要时另议只读索引接口。 |
| reason 与幂等边界 | 需接受 existing reason 的中性“对话演进”含义及仅同一 Host 生命周期内 receipt；强跨重启幂等不在无 Storage 修改方案内。 |
| 多主题普通对话 | 确定性识别只能证明引用及选择，不能证明每段正文都只讨论该目标。用户预览、可编辑及明确批准是必要门槛，不宣称自动语义归属已经解决。 |

本文件与配套 Instructions 需独立架构审查后才可作为实施依据。本轮仅文档；没有产品、Harness、Storage、真实 Profile 变更，没有 Provider 或测试调用。工作区无关 drift 与其他分支保留。
