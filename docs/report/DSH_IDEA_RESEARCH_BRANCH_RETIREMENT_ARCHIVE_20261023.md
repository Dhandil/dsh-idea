# dsh-idea 历史研究分支退役归档

日期：2026-10-23。归档前 main：`35dbb58d74ab0d96828d8cbf2d3d24ae9ad4571c`。

依据用户的独立审查及退役决定：原 P2B-G0 不再适用于已接受的 P2-Lite；PERF-C2 研究没有真实模型收益验证，P0/P0R 最终仍为 **BLOCKED**。本文保留可复用结论、证明边界和关键 SHA，不将历史执行结果提升为新的架构验收或 live 授权。

## 1. 退役范围与关键提交

| 删除的历史分支 | 退役时本地及远端共同 tip | 最终定位 |
| --- | --- | --- |
| `codex/dsh-idea-p2b-g0-source-proof` | `d7677a0b522609c500b72cb058f4e14b28f867a5` | 旧 P2A 的隔离来源证明，非正式业务实现 |
| `codex/dsh-idea-perf-c2a-architecture` | `9141f1e520b86fe9fb6d3a4160b3d6af74693649` | 评价指引提案及 C01–C50 离线矩阵 |
| `codex/dsh-idea-perf-c2b` | `e7b393dca57eee1b32b095498278591b469a2b4c` | 原 C2B 实现及后续 C2C 实验准备；分支名不等于最终内容阶段 |
| `codex/dsh-idea-perf-c2c-p0` | `016d2abc012df7a76d559501a6dbe6cd65130e68` | P0/P0R 安全驱动与证明，最终输入上界门禁 BLOCKED |

其他审计定位点：

- 固定研究 Harness：`86a402200d95fecef4529d969836f1fe13c6cb0d`，0.2.1-alpha.4；不能直接外推到其他版本。
- G-SNAPSHOT 初始夹具：`804a651812974d765b10b6eff15bec7810f8c690`；修复 tested：`e46aa6b9db5c6eb27d87c61d71bce4081a57be90`；修复报告：`d51095a2a938dfa7b429164974bafd591803774a`。
- G-REFERENCE tested：`bdebf85501dbb52aef34bdefcedda75db3bfd64a`；报告为上表 G0 tip。
- 原 C2B candidate：`df4f3a817479f77719bd9932f31c94b668bd4803`；A/B baseline：`67c4d11fbcd6d6e6c383e6f3ddd09c664e1337b7`；实验准备：`e7b393dca57eee1b32b095498278591b469a2b4c`。
- P0 初始安全驱动：`9b09b39af63dca93a29c617e7c1fea148aa537ae`；SSE 分块修正：`7bc8e4f52c0a04592728bde4bc0e53f132554037`；P0R 为上表最终 tip。

## 2. P2B-G0：保留证明方法，不保留自动推荐需求

- **G-SNAPSHOT**：公开 `observeSession → Session.create → surface.nodes/eventAt` 可从单一 observation 构建同源只读重放。cursor 相等不证明内容相同；固定 lease 必须保留同一代内容，独立 `readSurface` 仅作隔离测试 oracle，不能作为业务双读取兜底。
- 初始历史结果为 **11 PASS / 3 FAIL**，原因是合成 assistant 记录缺少官方 step 生命周期。修复 turn/step 生命周期及 JSONL header 默认值后，最终 **14/14 PASS、typecheck PASS**，G-SNAPSHOT 获独立验收；保留原失败事实，不据初始夹具错误判定架构失败。
- **G-REFERENCE** 历史执行记录为 **43/43 PASS**，连同 snapshot 回归共 **57/57 PASS**。可靠推荐须唯一串联 canonical 固定 pin、Inbox claim、实际 user admission 与已结束 step 的 assistant 锚点；claim、标题或独立 recall 都不足以证明准入归属。
- 编辑/取消/替换、未准入输入、steering、崩溃窗口、ID 歧义、fork/compaction、截断和伪造 recall 均需保守拒绝；自动推荐不可用不等于禁止用户主动从库选目标。来源本身无效时，主动选目标不能绕过来源门禁。
- 证明限定于上述 Harness、可信 Host 日志及 concrete driver；不证明任意旧格式、新协议、恶意 Host 插件或正式业务已验收。没有实施正式 RPC、UI 或自动候选业务。P2-Lite 已明确采用用户选目标，**不接入这套自动归属恢复**。

## 3. PERF-C2A/C2B：结构正确性与真实收益分开

- 研究只对当前新领取的直接用户输入、唯一固定 Idea pin 及严格中英文评价白名单提供非强制指引；未知、研究、查证、实现、多 pin 等情形 skip，保留原引用渲染和权限链路。资格不能由 label、标题、Idea 正文、历史或其他插件决定。
- 合适通道是已有 user-role `dsh-idea/recall`，不增加消息或分类模型，不改全局 System Prompt，不设置工具硬上限。下游拒绝/取消优先，可选指引失败回退原引用；原引用错误不能借回退放行。
- 原实现历史记录为 **7 files / 129 tests PASS**，覆盖 C01–C50、真实离线 Agent Loop、并发、恢复、恶意内容和仍可执行工具，typecheck、Host/Client build 通过。**这些不是模型节省 Step、时间、费用或保持回答质量的证据。**
- recall 的指引随历史持久保留，后续研究仍能看见旧文字；不重新注入不等于请求级物理隔离。跨轮影响必须由真实模型质量对照检验；claim-before-admission 崩溃窗口也没有被插件修复。
- main 已独立接受选择性移植的 **Prompt V2**：实现 `6616c9c6a0c557700c5a49691dccfd9ffcce8033`，归档基线 `c0194edf477d836e6a8b2099b19db20717723b60`。本次不撤销或修改它；已接受的结构/功能证据仍不能替代尚未完成的真实收益验证。参见 [Prompt V2 报告](DSH_IDEA_PROMPT_V2_IMPLEMENTATION_20261022.md)。

## 4. C2C/P0/P0R：真实 A/B 未运行，最终仍 BLOCKED

- A/B 设计固定模型、配置、工具、Idea 和输入，覆盖简单评价、明确研究、跨轮研究、白名单不匹配；同时记录 Step、工具、耗时、四桶 usage 及盲评质量，不预设收益。历史异常的 25 Steps、42 次工具调用、826,518 累计 Token 不能单凭数量判定无效；其中 cache-read 781,952，不等于同量独立新输入或实际费用。
- 历史 pilot 为 **8 会话 / 10 轮**，60 次 wire attempts、500,000 四桶 Token、US$2.50、15 分钟 ceiling；32 会话仅是扩展方案。这些是已退役的预算设计，**不是运行授权或当前价格承诺**。
- 预算须覆盖每次真实 wire dispatch，包括异常、重试和辅助路径；未知/异常 usage 不退款并停止。保留 SSE 跨分块解析、全量 System/tools/wire 参数冻结及实际 tool-use 边界计数的研究结论，不能仅在工具执行或首个请求处计数。
- 初始 P0 同时缺少完整输入上界与全依赖构建对应证明。P0R 为指定 darwin-arm64 模块集合补齐 **35 个 workspace 包、211 个 JS emit、34 个 bundle、本机 native，以及 6 个第三方包 / 834 个发布文件**的对应证据；最终 focused **3 files / 42 tests PASS、typecheck PASS**。这不是任意平台、插件集合或上游全供应链证明。
- **剩余阻塞：不能认证完整 Messages 请求的 16,384 输入 Token 保守上界。** 官方离线 tokenizer 的 `model_max_length`、JSON 编码计数和少量替身样本，都不能覆盖 System、工具 schema、thinking/工具结果历史及服务端模板开销。输出 2,048 的限制与通过项不能解除输入门禁。
- 最终保持 `inputBoundCertified=false`、`liveAuthorized=false`；真实 Provider 请求为 **0**，没有真实 A/B 收益或跨轮质量结论。未来若重启研究，必须重新审查协议计数/保守预留及预算，不沿用未经证明的上界、不静默放宽，也不以真实请求试探。

## 5. 历史来源与本次归档边界

历史文档按第 1 节 SHA 定位：G0 的 `DSH_IDEA_P2B_G0_SOURCE_PROOF_20261022.md`、`DSH_IDEA_P2B_G0_SNAPSHOT_REPAIR_20261023.md`、`DSH_IDEA_P2B_G0_REFERENCE_PROOF_20261023.md`；C2A 的 `DSH_IDEA_PERF_C2A_ARCHITECTURE_PROPOSAL.md`；C2B/C2C/P0/P0R 的同名 implementation、preparation、safety-preflight、directed-unblock 报告。本文件保存长期结论；原实验代码、驱动和大型 JSON 不迁入 main，不作为后续活动执行资产。

归档前核验：本地 main、origin/main、远端 main 匹配预期；四分支本地/远端 tip 一致，无未推送提交；tracked 工作区与暂存区无独有未提交改动，唯一 worktree 使用 main，当前 chat 无附加 worktree，未发现其他活动 dsh-idea chat 占用这些分支。既有未跟踪 drift 原样保留。

本次只提交本文。正式产品、测试、实验驱动、Freeze、Harness、Storage/Migration、真实 Profile 均不修改；不运行测试、构建或 Provider。先将本文推送并验证可从远端 main 读取，再按用户授权删除四个已退役的分支引用，执行 fetch/prune 并核验只剩 main。执行后的最终 SHA 和删除结果由交付回执记录。
