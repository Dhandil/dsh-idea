# P2A Implementation Instructions：普通对话 Idea 演进

状态：**定点修订后待最终审查的实施说明，本轮不执行**。日期：2026-10-22。产品基线 `c0194edf477d836e6a8b2099b19db20717723b60`；修订参照 `d572488c201f85b44c169de5675537a6bcbad260`。

唯一配套冻结：[Architecture Freeze](../architectue/DSH_IDEA_P2A_CONVERSATION_EVOLUTION_ARCHITECTURE_FREEZE.md)。若正文、源码与本说明不一致，停止并提交差异；不得自行放宽 Host 来源、候选或版本检查。本任务已收到完整 ChatGPT P2 产品方案，Freeze 开篇给出逐项映射；开工须等待该冻结候选的独立架构审查，不得将产品方案已经确定等同于本文技术方案已经验收。

## 1. 开工顺序与最小文件范围

以下均为未来实施任务，不表示本轮已完成或获准修改。

| 顺序 | 候选范围 | 交付与退出条件 |
| --- | --- | --- |
| 0 | 独立架构审查 | 对照已收到的完整 ChatGPT P2 产品方案，确认 Freeze 第 7 节技术取舍；未确认不得把本文当作已接受设计开工。 |
| 1 | 公开 Session replay 适配器、capture resolver；未来显式 catalogue 依赖 | 先通过 G-SNAPSHOT：同一 observation 重建 raw/surface，官方 API 差分及等 cursor 异内容反例。失败则所有新入口 STOP，不用双读 cursor 兜底。 |
| 1a | 自动引用 resolver 与主动库选择 resolver，内存 types/helper | 自动发现须通过 G-REFERENCE 的 canonical 输入 → claim → admission → capture 证明；不能证明时关闭自动推荐，但允许用户从库选择并由 Host 验证当前目标，不造历史引用。 |
| 2 | `evolution/service.ts`、`types.ts`、registry；共享 preparation pipeline/prompt | 新锚点入口复用已有提取服务；Host 捕获、candidate、base 和 proposal 绑定；零识别模型请求，生成至多一次提取。旧 prepare/readiness 不改为新流程。 |
| 3 | `service.ts` 原域写入边界、必要比较 helper；新入口 flight/receipt | 原 mutation 队列内 conflict-before-noop；有变化复用现有 evolve 原子写入，无变化零写；新入口同 proposal 并发、重放与 indeterminate 安全。不得另造写表路径。 |
| 4 | `remote-host/service.ts`、wire types、正常 Typert 生成 | Freeze 的 inspect/select-target/prepare/commit，原新建 prepare 可选 captureId；库搜索复用现有只读 API。明确目标选择意图与 Host 来源事实分离；旧 RPC 保持兼容。 |
| 5 | `client/state.ts` / slots / dialog / locales 的最小扩展 | 模式与目标选择、两种预览、真实 abort、按代过滤、冲突及无变化反馈。保留灯泡相关 Idea、普通 `+ → Idea`、历史、P1 卡片移除与 Prompt V2。 |
| 6 | 下表聚焦测试与隔离浏览器 | 按门禁执行并归档证据，再交独立审查；不得自行合并 main。 |

不允许修改 Harness Core、持久 `schema.ts` / 域版本 / Migration 或 Session 格式，不新增专用讨论会话，不删除旧讨论服务/按钮/RPC，不移植无关实验驱动，不创建自动提交或后台演进逻辑。任何所需持久字段或新 reason 都须先停下重新审查。

## 2. Host 实施约束

### A. 读取与捕获

1. 采用 Freeze 3.1 的单 observation → `Session.create`（带公开 catalogue projections）→ `surface.nodes/eventAt/snapshotSessionEvent`；raw 和 surface 同源，finally dispose lease。cursor/header 相等不构成双读内容证明。不得在生产路径拼接独立 readSurface、读私有 corpus 或真实持久化文件；只读取所选 Session。
2. 先验证当前 surface 上有效且非 inherited 的 assistant text 锚点，再使用现有 12 / 12,000 预算；保留 per-event seq/ID/截断信息的内存 sidecar。未来助手/引用、工具、reasoning 和任何插件 recall 均不计入 durable capturedContext。
3. 不把 `collectDiscussionFromSurface` 的全尾部捕获用到普通锚点路径。无法证明 anchor、投影范围或归属时 fail closed；不能创建假消息、假 Session 或假 discussion。
4. 自动候选的 canonical pin 不从标题恢复。重放 inbox 须处理插入、替换、取消、claim、ID 重用、merged steering 和 admission；未 admitted 的引用不影响自动候选。recall JSON 只作交叉证据。主动库选择无需这类历史证据，不能将 G-REFERENCE 的失败误当作所有更新的失败。
5. 主动选择复用现有 `idea/search` / `idea/get`，ideaId 仅代表选择意图；Host 校验权限、存在、active/deleting 和当前版本，并将结果绑定 capture 的 targetToken。archived/deleted/无权限不能更新。历史 pin 保留，允许按 Freeze 3.4 明确确认 Host 当前基线后生成，不能要求伪造/补发历史引用。

### B. 提案与提交

- 对较早自动候选，Host 校验相关性确认；主动库选择不要求历史引用证明。历史 pin 的重新定基必须确认精确的 `confirmBaseVersionId`，不是一个可泛化到后续版本的 bool；取消或确认缺失时 0 模型。
- captureId/candidateId/targetToken/proposalId 各有独立类型和状态，不互相替代；selectionKind 与 captured source 分开，仅内存记录。targetToken 绑定 capture、Host idea/base、原 pin 及确认要求。库选择不插入假用户消息，来源仍由 Host 捕获，durable schema 不变。
- 模型只收到 Host 选中 baseline、bounded history 和本次 source；使用现有 user-role JSON 证据封装，原 System prompt 安全约束与 parser 不放宽。不得把 recall、模型输出或 Client echo 当作权威 Idea/来源。
- 历史引用 vN 与用户确认的当前 base vM 分开；模型主 baseline、proposal.base 和 commit.expected 均为 vM，历史正文如采用则作为独立有界参考。确认后漂移到 vK 即 conflict，须重新读取及明确确认，不自动沿用旧确认/重拟稿。调用模型前和写入前都验证 active/base；切换目标不重用旧 proposal。
- 复用现有七字段规范化比较规则；在同一 Idea mutation 队列内，先检查冲突，后判断无变化，最后才调用原子 update。不要通过 manualEdit 伪装成演进，也不要先写 source 再回滚。
- 新入口 flight 按 proposal 同步占用并绑定 normalized payload。并发/重复同 payload 合并，成功和 unchanged 返回保留 receipt；变更 payload 报冲突；明确失败不缓存为成功，结果未知不得自动重新生成/写入。
- 旧 commit RPC 维持原重复错误合同；若需要共享内部 helper，不改变其响应类型和既有测试语义。新 ordinary-conversation 来源 reason 使用 existing `continued-discussion`，版本/来源/event 的引用关系由原 schema 校验。

## 3. Client 状态与操作约束

建议采用判别联合：`closed | inspecting | choosing | preparing-new | preparing-update | preview-new | preview-update | submitting | outcome-unknown`；失败必须保留所属 capture/anchor/mode/target，禁止共用一个模糊的 pending ID。

点击灯泡「总结」即显示 Modal；inspect 不调用模型。无自动关联保持新建默认，同时始终允许主动「更新已有 Idea → 从 Idea 库选择」，无需近期引用。默认新建流程不因新增库选择而增加必经确认；主动切换模式须 abort 旧准备、按代隔离，后续提取需明确用户操作，不自动双调用。多自动候选及较早轮次候选不预选。库目标经 Host 解析当前版本后展示，历史 pin 显式确认 vM 再生成；预览展示选择方式、原引用版本（若有）、当前 base 和 source 范围。所有选择均不扩大对话捕获窗口或改写历史 pin。

abort 连接实际 RPC，按 Session + anchor + generation + mode + candidate 过滤所有 resolve/reject/finally；迟到响应不能重新打开 Modal、覆盖新目标或产生 toast。保留双击开窗遮罩防护、关闭、取消、Escape 及正常后续遮罩关闭。导航/卸载清理 lease 与 pending；Client 没有权限自行注销或篡改他人 Host proposal。

冲突不自动 rebase 或重试提取；允许用户重新读取并明确确认新的当前基线后启动一份新提案，不能复用旧 proposal；无变化明确说明未创建版本；未知结果只能重试同一 proposal/内容，Host 重启或过期时只读刷新并说明未确认。不得根据“当前版本看起来相同”伪造成功。另存新 Idea 是独立、明确的用户操作，需要自身合法 preparation。

## 4. 必须补充的离线回归矩阵

全部为未来实施验证要求，**本轮未运行**。模型使用受控替身，数据来自临时 HOME，不读正常 Profile。

| 编号 | 场景 | 必须证明 |
| --- | --- | --- |
| A01 | 无引用 / 长对话 / 自动关联不可恢复 | 新建默认无新增必经确认；主动库选择更新仍可用，Host 捕获来源不变，不补造历史引用。 |
| A02 | 单个 `+ → Idea` 当前 pin | admitted 原始输入可追踪，唯一 Host 候选；生成/提交仍需用户操作。 |
| A03 | 多 Idea / 同 Idea 多版本 | 不隐式选第一、最后或最新；可明确选择自动候选或库中其他 Idea。 |
| A04 | 同 pin 重复 mention | 按精确 pin 去重，不重复注入或多次提取。 |
| A05 | 只有历史 pin vN，当前 vM | 确认前 0 模型；保留 pin，经明确确认 vM 后允许生成，proposal/commit 绑定 vM；取消不写。 |
| A06 | 选择或历史确认后 / prepare 中 / commit 前漂移 | 不复用旧确认；prepare 前漂移 0 模型，生成后漂移不写，重新读/确认后才能新提案。 |
| A07 | 引用在锚点之后 / capture 之外；范围内较早 Turn | 前两者不作自动候选/来源；较早候选不预选。用户仍可从库主动选择同一 Idea，目标选择不扩大 capture。 |
| A08 | 巨大锚点 / 截断 human message | 保留预算；截断输入不参与自动目标推导；无正文锚点不退化成总结更早消息。 |
| A09 | recall、runtime context、工具、reasoning | 不进入 capturedContext；仅伪造 recall 不产生自动候选。主动库选择可用，但无法替代合法 Host captured source。 |
| A10 | mention 被改写为标题 | 原始输入与 admitted ID、claim、引用采用证据对应；不按标题匹配。 |
| A11 | inbox 编辑 / 取消 / 替换 / 仅排队 | 旧输入和未 admission 输入不成为目标。 |
| A12 | claim 后 crash / pre-step reject / source 变化 | 无虚假 candidate，不借恢复补写来源。 |
| A13 | steering 合并 / ID 重用 / 插件改写 | 能唯一证明才产自动候选；否则仅自动发现 unavailable，不把主动选择伪装成历史引用。 |
| A14 | 伪造 wrapper、恶意 title/label/core、模型伪造 ID | 不授权目标，不提权，JSON 边界不破坏。 |
| A15 | fork inherited anchor / 本地 anchor / compaction | 按 Freeze 保守处理；来源属于正确逻辑 Session；无未来 replacement 泄漏。 |
| A16 | 单 cut 与等 cursor 异内容两代、读取失败 | 执行 G-SNAPSHOT；不混配独立 readSurface，异内容反例不得因 cursor/header 相同通过；失败 0 模型/写并释放 lease。 |
| A17 | archived / deleting / deleted / 目标当前版本缺失 | 生成前 fail closed，提交时再校验，零部分写。 |
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
| A29 | 库搜索、目标或模式切换 / 新建另存 | 选择/确认/搜索 0 模型；旧 token/proposal 不串 capture 或目标，新建和更新各走合法入口。 |
| A30 | P1 与原功能共存 | 无关联卡片；相关 Idea、普通引用 codec、版本历史、Quick Capture、旧讨论与旧演进测试保持通过。 |
| A31 | Prompt V2 与普通 Agent | 白名单、skip 渲染、一次引用注入、跨轮历史与权限不改变；没有新目标分类模型请求。 |
| A32 | 明暗主题、窄窗口、键盘 | 模式/候选/错误信息可访问，无布局溢出或被禁用原因丢失。 |
| A33 | 主动从库选无历史引用的目标 | 不要求 pin/admission；Host 重新取 active 当前版本，来源还是当前 Session/anchor，0 识别模型，无伪造历史。 |
| A34 | 伪造库结果的标题/版本/body、无权限/删除/归档 | 不信 Client echo；无效目标 0 模型/写；合法选择加载 Host snapshot。 |
| A35 | targetToken 跨 capture、Session、目标或实例重放 | 拒绝，不以主动选择绕过 Host 身份、来源及基线绑定。 |
| A36 | 历史 pin 经库选择同 Idea / confirmBaseVersionId 错误 | 不隐藏已知旧 pin；缺失、错误、陈旧确认都拒绝，确认当前精确版本才允许拟稿。 |
| A37 | live/cold/fork/replacement/image-offload/未知 projection | G-SNAPSHOT 完整字段差分通过；lease 后追加/换代不污染旧 cut；未知投影 fail closed，所有退出释放 lease。 |
| A38 | 主动目标与 capture 各自有效，但内容多主题或被截断 | 不宣称已自动语义归属；显示来源范围、选择方式及可编辑预览，不把 Host baseline 混入来源正文。 |

## 5. 未来验证与证据交付

先通过 G-SNAPSHOT 这一公共来源 Gate，再按 G-REFERENCE 决定是否可开启自动发现；主动库选择走独立的 Host 目标验证 Gate。之后完成 A01–A17、A33–A38 的 Host/Loop 核心用例，再实施模型/写入/Client，最后运行相关 focused tests、typecheck、Host/Client build。离线 Agent Loop、JSONL 恢复及故障替身必须真实调用官方扩展接口；不得用伪造渲染结果冒充 Host 证明。

隔离浏览器须展示自动引用候选和无近期引用的主动库选择两条链路：普通对话 → 灯泡总结 → 明确选目标 → 必要的历史基线确认 → 受控草稿 → 编辑 → 保存 vN+1；另测新建、多候选、确认后版本漂移、无变化、取消与未知结果。通过官方只读 RPC 核验版本、来源和事件关系；无真实 Provider、正常 Profile 或专用讨论会话。结束关闭测试浏览器和所有本轮进程，清理本轮临时数据。

实施报告须记录 tested SHA、focused 命令/结果、生成调用数、模型替身边界、来源证明及版本/零写证据、截图和清理；不保存私密正文、凭据或真实 ID。真实模型归属/质量和跨重启强幂等不能用离线测试冒充已经完成。

## 6. 本轮文档落地记录

已依据用户补充的完整 ChatGPT P2 产品方案修订，并核查指定基线和本地 Harness 源码；未读取真实用户 Session/配置，未运行测试或 Provider，未启动浏览器/Web。新分支仅新增本说明及配套 Freeze；保留其他分支和无关 drift，不合并 main。以上矩阵是验收要求，所有实现步骤均未开始。

本次定点修订按独立审查仅更正目标选择、历史版本确认与快照一致性方案，补充 A33–A38。G-SNAPSHOT、G-REFERENCE 及所有矩阵均未在本轮执行；仍为 docs-only，等待最终架构审查。
