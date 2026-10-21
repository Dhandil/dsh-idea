# PERF-C1 最小集成验收

结果：`DSH_IDEA_PERF_C1_INTEGRATION_READY_FOR_FINAL_REVIEW`。

TESTED_SHA：`8898cf31ba3a1fa367d2060fbc0f60ef74a0bc2c`。分支：`codex/dsh-idea-perf-c1`。Harness：`86a402200d95fecef4529d969836f1fe13c6cb0d`，`0.2.1-alpha.4`。2026-10-21 执行；未发现需要修复的 PERF-C1 缺陷，本次提交仅归档本文和三张合成内容截图。

## 环境与方法

使用仓库外一次性 `DSH_HOME`、独立 Workspace、真实 DSH Web（127.0.0.1:18795）及插件 Host/Client 构建产物。Workspace 通过官方 `workspace/create` RPC 创建；没有使用原生目录选择器。临时 Profile 组合官方 base/web Bundle 和本地 Idea Bundle；语义检索设为 `off`，标题模型关闭。

临时 Node 驱动调用 Harness 已构建的 `runProfile`，通过官方 `ctx.llm.registerAdapter` 注册内存受控适配器。聊天回复、总结 JSON 均为合成内容；总结输出受测试驱动释放，记录 AbortSignal 并故意在收到 abort 后仍释放输出，以验证迟到响应防护。真实 Web 的聊天操作栏、插件状态、RPC、Session 读取、路由解析和解析逻辑均未替换。驱动及适配器仅存在于一次性目录，没有修改 Harness Core 或插件源码。

Host 以清空后重建的环境启动，无 API key 或真实凭据；Seatbelt 禁止读取和写入真实 `~/.dsh`。Host fetch 和浏览器请求只允许 loopback；未出现外部请求拦截记录，也未调用真实 Provider。浏览器使用独立临时 Profile，最终复核启用 Chromium sandbox，未连接用户 Chrome Default。

启动准备时修正了临时驱动中的语义模式枚举和模型目录元数据。首轮检查后发现本机旧 Client Bundle 缺少 TESTED_SHA 最后一处计时清理语句，遂从未修改的 TESTED_SHA 重新执行 Host build 和 Client build，并完成下面全部定稿复核。表内数据来自该最终构建，不混用早期 Bundle 的结果。

最终构建 SHA-256：

| 产物（packages/dsh-idea/lib/） | SHA-256 |
| --- | --- |
| client.js | `79579e3fc96dbacc38678e36d54cd122cc6d78555c1d9a4a20005e447b5b0ece` |
| preparation/service.js | `972a18f871d08914080f42e255190b65c2dc29340e4945f29f081cda902fcff1` |
| remote-host/service.js | `6b84d70cd5faf6237ffd3f494f5ceca1487e455364e83f3b6279caea7eaf97be` |

## 定稿复核结果

| 检查 | 真实操作及证据 | 结果 |
| --- | --- | --- |
| 即时反馈 | 聊天回复操作栏 `button[aria-label="保存为 Idea"]` → `menuitem 总结` → `dialog 保存 Idea` / `status 正在生成 Idea 草稿…`。从 menuitem 点击调用到准备态可见约 38 ms；模型输出此时仍被挂起。 | PASS |
| 取消及迟到响应 | 准备态点击「取消」，受控适配器收到 abort；随后释放输出，dialog 数仍为 0。 | PASS |
| 原位成功转换 | 再次总结并释放合法 JSON；转换前后的 dialog DOM 身份相同；`textbox 标题 *` 可编辑并保留修改，原有七字段表单和保存按钮可见。 | PASS |
| 关闭 | 正式预览点击「关闭」正常退出。另一准备请求点击「关闭」后 abort 计数增加 1；释放迟到输出也不重开。 | PASS |
| 重复点击 | 对真实「总结」menuitem 发出快速双击，仅新增 1 次提取。第二击落在新出现的 Modal 背景上，按现有 Modal 行为关闭并取消；释放输出后仍关闭。 | PASS |
| Session 切换 | 在准备态触发另一个已持久化 Session 的真实侧栏节点 click handler，实际切换并卸载旧 overlay；abort 增加 1。释放迟到输出后，新 Session 和切回的旧 Session 都无 dialog。 | PASS |
| 已有 Idea 引用 | 「添加文件或调用指令」→ `option Idea 搜索并添加已保存的 Idea` → 搜索已直接保存的隔离样例 → 选择结果 →「添加到对话」。原输入框出现 Idea 引用；未发送该输入。 | PASS |
| 内存计时与隐私 | 真实 Client 实例和 Host 服务快照可读；全部阶段只有 `count`、`totalMs`、`maxMs` 数值。 | PASS |

Session 切换的边界：Modal 会拦截背景指针，因此使用浏览器执行该已渲染侧栏节点的 `element.click()`，触发原有导航 handler；没有直接修改 Session、插件 state 或伪造 RPC 结果。这验证实际导航卸载后的取消语义，不宣称用户能穿过 Modal 背景点击侧栏。

截图（仅合成讨论和草稿）：[准备态](assets/DSH_IDEA_PERF_C1_INTEGRATION_pending.png)、[同一弹窗中的可编辑草稿](assets/DSH_IDEA_PERF_C1_INTEGRATION_preview.png)、[原有引用入口结果](assets/DSH_IDEA_PERF_C1_INTEGRATION_reference.png)。

## 分段观测

Client 快照通过 CDP 只读取得真实 React slot 的 `recordRendered` 闭包所持有的 surface，并调用其 `performance.snapshot()`；未修改闭包、状态或 Bundle。Host 快照由临时 loopback 控制驱动读取真实 `ctx.ideaPreparations.performance.snapshot()`，没有给产品增加诊断 RPC。

| 阶段 | count | totalMs | maxMs |
| --- | ---: | ---: | ---: |
| client.pending-render | 5 | 20.900 | 5.400 |
| client.rpc | 5 | 396.700 | 283.200 |
| client.preview-render | 1 | 2.400 | 2.400 |
| host.session-read | 5 | 3.094 | 0.751 |
| host.capture | 5 | 0.318 | 0.170 |
| host.route | 5 | 2.880 | 0.826 |
| host.model-first-response | 1 | 9.748 | 9.748 |
| host.model-complete | 1 | 9.898 | 9.898 |
| host.parse | 1 | 0.430 | 0.430 |
| host.prepare-total | 5 | 898.392 | 402.403 |
| host.rpc-handler | 5 | 898.917 | 402.594 |

阶段名固定，快照没有正文、提示词、凭据、Session/Message/Idea ID。代码仅在内存聚合，没有增加默认逐请求日志。这里的模型耗时由受控释放决定；Client/Host 汇总还包含取消时点差异，不能作为真实 Provider 性能基准，也不能相加解释为同一个请求的完整时间线。

## 调用量、验证边界与清理

定稿复核：5 次受控总结调用，4 次收到 abort，1 次成功完成提取；没有自动重试或重复请求。前面的环境准备与初轮验证另有 2 次受控聊天调用及 6 次受控总结调用；整个任务共 13 次内存替身调用，真实 Provider 调用和计费 Token 均为 0。内建真实 Provider 路由虽随官方 base Bundle 注册，但没有配置凭据或被调用。

Host build、Client build 均成功；定稿真实浏览器断言全部通过，pageerror 0。未重跑全量或无关测试。未重新验证真实模型质量、Provider 端到端耗时、持久化保存幂等性或全部主题布局；这些不属于本次最小集成复核。

浏览器 context、浏览器进程、临时浏览器服务及 DSH Host 均已关闭。受控挂起请求全部释放；测试进程检查为 0，18795/18796/18798 均无监听。一次性 home、Profile、Workspace、Session、Idea、驱动、原始日志与浏览器 Profile 全部删除，仅保留本文和三张脱敏截图。真实 Profile、数据及正常 Web 未访问。

产品源码、测试、Harness Core 和数据模型无改动；Harness 既有未跟踪 `deepseek-harness` 保留。Idea 仓库原有 `.DS_Store`、`.playwright-mcp/` 等无关 drift 保留。未合并 main。
