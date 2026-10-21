# DSH Idea PERF-C 只读性能调查

**状态：待架构审查。** 基线 `4675671314368bfc566c8abc315e511cceaa6bf2`；只读参照 Harness `86a402200d95fecef4529d969836f1fe13c6cb0d`。本轮未改产品、测试、Harness、配置或真实 Profile；未启动模型、浏览器或测试。下列 Session 数字取自本机已有的压缩事件日志，只提取事件类型、时间、工具名、文本长度和 Provider 用量。本文不保存 Session ID、路径、工具参数、会话正文或凭据。

## PERF-01：观察到的执行链

已定位到与“引用 Idea 后询问其评价”相符的单个真实 Turn。日志有 **25 个 step、25 条结算的 assistant/message、42 对 `tool/call`/`tool/result`**；工具名全部是 `bash`，42 个结果均未标记错误。前 24 个 step 各发出 1–2 次 Bash，最后一步没有工具调用；无 `assistant/attempt`、重试事件或 surface replacement。该 Turn 从 `turn/start` 到 `turn/end` 为 **86.253 秒**。按事件边界求和，`step/start → assistant/message` 为 **79.873 秒**，`assistant/message → step/end` 为 **5.941 秒**，其余边界间隔约 **0.439 秒**。前一段包括 Host 请求组装、Provider 排队/生成与传输，不能直接等同 Provider 耗时。

工具调用链显示这是 Agent 选择的反复本地探查，不是 dsh-idea 自动执行 42 次工具：42 个 Bash 命令均不同，命令文本中 32 个提到 Harness 源码、8 个提到 Session 日志；出现 `ls`、`grep`、`find`、`sed`、`head` 等读/筛选动作。工具结果的纯文本累计约 **101,629 字符**、单条最大约 **13,830 字符**，工具参数文本累计约 **14,707 字符**。这些长度不是 token 数，也无法据此证明每种输出各贡献多少 token。日志记录了一个独立的标题模型请求；下面的 Turn 用量仅汇总 25 个 assistant 结算，不把该标题请求混入。

### Provider 记录的 Token 构成

| 桶 | 25 个 step 合计 | 对总量的含义 |
| --- | ---: | --- |
| 未缓存输入 `inputTokens` | 33,100 | 本轮新处理的输入，不能只归因于 Idea |
| 缓存读取 `cacheReadTokens` | 781,952 | 多次请求复用的历史前缀；约占总量 94.6% |
| 缓存写入 `cacheWriteTokens` | 0 | 此路由在这组结算中报告为零 |
| 输出 `outputTokens` | 11,466 | 包括 Agent 的多步生成与最终回复 |
| **合计 `totalTokens`** | **826,518** | 四桶之和；并非 82 万个新输入 token |

首个 step 的 `totalTokens` 为 10,551，末个为 50,787；24 个工具 step 后的历史增长与重复请求解释了累计总量为什么远大于单次上下文。Prompt 侧缓存读取占 `inputTokens + cacheReadTokens + cacheWriteTokens` 约 **95.9%**。DeepSeek Messages 适配器将 Provider 的 `input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens` 分别映射到这四桶，并按桶求 `totalTokens`；Harness 的 Turn 用量按已结算尝试求和，在缺失或矛盾用量时不会显示“精确总量”。本记录每个 step 都有这四桶，因此可精确复算。参见 Harness `packages/llm/llm-deepseek/src/translate.ts`、`packages/llm/token-meter/src/turn-usage.ts` 与 `packages/client/ui-chat/src/client/chat/TurnUsagePanel.tsx`。

### Idea 上下文与责任边界

该 Turn 在第一个 step 持久记录了 **两条** `dsh-idea` 来源消息：一次性讨论续接上下文约 **2,015 字符**，本次显式引用的 Idea 投影约 **1,481 字符**。这是两种不同功能同时生效；没有发现同一种注入反复执行。两条消息随后作为 Session 历史随每步请求保留；没有 surface replacement。它们可能包含语义重叠，但本调查不保存正文，也没有逐字段重合度证据，不能声称它们单独造成了 42 次工具调用或 82 万 Token。

- **dsh-idea**：`packages/dsh-idea/src/continuation/service.ts` 在首次接受的 pre-step 注入一次续接上下文，并用持久 Session 日志防重复；`packages/dsh-idea/src/reference/service.ts` 对直接用户消息解析固定版本引用，最多 5 个 pin，一次追加大小上限 48,000 序列化字符的引用投影。它不注册/执行 Bash，不决定 Agent 是否继续探查。
- **Harness Agent/工具**：`packages/core/agent-loop/src/agent.ts` 每步以 Session 派生消息和可见工具构建请求；模型返回工具调用后执行并写入结果，再进入下一步。历史消息、工具结果与系统提示随多步请求重复进入 prompt；`packages/core/agent-loop/README.md` 也说明这一 Token 效果。工具并发配置约束同一步并行量，不是全 Turn 工具数量上限。
- **Provider**：选择工具调用及生成内容的是模型响应；输入/输出/缓存桶由适配器转译 Provider 报告。当前日志能证明所用路由和结果，不能证明模型为何选择每一次 Bash，也不能把 79.873 秒拆成 Provider 排队、推理、网络和 Host 各自的精确耗时。

## UX-02：从“总结”到预览

用户观察到约 **2–3 秒**。现有证据没有这一点击的同步分段时间戳，因此不能认定瓶颈在 RPC、模型或 React 渲染中的某一段。静态链路如下：

1. `packages/dsh-idea/src/client/IdeaAssistantActions.tsx` 点击「总结」立即关菜单，`IdeaSaveSurface.prepare` 同步设定 `preparingMessageId`，随后调用 `idea/prepareFromMessage` Remote。
2. Host `prepareFromMessage` 依次读取 Session surface；以该 assistant 消息为锚点截取最多 **12 条、12,000 字符**可见讨论；读取会话模型选择（缺失时用默认）；构造严格 JSON 提取提示。
3. `ctx.llm.stream()` **直接调用一次模型**，无 Agent Loop、工具或插件内部重试；流结束后检查 finish、拼接文本、解析/校验七字段草稿，并注册临时 preparation ID。既有 T11.1 实测报告证明过单次提取调用，但没有这次 2–3 秒的阶段计时。
4. Remote 返回后，Client 更新 `modal` 状态；`IdeaSaveDialog.tsx` 仅在 `modal !== null` 时挂载预览。保存是之后的独立操作，不属于“点击总结→出现预览”的路径。

因此，当前 UI 在完整模型提取成功前不会出现预览；可以确认等待模型结果位于关键路径，但**各阶段实际耗时比例未知**。失败/取消也需与成功路径分别计时；不应把单次用户体感直接解释为 Provider 延迟。

## 建议顺序（待实施，不在本轮改动）

| 优先级 | 方案 | 预期收益 | 风险 / 范围 |
| --- | --- | --- | --- |
| 1 | 对 PERF-01 和 UX-02 加隐私安全的阶段计时：记录 step/工具数量、输入四桶、工具结果字节分布；总结链路标记点击、RPC 到达、Session 读取、路由解析、模型首 token/结束、RPC 返回、modal 首帧。只记录计数/时长，不记录正文。 | 先区分 Provider、Host 与 UI，建立可复核基线。 | 低；dsh-idea Client/Host 加少量测量，Harness 现有事件/用量可复用。 |
| 2 | 为“总结”立即显示可取消的准备态预览骨架，成功后填入草稿；保留现有单次提取、取消和提交语义。 | 降低 2–3 秒无反馈的感受；不宣称缩短模型耗时。 | 中；仅 dsh-idea Client，需覆盖取消、导航、失败和焦点管理。 |
| 3 | 对带固定 Idea 引用的“评价/讨论”提供明确的范围化回答路径或 Agent 指引：证据足够时先依据已注入快照作答，需要外部事实时再选择工具。先做 A/B 与质量回归，不给全局工具调用设硬上限。 | 有望减少与问题无关的源码/日志探查、step 数和累计缓存流量。 | 中高；影响 Agent 决策，需要防止误抑制必要查证；普通引用语义应保留。 |
| 4 | 在证明字段重合且不破坏固定版本与续接语义后，研究同一 Turn 中续接快照与显式引用投影的去重或共享摘要。 | 减少每步重复承载的上下文。 | 中；dsh-idea Host，需验证多 Idea、不同版本、重进会话、失败恢复；当前无法量化收益。 |
| 5 | 评估 Harness 的工具结果裁剪/按需展开、历史压缩与工具选择提示，对长输出保留定位和可追溯性。 | 控制后续 step 的 prompt 增长。 | 高；Harness Core 跨插件行为，须单独架构评审。 |

**结论边界：** PERF-01 的事件数、时间、Token 四桶和两条 Idea 上下文已有同一真实 Turn 的直接证据；42 次 Bash 的具体决策理由、每条工具输出对应的 Provider token 份额尚不可从现有统计证明。UX-02 只有用户观察到的总等待与静态链路，没有分阶段实测。本调查没有执行 Provider 请求或性能复验。
