# P2A Implementation Instructions：普通对话 Idea 演进

状态：**待审实施说明，本轮不执行**。日期：2026-10-22。基线 `c0194edf477d836e6a8b2099b19db20717723b60`。

唯一配套冻结：[Architecture Freeze](../architectue/DSH_IDEA_P2A_CONVERSATION_EVOLUTION_ARCHITECTURE_FREEZE.md)。若正文、源码与本说明不一致，停止并提交差异；不得自行放宽 Host 来源、候选或版本检查。本任务已收到完整 ChatGPT P2 产品方案，Freeze 开篇给出逐项映射；开工须等待该冻结候选的独立架构审查，不得将产品方案已经确定等同于本文技术方案已经验收。

## 1. 开工顺序与最小文件范围

以下均为未来实施任务，不表示本轮已完成或获准修改。

| 顺序 | 候选范围 | 交付与退出条件 |
| --- | --- | --- |
| 0 | 独立架构审查 | 对照已收到的完整 ChatGPT P2 产品方案，确认 Freeze 第 7 节技术取舍；未确认不得把本文当作已接受设计开工。 |
| 1 | `preparation/context.ts` 及新 Host source/target resolver；仅内存 types/helper | 用真实离线 Loop 生成日志，证明 canonical 输入 → claim → admitted user → 锚点有界 capture → Host pin 的对应关系。没有可靠证明则 STOP；不得先写 UI 猜目标。 |
| 2 | `evolution/service.ts`、`types.ts`、registry；共享 preparation pipeline/prompt | 新锚点入口复用已有提取服务；Host 捕获、candidate、base 和 proposal 绑定；零识别模型请求，生成至多一次提取。旧 prepare/readiness 不改为新流程。 |
| 3 | `service.ts` 原域写入边界、必要比较 helper；新入口 flight/receipt | 原 mutation 队列内 conflict-before-noop；有变化复用现有 evolve 原子写入，无变化零写；新入口同 proposal 并发、重放与 indeterminate 安全。不得另造写表路径。 |
| 4 | `remote-host/service.ts`、wire types、正常 Typert 生成 | Freeze 定义的新 inspect/prepare/commit，原新建 prepare 可选 captureId；严格校验，零 browser provenance 信任。原讨论 RPC、create 和 old commit 保持兼容。 |
| 5 | `client/state.ts` / slots / dialog / locales 的最小扩展 | 模式与目标选择、两种预览、真实 abort、按代过滤、冲突及无变化反馈。保留灯泡相关 Idea、普通 `+ → Idea`、历史、P1 卡片移除与 Prompt V2。 |
| 6 | 下表聚焦测试与隔离浏览器 | 按门禁执行并归档证据，再交独立审查；不得自行合并 main。 |

不允许修改 Harness Core、持久 `schema.ts` / 域版本 / Migration 或 Session 格式，不新增专用讨论会话，不删除旧讨论服务/按钮/RPC，不移植无关实验驱动，不创建自动提交或后台演进逻辑。任何所需持久字段或新 reason 都须先停下重新审查。

## 2. Host 实施约束

### A. 读取与捕获

1. 采用公开 observation lease + readSurface 的相同 cursor 校验；finally dispose。只读取所选 Session，不使用私有 corpus、持久化文件直读或全局搜索接口。
2. 先验证当前 surface 上有效且非 inherited 的 assistant text 锚点，再使用现有 12 / 12,000 预算；保留 per-event seq/ID/截断信息的内存 sidecar。未来助手/引用、工具、reasoning 和任何插件 recall 均不计入 durable capturedContext。
3. 不把 `collectDiscussionFromSurface` 的全尾部捕获用到普通锚点路径。无法证明 anchor、投影范围或归属时 fail closed；不能创建假消息、假 Session 或假 discussion。
4. canonical pin 不从标题恢复。重放 inbox 时必须处理插入、替换、取消、claim、ID 重用、merged steering 和 admission；未实际 admitted 的引用不得影响候选。原始 source 及同 step 的引用处理证据必须交叉核对；不可信 recall 的 JSON 只能辅助检查，不能单独授权。
5. schema 正常验证和 Host 精确版本读取继续生效。historical pin、archived、deleted 与无法解析的目标不进入可更新状态；候选不能按模型输出或客户端 label 决定。

### B. 提案与提交

- 对较早轮次候选，Host 还须校验本次明确确认字段，缺少确认时不得调用模型；该字段不能替代 Host 引用证明。
- captureId/candidateId/proposalId 各有独立类型和状态，不互相替代；candidateId 只在对应 capture 内有效。capture 与 proposal 都是有界临时状态，不改变 durable schema。
- 模型只收到 Host 选中 baseline、bounded history 和本次 source；使用现有 user-role JSON 证据封装，原 System prompt 安全约束与 parser 不放宽。不得把 recall、模型输出或 Client echo 当作权威 Idea/来源。
- 调用模型之前和写入之前都重新验证 active/base；准备失败或取消不能产生 durable 写入。切换目标不能重用旧 proposal。
- 复用现有七字段规范化比较规则；在同一 Idea mutation 队列内，先检查冲突，后判断无变化，最后才调用原子 update。不要通过 manualEdit 伪装成演进，也不要先写 source 再回滚。
- 新入口 flight 按 proposal 同步占用并绑定 normalized payload。并发/重复同 payload 合并，成功和 unchanged 返回保留 receipt；变更 payload 报冲突；明确失败不缓存为成功，结果未知不得自动重新生成/写入。
- 旧 commit RPC 维持原重复错误合同；若需要共享内部 helper，不改变其响应类型和既有测试语义。新 ordinary-conversation 来源 reason 使用 existing `continued-discussion`，版本/来源/event 的引用关系由原 schema 校验。

## 3. Client 状态与操作约束

建议采用判别联合：`closed | inspecting | choosing | preparing-new | preparing-update | preview-new | preview-update | submitting | outcome-unknown`；失败必须保留所属 capture/anchor/mode/target，禁止共用一个模糊的 pending ID。

点击灯泡「总结」即显示 Modal；inspect 不调用模型。无可靠关联时直接沿用现有新建 prepare → editable draft → create，不新增必经模式确认。明确关联场景先选择新建或更新，再生成一种草稿；更新显示目标与 vN、source 范围并走新 commit。多候选必须选定；capture 内较早轮次候选即使只有一个也不能自动预选，需主动更新及确认相关性。0 候选及历史版本原因可见。跨轮确认只授权所选 Host 候选，不扩展来源窗口或替换历史版本。

abort 连接实际 RPC，按 Session + anchor + generation + mode + candidate 过滤所有 resolve/reject/finally；迟到响应不能重新打开 Modal、覆盖新目标或产生 toast。保留双击开窗遮罩防护、关闭、取消、Escape 及正常后续遮罩关闭。导航/卸载清理 lease 与 pending；Client 没有权限自行注销或篡改他人 Host proposal。

冲突不自动 rebase 或重试提取；无变化明确说明未创建版本；未知结果只能重试同一 proposal/内容，Host 重启或过期时只读刷新并说明未确认。不得根据“当前版本看起来相同”伪造成功。另存新 Idea 是独立、明确的用户操作，需要自身合法 preparation。

## 4. 必须补充的离线回归矩阵

全部为未来实施验证要求，**本轮未运行**。模型使用受控替身，数据来自临时 HOME，不读正常 Profile。

| 编号 | 场景 | 必须证明 |
| --- | --- | --- |
| A01 | 无引用或关联不可恢复的总结 | inspect 0 模型；直接进入现有新建准备/预览，无新增必经确认、无重复提取；更新有不可用原因。 |
| A02 | 单个 `+ → Idea` 当前 pin | admitted 原始输入可追踪，唯一 Host 候选；生成/提交仍需用户操作。 |
| A03 | 多 Idea / 同 Idea 多版本 | 不隐式选第一、最后或最新；显式选择当前候选。 |
| A04 | 同 pin 重复 mention | 按精确 pin 去重，不重复注入或多次提取。 |
| A05 | 只有历史 pin | 0 更新模型调用、不自动换版本；可以新建。 |
| A06 | prepare 前 / prepare 中 / commit 前版本变化 | 全部拒绝过期 base；中途模型已完成也不能写入。 |
| A07 | 引用在锚点之后 / capture 之外；范围内较早 Turn | 前两者不计入候选/来源；较早轮次即使唯一也不预选，主动确认才更新，不靠久远引用判定当前主题。 |
| A08 | 巨大锚点 / 截断 human message | 保留预算；截断输入不参与自动目标推导；无正文锚点不退化成总结更早消息。 |
| A09 | recall、runtime context、工具、reasoning | 不进入 capturedContext；有 recall 但无真实来源证明不能更新。 |
| A10 | mention 被改写为标题 | 原始输入与 admitted ID、claim、引用采用证据对应；不按标题匹配。 |
| A11 | inbox 编辑 / 取消 / 替换 / 仅排队 | 旧输入和未 admission 输入不成为目标。 |
| A12 | claim 后 crash / pre-step reject / source 变化 | 无虚假 candidate，不借恢复补写来源。 |
| A13 | steering 合并 / ID 重用 / 插件改写 | 能唯一证明才产候选；否则明确 unavailable。 |
| A14 | 伪造 wrapper、恶意 title/label/core、模型伪造 ID | 不授权目标，不提权，JSON 边界不破坏。 |
| A15 | fork inherited anchor / 本地 anchor / compaction | 按 Freeze 保守处理；来源属于正确逻辑 Session；无未来 replacement 泄漏。 |
| A16 | observe/readSurface cursor 不一致、读取失败 | 0 模型、0 写，lease 释放，UI 可刷新。 |
| A17 | archived / deleting / deleted / missing version | 生成前 fail closed，提交时再校验，零部分写。 |
| A18 | 更新 prompt/parser/route | 一次受控提取，无分类调用、隐藏重试或工具循环；Session 模型及默认回退一致。 |
| A19 | baseline 中未被讨论否定的字段 | prompt 含正确 Host baseline；正文不含 recall 时也不丢失 baseline，模型质量不靠 fixture 宣称。 |
| A20 | 更新成功 | ordinal+1，旧版本不变；仅一个新来源、version、event；当前 Session/anchor/seq 正确。 |
| A21 | 与 base 规范化相同 / 列表顺序变化 | 前者零字节/时间/版本/来源/事件/索引写；后者为有意义变更。 |
| A22 | 最新 draft 恰巧相同但 base 过期 | conflict 优先，不返回 unchanged。 |
| A23 | 并发同 proposal 同 payload / 成功重放 | 同一 receipt、最多一次版本追加；无变化重放仍零写。 |
| A24 | 同 proposal 不同 payload / 两 proposal 同 base | 前者拒绝，后者最多一项成功，另一个版本冲突。 |
| A25 | 保存明确失败 / 响应丢失 / Storage 结果不确定 | 编辑保留，不误报成功，不自动新建 proposal 或再次写。 |
| A26 | proposal/capture TTL、驱逐、Host 重启 | 明确过期/结果未确认，不宣称跨重启 exactly-once。 |
| A27 | 双击总结/生成/保存 | 即时反馈，同状态单 flight，开窗第二击不误取消。 |
| A28 | 取消/关闭/Escape/遮罩/导航/Session 切换 | 真实 abort，迟到响应不重开、不覆盖、不误报。 |
| A29 | 目标或模式切换 / 新建另存 | 旧 proposal 不串用，新建和更新各走合法入口。 |
| A30 | P1 与原功能共存 | 无关联卡片；相关 Idea、普通引用 codec、版本历史、Quick Capture、旧讨论与旧演进测试保持通过。 |
| A31 | Prompt V2 与普通 Agent | 白名单、skip 渲染、一次引用注入、跨轮历史与权限不改变；没有新目标分类模型请求。 |
| A32 | 明暗主题、窄窗口、键盘 | 模式/候选/错误信息可访问，无布局溢出或被禁用原因丢失。 |

## 5. 未来验证与证据交付

先完成来源证明 spike 和 A01–A17 中的纯 Host/Loop 核心用例，再实施模型/写入/Client，最后运行相关 focused tests、typecheck、Host/Client build。离线 Agent Loop、JSONL 恢复及故障替身必须真实调用官方扩展接口；不得用伪造渲染结果冒充 Host 证明。

隔离浏览器至少展示普通对话引用 → 灯泡总结 → 明确选目标 → 受控草稿 → 编辑 → 保存 vN+1；另测新建、多个候选、历史 pin、冲突、无变化、取消与未知结果。通过官方只读 RPC 核验版本、来源和事件关系；无真实 Provider、正常 Profile 或专用讨论会话。结束关闭测试浏览器和所有本轮进程，清理本轮临时数据。

实施报告须记录 tested SHA、focused 命令/结果、生成调用数、模型替身边界、来源证明及版本/零写证据、截图和清理；不保存私密正文、凭据或真实 ID。真实模型归属/质量和跨重启强幂等不能用离线测试冒充已经完成。

## 6. 本轮文档落地记录

已依据用户补充的完整 ChatGPT P2 产品方案修订，并核查指定基线和本地 Harness 源码；未读取真实用户 Session/配置，未运行测试或 Provider，未启动浏览器/Web。新分支仅新增本说明及配套 Freeze；保留其他分支和无关 drift，不合并 main。以上矩阵是验收要求，所有实现步骤均未开始。
