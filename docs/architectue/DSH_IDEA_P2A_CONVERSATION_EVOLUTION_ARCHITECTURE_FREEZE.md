# P2A Architecture Freeze：普通对话中的 Idea 版本演进

> **后续产品决策覆盖标记（2026-10-23）：SUPERSEDED FOR FUTURE IMPLEMENTATION。** 用户已决定转向「一个 Idea 只展示一份当前有效内容」，暂不继续原 P2B。后续实施依据改为 [P2-Lite Architecture Freeze 候选](DSH_IDEA_P2_LITE_ARCHITECTURE_FREEZE.md)及其配套说明，仍须独立审查；不再按本文开启自动引用归属恢复或面向用户的多版本演进流程。本文以下正文原样保留，反映编写时的状态；后续 P2A 最终架构验收及基线推进至 `d36325aed1373a9a2dedeced8e367a5bb32e6395` 的历史事实不撤销，G0 证明分支也不删除或合并。

状态：`DSH_IDEA_P2A_REPAIR_READY_FOR_FINAL_ARCHITECTURE_REVIEW`，**待最终架构审查的冻结候选，不是实施完成或已批准开工**。日期：2026-10-22。

定点修订参照：`d572488c201f85b44c169de5675537a6bcbad260`；审查结论 `DSH_IDEA_P2A_REVIEW_BLOCKED_TARGET_SELECTION`。本次仅纠正主动选目标、历史版本显式确认及单快照证明三项，保留其他主要架构。

基线：`c0194edf477d836e6a8b2099b19db20717723b60`。只读 Harness 参照：`86a402200d95fecef4529d969836f1fe13c6cb0d`（0.2.1-alpha.4）。配套：[Implementation Instructions](../implements/DSH_IDEA_P2A_CONVERSATION_EVOLUTION_IMPLEMENTATION_INSTRUCTIONS.md)。

设计依据：用户在本任务补充的完整 ChatGPT P2 产品方案（此前仅存在于 ChatGPT 对话，未有仓库文件）。核心链路为 `+ → Idea 固定版本引用 → 普通 DSH 对话 → 灯泡总结 → 新 Idea / 更新已有 Idea → 可编辑预览 → 明确保存`；P2 完成并验收前保留旧讨论入口及后端。下列历史版本显式确认策略、跨轮证明等级及 RPC 名称是由源码核查提出的冻结候选，待 ChatGPT 独立架构审查确认，不能宣称已验收。

| 产品方案重点 | 本文对应 |
| --- | --- |
| 普通引用的持久化与可靠关联 | 第 2、3 节：raw inbox、admission 和引用采用证据；捕获没有 recall，不从标题猜测。 |
| 多候选、跨轮、历史版本、来源范围 | 第 3 节：自动候选按 pin 去重，支持 Idea 库主动选择；较早轮次仅弱候选，历史 pin 经明确确认才使用当前基线。 |
| 灯泡 prepareFromMessage → create 扩展 | 第 4、6 节：无自动关联保持新建默认，但始终可主动选择已有 Idea 更新；目标与来源独立验证。 |
| 复用 prepareEvolution → commitEvolution | 第 4、5 节：新增普通锚点入口，复用原演进服务；不造专用会话、不复用旧全尾部捕获。 |
| 并发、幂等、失败及旧数据兼容 | 第 5 节：同队列、原子零变化、临时 receipt；旧 RPC、格式及数据不变。 |
| UI 与必要验证 | 第 6 节及配套 Instructions A01–A38。 |

## 1. 目标与不变量

在当前普通 Session 的某条已完成 assistant 回复上，灯泡「总结」提供「新 Idea / 更新已有 Idea」。普通 `+ → Idea` 引用可成为更新目标候选，**不创建、不切换到专用讨论会话**。模型仅拟稿，用户明确批准后由域服务追加一个线性版本。

冻结要求：

1. 不自动提交、不自动合并、不静默把历史引用换成最新版本，不增加目标识别模型调用。
2. 保留固定版本引用、Prompt V2 的资格判定与跨轮历史边界、不可信数据封装、原权限与 Provider 路由。
3. 复用现有准备/演进 parser、prompt、route/stream、proposal registry 和 `IdeaService` 单写入路径；不得让 Client 或新 Remote 直接写 Storage。
4. 不变更持久化 schema、域版本、Migration、线性历史、`sourceDiscussionIds` 或现有 reason 枚举。
5. 保留旧讨论按钮、讨论后端和现有 RPC；P1 已移除的关联卡片不恢复。普通对话新路径不得调用 `continueDiscussion`、创建 live 会话的 `ctx.sessions.create` / Session Controller create，或用旧的全讨论尾部捕获替代锚点捕获。3.1 的公开 detached `Session.create` 仅用于只读重放，不注册 live 会话，不属于新建讨论。

## 2. 源码核查：现状与需要补足之处

路径相对于 `packages/dsh-idea/`，行号对应本基线。

| 已核实位置 | 当前行为 | 对 P2 的约束 |
| --- | --- | --- |
| `src/preparation/context.ts:85` | 按 assistant ID 找锚点，向前取最多 12 条 / 12,000 字符，只收真实 `source.kind=user` 及 assistant 的 text；插件 recall、工具及 reasoning 不入捕获。 | 捕获不等于模型当时的全部上下文，不能从缺失 recall 推断“未引用”。新解析器还须先独立校验锚点有可用 text；现收集循环不能代替该前置校验。 |
| `src/reference/service.ts:64` | 解析 canonical pin，Host 按精确版本取值；直接用户 mention 被改写为可读标题；另外追加一条带不可信 wrapper 的 recall。 | 捕获正文通常不再有 canonical pin；自动发现不能按标题、客户端 label 或自然语言猜目标。主动库选择是用户本次意图，不需要历史引用证明。 |
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

Host 只读取请求指定的 Session，不做全局会话搜索。**撤销“固定 observation + 独立 readSurface 的 cursor 相等即可证明同一内容”的规则。**cursor 是某个日志代的序列位置，不是内容标识；两个实例、冷存储 revision 或日志代可以有相同 cursor 而内容不同。header/ID 相等也不足以补足这一证明。

采用**单个 observation → 公开 detached replay → 同源 raw/surface**：从同一 lease 物化并复制 header、events、inheritedEventCount；通过公开 `Session.create` 和 `@deepseek-ai/dsh-session-format-catalog/message-projections` 的 `currentSessionMessageProjections` 验证并重建 surface，来源捕获和自动引用证明都只消费这份 cut。不得在生产路径拼接另一份 `readSurface` 的正文，不调用私有 corpus/tracing，不手写 surface fold、不省略 projection 定义。

只读核查依据：Harness `SessionObservation` 契约（`observation.ts:17`）及 live 实现（`:275`）固定 append-only 前缀；`Session.create`（`packages/core/session/src/index.ts:583`）提供带 projection 定义的 detached replay，`surface.nodes`、`eventAt`、`isSurfaceEvent`、`snapshotSessionEvent` 均公开导出。官方 `readSurface` 的 `tracing.currentSurfaceEvents` 使用相同 catalogue fold 后，按当前 nodes 返回 **raw SurfaceEvent 副本**，不是 `deriveMessages()` 的全部 projected 模型文本。实现必须匹配这个既有捕获契约，不能混称为模型全部上下文。

以下是未来 Gate 使用的可执行 JS 适配方案，**本轮只写入文档，未执行**：

```js
import { Session, SessionId, isSurfaceEvent, snapshotSessionEvent } from '@deepseek-ai/dsh-session'
import { currentSessionMessageProjections } from '@deepseek-ai/dsh-session-format-catalog/message-projections'

async function readFrozenSource(sessionQuery, id, signal) {
  const sessionId = SessionId(id)
  const lease = await sessionQuery.observeSession(sessionId, { projectionMode: 'none', signal })
  try {
    signal?.throwIfAborted()
    const header = structuredClone(lease.header)
    const raw = structuredClone(lease.events)
    const inherited = lease.inheritedEventCount
    if (header.id !== sessionId || (raw.at(-1)?.seq ?? -1) !== lease.cursor) {
      throw new Error('source-cut-invalid')
    }
    const replay = Session.create(sessionId, raw, header, inherited, currentSessionMessageProjections)
    const surface = replay.surface.nodes.map(seq => {
      const event = replay.eventAt(seq)
      if (!event || event.seq !== seq || !isSurfaceEvent(event)) throw new Error('source-cut-invalid')
      return snapshotSessionEvent(event)
    })
    signal?.throwIfAborted()
    return { header, raw, surface, inheritedEventCount: inherited, cursor: lease.cursor }
  } finally {
    lease[Symbol.dispose]()
  }
}
```

该校验的内容一致性来自**同一个 events 前缀和官方重放**，不是例中 cursor 的完整性断言。detached replay 不注册为 live Session，不创建讨论、不写日志或 Storage。未知 projection/事件或重放失败时来源不可用，0 模型、0 写，不退回无 projection 的解析。依赖须通过公开 package export 并与 Harness 固定版本一致；新增 catalogue 的显式依赖声明属于未来实现范围，本轮不改依赖或源码。

**前置 Gate G-SNAPSHOT（实施前必须通过，本轮未运行）：**在隔离、无 Provider 的官方运行时夹具中执行上述适配器；静止源上与 `readSurface` 做逐字段深比较（nodes 顺序、完整事件/source/content、header、inherited 边界与 capture），而不是只比 cursor。覆盖 live、cold prepared、fork、surface replacement、image-offload projection 和未知 projection 拒绝；在 lease 后追加/替代事件或更换冷日志代，结果仍只能来自旧 lease。另构造相同 ID/header/cursor、不同内容的两代，明确证明二者不能混配。成功、取消和异常分支均检查 lease 释放。差异验证仅在受控静止源做；生产一致性不依赖第二次读取。Gate 未通过则停止所有新提案入口，不用双读 cursor 比较兜底。

锚点必须是当前 surface 上唯一匹配的、已结算且具有可用 text 的 `assistant/message`，不是 live chunk、attempt、tool-only 回复、替代后已隐藏的消息或别的 Session 的 ID。capture 含锚点，绝不含锚点之后的回复/引用；若当前 surface 在锚点之前的位置含有 raw seq 晚于锚点的替代内容，保守返回 `source-changed`，不混入未来内容。首版更新路径拒绝 inherited/fork 前缀中的锚点；普通本地锚点可使用其逻辑 Session 的有界前文，来源只归属于当前逻辑 Session，不能冒称原父 Session 的新讨论。

复用 12 条 / 12,000 字符预算及既有规范化、截断规则；新增 **仅内存** 的每条 selected event seq、message ID、截断标志，用于证明候选与实际捕获的对应关系。durable `capturedContext` 仍只有 `{role,text}`。`startSeq/endSeq` 是捕获边界，不代表其中每个原始事件都被纳入，也不代表未截断。

### 3.2 Host 自动发现的引用证明（不约束主动库选择）

针对捕获实际选中的 human event：

1. 从同一 raw cut 重放官方 inbox splice 语义，找到与 admitted user ID 对应、已领取且未取消的唯一原始直接用户输入。排除仅排队、已取消/替换、pre-step 拒绝、claim 后未 admission 的输入；ID 重用或映射歧义不得猜测。
2. 用已有 canonical URI parser 从该原始输入解析 pin；Host 读取该精确 IdeaVersion。需要核对该 admission 的 dsh-idea 引用 recall 中的 pin 一致性，作为是否实际采用该引用的交叉证据。**recall 不是捕获正文，也不是独立信任根**；只凭 source 字符串、标题、模型引用的 JSON 或 wrapper 都不能授权写入。
3. 无原始输入、缺少 admission 证明、纯文本伪造 wrapper、只有 assistant/其他插件提及目标、格式异常，均不能产生可写候选。原始 canonical mention 仍完整保留在 admitted 用户事件时，可直接证明，无须强行要求 inbox 格式一致；仍须检查真实 user source 和 Host 版本解析。
4. 截断的人类消息不用于自动目标推导，避免用模型根本没见到的截断片段作判断；UI 提示范围不足。锚点以后的输入，以及 capture 范围以外更早引用，一律不补入。

若旧日志缺少上述证据，仅将**自动发现**标为 unavailable，保持新建默认并提供「从 Idea 库选择已有 Idea」。不新增 Session 事件补造历史、不迁移日志、不扩大来源扫描。G-REFERENCE 需通过官方离线日志关联矩阵后才可开启自动推荐；失败只阻止自动推荐，不能把缺少历史 pin 变成主动库选择的禁止条件。单快照来源本身不可用时，两种更新路径都不能生成提案。

### 3.3 自动候选与用户主动选择是两种目标来源

自动候选按 `(ideaId, referencedVersionId)` 去重，同 Idea 不同 pin 不合并；展示 Host 标题、ordinal、当前/历史标记和轮次。范围仍限于锚点 capture；较早 Turn 即使只有一个，也不能自动预选或宣称当前主题延续。仅本轮唯一且无歧义的引用可作预选建议，仍由用户选择模式和批准提交。

**用户主动选择不依赖历史引用：**无近期引用、长对话、旧日志不支持自动恢复、截断丢失 pin，均可点击「更新已有 Idea → 从 Idea 库选择」。复用现有只读 `idea/search` / `idea/get` / 版本读取，搜索不调用模型，也不扩大 Session 来源窗口。客户端提交的 ideaId 只是本次选择意图，Host 必须重新读取其存在性、权限、active 状态及完整当前版本，生成绑定 capture 的 selection token；不接收客户端标题、base draft 或来源正文作为事实。

仅内存标记 `selectionKind: 'reference-candidate' | 'explicit-library'`，与 `source.capture` 分开。主动选择无需伪造 canonical mention、admission、recall 或“曾经引用过”；来源仍只有 Host 捕获的当前 Session/anchor/range。选择不证明整段讨论都在讲该 Idea，必须在预览中标明目标由用户选择，并由用户审阅修改。不得向用户历史插入假消息来证明此意图。

| 情况 | 冻结交互及 Host 行为 |
| --- | --- |
| 无自动候选 / 无近期引用 / 无法恢复旧引用 | 保持新建默认，主动更新及库选择可用；自动发现失败与捕获来源失败分开反馈。 |
| 本轮唯一、当前版本候选 | 提供更新/新建，可建议目标；Host 重验后方可生成。 |
| 多候选或仅较早轮次候选 | 不自动预选；明确选择候选并确认相关性，或主动从库选择其他目标。 |
| 主动库选择且没有任何历史 pin | Host 从当前 Idea 读取新基线并展示；用户确认目标即可生成，无需补造历史引用或额外模型分类。 |
| 历史 pin / 同 Idea 多版本 | 保留原始 pin；按 3.4 明确确认当前基线，不能强制重新引用后才能更新。 |
| archived / deleting / deleted / 不可读或无权限 | 对应目标不可更新，0 模型；用户可换目标或走合法的新建流程。 |

### 3.4 历史版本：明确确认当前基线，禁止静默 rebase

选择引用 vN 的 Idea 时，Host 保留 `referencedVersionId=vN` 作为引用事实，另读 `currentVersionId=vM`。展示“讨论引用 vN，将以当前 vM 为新基线生成提案；旧版本保留”，由用户明确确认；此确认不是提交，也不改原始 mention。

Host 为这次选择生成 targetToken，绑定 captureId、ideaId、**Host 当前 baseVersionId=vM**、选择方式、原始引用 pins 及是否需要历史基线确认。prepare 只有在 `confirmBaseVersionId` 精确等于 token 的 vM 时才能越过历史基线确认门；不能用可复用的 `true` 代替版本绑定。选择库中同一 Idea 不得隐藏当前 capture 中已证明的旧 pin。没有历史引用的主动选择展示 Host 当前版本，不要求证明不存在未知的更早引用。

prepare 前再次检查当前版本仍是 vM；若确认后已变成 vK，返回 version-conflict、0 模型，须重新读取并明确确认新基线，不自动把确认延伸至 vK。模型生成中或 commit 前再次漂移也冲突，不自动重拟稿或提交。提案和 commit 的 expected/base 都是用户确认的 vM，不是 vN。

模型证据明确区分 Host 当前 baseline 与历史引用信息；如使用历史版本正文，必须由 Host 按原 pin 读取、有界封装为独立不可信参考，不替换 currentDraft，也不混进对话 capturedContext。没有历史引用证据的主动选择不编造历史数据。无论选择方式，生成都至多一次模型调用，确认/发现/库搜索均为 0 模型。

## 4. 提议的最小 RPC 与信任边界

下列为**待实现契约**，当前基线没有这些普通对话入口。生成 Typert 描述必须随未来源码一起更新，不手写生成文件。

| 入口 | 输入 / 输出及约束 |
| --- | --- |
| 新增 `idea/inspectMessageSave` | `{sessionId,messageId}` → Host `captureId`、有界统计、候选（含本轮/较早轮次证据标记）及原因；0 模型、0 Idea durable 写入。captureId 是不透明的临时凭据，不是 preparation/proposal ID。 |
| 扩展 `idea/prepareFromMessage` 的可选 `captureId` | 新 UI 的「新 Idea」携带 captureId，Host 校验 Session/anchor 并使用冻结捕获；仍复用原提取/create 流程。老调用无此字段时保持原路径。一次明确生成至多一次模型请求，无隐藏重试。 |
| 新增 `idea/selectMessageEvolutionTarget` | `{captureId, selection: {kind:'reference-candidate',candidateId} 或 {kind:'explicit-library',ideaId}}` → Host targetToken、当前基线版本/ordinal、历史 pin 提示及确认要求。库搜索复用现有 RPC；Host 校验身份、目标和当前版本，0 模型。不接受客户端基线正文。 |
| 新增 `idea/prepareMessageEvolution` | `{captureId,targetToken,confirmBaseVersionId?,confirmEarlierReference?}` → `{proposalId,ideaId,baseVersionId,draft,sourceStats}`。Host 核对 token 所属 capture、目标、当前 base；历史版本确认缺失/错误时 0 模型；较早自动候选仍需相关性确认。主动库选择不需要历史引用证明。不接受 browser 来源正文、seq 或 reason。 |
| 新增 `idea/commitMessageEvolution` | `{proposalId,expectedCurrentVersionId,draft}` → `{outcome:'committed'|'unchanged',ideaId,currentVersionId,ordinal}`；只提交编辑内容与期望版本，目标、来源、reason 全从 Host proposal 取。 |

capture registry 使用已有有界临时 registry 模式，64 项、30 分钟，实例隔离；验证调用归属时沿用现有 Remote principal/Host 权限，不把 token 当作新增跨用户授权。capture/selection/proposal 数据不写 Storage 或 Session；Host 重启、TTL 或驱逐后返回 expired，不伪造恢复。取消后不注册可提交的迟到 proposal。

生成更新草稿复用 `IdeaEvolutionService` 的 prompt/parser/route/stream 与 proposal registry：**用户选中并确认、且仍为当前的 Host draft + bounded history digest + 本次锚点捕获**，不是插件 recall 全文或浏览器 draft。全部按既有 prompt 作为不可信 JSON 证据；与当前 baseline 无关的讨论内容不应覆盖其未被证据否定的字段。生成至多一个直接模型请求，没有目标分类调用、Agent 工具循环或自动重试。

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

`关闭 → inspecting → 新建默认 / 主动选择更新 → 自动候选或 Idea 库选择目标 → 必要的当前基线确认 → preparing-new / preparing-update → 可编辑预览 → 明确保存 → 结果`。

- 点击「总结」立即在原 Modal 显示读取/准备态；inspect 不调用模型。无自动关联直接沿用原新建默认流程，同时始终保留主动库选择更新入口；不以没有历史 pin 禁用更新。有明确关联时展示模式选择；只有本轮唯一当前候选可预选，多候选及较早轮次候选不预选。选择后才生成一种草稿，准备与正式预览为不同状态，不伪造 ID。若先完成新草稿后用户另行主动选择更新，必须明确提示这是一次新的提案生成，不把它隐藏成目标识别开销或自动第二次调用。
- 主动选择复用 Idea 库搜索，不自动向聊天输入插入引用；历史 pin 先完成 3.4 的当前基线确认。更新预览分别显示原引用版本（若有）、经确认的当前基线、Host 目标、选择方式、来源锚点范围及截断提示；七字段可编辑，按钮明确「保存为新版本」。新模式仍为保存新 Idea，绝不将同一 ID 混给另一条提交接口。
- 切换模式/目标、取消、关闭、Escape、导航或 Session 卸载都 abort；generation + Session + anchor + mode + target 共同过滤迟到响应。保留打开瞬间双击遮罩保护；同状态重复点击只有一个请求。
- 提交中阻止重复操作；结果未知保留同一 proposal/payload；明确失败保留编辑，冲突解释基线已过期并只读刷新，不自动 rebase。用户另存新 Idea 必须显式重新选择，并走自己的 preparation，不能复用更新 proposal 绕过来源。
- 无变化显示「内容无变化，未创建新版本」；成功 receipt 重放后重新只读加载当前状态，不能把旧 receipt 的版本当成最新。
- 目标未选、多候选、历史基线未确认、自动引用证据不足（可主动选）、捕获来源变化/不可用、归档/删除、过期、模型不可用/失败/非法输出、取消、版本冲突、无变化、保存结果未知须有不同提示。所有 disabled 说明可读，明暗主题、窄窗口和键盘导航均覆盖。

## 7. 待决风险与实施门槛

| 风险 | 影响及审查决策 |
| --- | --- |
| 快照实现 Gate | 单 observation 的公开 replay 方案已给出，但尚未执行 G-SNAPSHOT；未通过不得声称与 readSurface 的内容契约一致。cursor 相等只用于完整性检查，不是跨读取内容证明。 |
| 旧输入与 admission 的可证明对应关系 | 公开事件具备素材，但未做新 resolver 的离线可执行证明；自动发现必须先通过 G-REFERENCE 的 inbox 编辑/取消/steering/claim 崩溃/插件变换矩阵；失败应关闭自动推荐，不阻止有合法 Host 捕获的主动库选择。 |
| 截断、compaction、fork 与超长 raw log | 自动候选不完整时仍允许主动选；捕获来源不可用时两路径均停止。公开 observation 可能物化整个指定 Session，不能承诺按 capture 大小的内存成本。不得为此扫描其他会话或绕过投影；必要时另议只读索引接口。 |
| reason 与幂等边界 | 需接受 existing reason 的中性“对话演进”含义及仅同一 Host 生命周期内 receipt；强跨重启幂等不在无 Storage 修改方案内。 |
| 多主题普通对话 | 确定性识别只能证明引用及选择，不能证明每段正文都只讨论该目标。用户预览、可编辑及明确批准是必要门槛，不宣称自动语义归属已经解决。 |

本文件与配套 Instructions 需独立架构审查后才可作为实施依据。本轮仅文档；没有产品、Harness、Storage、真实 Profile 变更，没有 Provider 或测试调用。工作区无关 drift 与其他分支保留。

本次定点修订仅更新本 Freeze 和配套 Instructions。G-SNAPSHOT/G-REFERENCE 是后续实施前置验证，未在本轮执行；没有实施源码或修改正常 Profile。
