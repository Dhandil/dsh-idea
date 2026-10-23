# P2-Lite-B2 Client 与当前内容 UI 执行报告

日期：2026-10-23。状态：`DSH_IDEA_P2_LITE_B2_READY_FOR_ARCHITECTURE_REVIEW`。仅提交独立审查，未自行验收或合并 main。

## 1. 基线与实施范围

- BASE_SHA：`521271383f1f9924b481ea15a536fe454f736cce`。
- 分支：`codex/dsh-idea-p2-lite-b2`。
- IMPLEMENTATION_SHA / TESTED_SHA：`7fd3905c918c55428ae5d1ebae2f1ea88370ebb3`。聚焦测试和构建针对该提交相同内容执行；最终浏览器加载该构建。截图与本文为后续单独证据提交。
- 依据：main 已接受的 P2-Lite Architecture Freeze / Implementation Instructions，以及已验收 B1。
- Harness：`86a402200d95fecef4529d969836f1fe13c6cb0d` / 0.2.1-alpha.4；Node `v24.21.0`、pnpm `11.28.5`、Vitest `4.1.11`。

实现提交只改变 `src/client/` 和相关测试。B1 Domain/Host、Remote 实现、Storage types/schema、Migration、依赖、Freeze 均未修改。没有引入自动引用归属、专用讨论会话、新 Agent Loop 或版本管理 UI；未触碰真实 Profile 或用户数据，未合并 G0。

## 2. 交互与状态

- 灯泡菜单仍为「总结 / 相关」。「总结」立即打开选择态，提供「保存新 Idea / 更新已有 Idea」；选择态没有 preparationId，不调用模型。
- 更新模式复用本地 `list(current)` / `search(scope=current)` / `get`。同标题目标以独立按钮和当前内容摘要区分，用户明确点选；不从引用或历史预选。目标读取失败、为空或归档时不能生成。
- 只有「生成草稿」触发准备。新建继续走 prepareFromMessage/create；更新走 B1 prepareUpdateFromMessage/commitPreparedUpdate。更新请求绑定新 requestKey、Session、锚点、目标及当前标记；保存只提交 updateId 与编辑后的 draft。
- 保留真实 AbortController、单 flight、迟到防护和双击遮罩保护。模式/目标变化中止旧准备；已有提案切换前确认丢弃，再由用户主动生成。用户改过预览后取消也需确认。
- 显示 Host 来源条数、起止范围及截断提示；预览可编辑，明确确认后才保存。冲突、失效及目标不可编辑保留草稿，不自动换基线或再拟稿。无变化显示「内容无变化」。
- 未知保存结果保留同一票据及原 payload，将草稿设为只读、禁止再确认，并只读获取目标当前内容供核对；Toast 结束不解除保护。不把读取结果当作自动成功或重写授权。
- Idea 库/详情只展示当前内容。删除旧历史、专用讨论、演化入口及其 Client 状态、样式、文案和失效测试；不再调用 getVersions/getEvolutionReadiness 等背景读取。保留 Host 旧接口、数据和内部并发标记。普通编辑使用原 manualEdit，按钮为「保存」。
- 新建、Quick Capture、搜索、引用、Related、提醒和生命周期保留。总结选择态纳入已有主动保存的提醒避让判断；成功保存刷新库，Toast 退场后的下一次成功仍会刷新。

### 浏览器发现并修复的布局问题

长预览加冲突提示会使原默认 Modal 的底部按钮超出视口。通过官方公开 `contentClassName` 增加可滚动区域，插件自己的 dialog 限制 `max-height: 100%` 和合理宽度；不改 Harness Modal。复验 390×680 窄窗口与真实深色设置，底部取消/确认按钮均在视口内，其余字段可滚动访问。

## 3. 聚焦检查

| 项目 | 结果 |
| --- | --- |
| Vitest | **23 文件，405/405 PASS**，无 skip；未跑无关全量 |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS，Host TypeScript 构建 |
| `pnpm build:client` | PASS |
| `git diff --check` | PASS |
| 范围核验 | 实现只含 Client/聚焦测试；B1、Schema、Migration、Harness、Freeze 不变 |

测试文件（在插件包执行 `pnpm exec vitest run`）：

```text
tests/client-p2-lite.spec.tsx tests/client.spec.tsx
tests/client-read.spec.tsx tests/client-lifecycle.spec.tsx
tests/client-t9r2.spec.tsx tests/client-t9r3.spec.tsx
tests/library-create.spec.tsx tests/reminder-control.spec.tsx
tests/quick-capture-client.spec.ts tests/client-resurfacing.spec.tsx
tests/client-search.spec.tsx tests/client-related.spec.tsx
tests/p2-lite-domain.spec.ts tests/p2-lite-registry.spec.ts
tests/p2-lite-session.spec.ts tests/p2-lite-update.spec.ts
tests/remote-evolution.spec.ts tests/evolution.spec.ts
tests/reference-projection.spec.ts tests/reference-service.spec.ts
tests/reference-uri.spec.ts tests/prompt-v2.spec.ts tests/remote-search.spec.ts
```

新增 B2 文件 22 项，覆盖明确生成、新建/更新分流、空库、同标题、迟到搜索/get、来源范围、确认保存、无变化、冲突/归档/过期、未知结果、错误分类、取消/切模式/切目标/卸载/Session 切换、放弃确认及并发提交。另补选择态提醒避让、两次成功之间 Toast 退场后的库刷新回归。旧 Client 讨论/演化测试按退场后的 UI 替换；原 Host 演进和引用兼容测试继续通过。

## 4. 真实 Web 浏览器验证

### 4.1 隔离与真实性

使用真实官方 DSH Web、base/web/本地 Idea Bundle 和本轮构建。通过构建后的官方 CLI `--profile web` 启动，临时 DSH_HOME、Profile、Workspace、Session、Storage 和原始日志全部在仓库外任务目录。Workspace 由官方 `workspace/create` RPC 创建；没有使用原生目录选择器。

Host 使用清空后重建的无凭据环境，Seatbelt 禁止读写真实 `~/.dsh`，网络只允许 loopback；真实 Provider adapter 在临时 overlay 中禁用。任务专属 LlmAdapter 只返回合成聊天/草稿，支持挂起、真实 abort、迟到释放和无变化输出。未修改 Harness 核心或产品 Host。

浏览器为单独启动的 Chrome、临时自动化 Profile、Chromium sandbox 开启，未使用用户 Default 或其他项目 MCP 浏览器。Playwright 通过实际 pointer/keyboard 操作页面，检查真实 DOM 和网络返回；组件测试不计为浏览器验收。浏览器路由仅允许 loopback，外部请求拦截计数为 0，pageerror 为 0。

### 4.2 实测结果与关键 locator

| 场景 | 实际操作与结果 |
| --- | --- |
| 即时选择与双击 | `button[保存为 Idea] → menuitem[总结]`；真实 `page.mouse.dblclick` 打开选择态，模型计数不变，无假 preparation。挂起更新时双击「生成草稿」也只有一次准备，第二击不误取消遮罩。PASS |
| 新建 | `button[生成草稿] → textbox[标题 *] → button[保存新 Idea]`；先出现可编辑预览，明确保存后 RPC list/get 可读新 Idea 和真实对话来源。最终构建另做两次新建，均主动生成、各一次请求，成功后分别 refetch 库。PASS |
| 明确更新 | `button[更新已有 Idea] → 目标按钮（标题+core） → region[当前内容摘要] → 生成草稿 → textbox[当前结论] → 确认更新`；选择目标前后模型计数不变，生成一次，用户批准内容保存到选中目标。另一同标题 Idea 不变。PASS |
| 来源保存 | 浏览器准备 RPC 的 session/锚点、sourceStats 的 start/end 与已保存 SourceDiscussion 逐字段相同，当前详情 source 指向该次来源，捕获为本轮 user/assistant 对话。旧内容/来源保留。完整模型输入与来源正文一致性另由 B1 聚焦测试证明。PASS |
| 无变化 | 受控输出返回 Host currentDraft；UI 显示「内容无变化」，前后完整 aggregate JSON 相同，current/时间/来源/事件不增。域层 update/put 为 0 的直接证明由本轮重跑的 B1 用例提供。PASS |
| 冲突 | 预览后用官方 manualEdit RPC 注入受控并发变更，再在真实 UI 确认；显示冲突，批准草稿保留，确认禁用，aggregate 只有受控并发编辑结果，没有 AI 附加写。PASS |
| 取消、关闭、Escape、遮罩 | 四次独立挂起更新，用真实按钮/键盘/指针中止；**先观察 Host AbortSignal 已触发，再释放迟到输出**，无重开、无写入，分别只有一次准备请求。PASS |
| 会话切换与返回 | 真实顺序：准备中 Escape 取消 → 新建会话 → 释放迟到输出 → 从侧边栏返回原会话；新旧会话均无迟到弹窗。原生 Modal 打开时会阻止应用会话快捷键，未侵入绕过。slot 不卸载直接更换 Session 的取消另有组件回归，不能混称为同一浏览器场景。PASS（所述顺序） |
| 丢失保存确认 | Playwright 一次性让实际 commit 响应完成后丢弃响应；Host 确认增加内容/来源各一次，UI 显示「保存结果未确认」，draft 只读、确认禁用，读取当前内容供核对。等待超过 Toast hold 后仍禁用；浏览器提交请求精确一次，无新 prepare 或重写。PASS |
| 当前内容库与旧数据 | `账号菜单 → 设置 → Ideas → 当前 Idea`；只显示当前内容，无历史/讨论/演化入口，进入详情没有 getVersions/readiness/continue 请求。通过旧 getVersion RPC 仍可读合成旧内容。隔离 Host 重启后复用同一数据仍可读取。PASS |
| Quick Capture / 手工编辑 / 生命周期 | 库内「＋ 新建 Idea → 直接保存」，再编辑标题并「保存」，归档/恢复正常；全过程模型计数不变。手工无变化保存禁用、取消回详情正常。PASS |
| 提醒 | 实际 Switch「暂停提醒 → 恢复提醒」，每步用官方 get 核验 resurfacingMuted，最后恢复 false；模型计数不变。PASS |
| 普通引用 / Related | `+ → Idea → option 目标 → 添加到对话`，固定引用加入草稿但不发送消息；模型计数不变。「相关」仍在灯泡菜单，本轮不触发其 Judge；功能成功/失败由 Client 聚焦测试覆盖。PASS（入口和引用操作） |
| 明暗与窄窗口 | 浅色正常流程、真实设置启用深色（colorScheme=dark，Modal 背景 rgb(44,44,46)），390×680 下按钮在视口内，长正文内部滚动，Escape 可用。PASS |

实际表单定位使用 role=textbox 的可访问名称；textarea 的 label textContent 包含初始值，精确 getByLabel 曾导致驱动等待超时，改用可访问 role locator 后继续。初期读取 Toast/inline alert 也曾命中两个元素，随后限定到当前 dialog。上述为驱动定位问题，没有以超时结果冒充功能通过。

本轮曾暂停后继续，工具运行时退出后重新启动本轮隔离环境；合成存储复用、原始来源及旧内容保留。所有关键断言以明确阶段结果记录，最终源代码改动（库刷新与票据编辑定位）有最终构建加载及响应丢失/连续保存复验。

### 4.3 截图（均为合成内容）

- [选择态](assets/DSH_IDEA_P2_LITE_B2_01-choice.png)
- [新建可编辑预览](assets/DSH_IDEA_P2_LITE_B2_02-new-preview.png)
- [明确目标与当前摘要](assets/DSH_IDEA_P2_LITE_B2_03-update-picker.png)
- [更新预览](assets/DSH_IDEA_P2_LITE_B2_04-update-preview.png)
- [冲突保留草稿](assets/DSH_IDEA_P2_LITE_B2_05-conflict.png)
- [窄窗口深色预览](assets/DSH_IDEA_P2_LITE_B2_06-narrow-dark.png)
- [当前内容详情](assets/DSH_IDEA_P2_LITE_B2_07-current-library.png)
- [普通引用入口保留](assets/DSH_IDEA_P2_LITE_B2_08-reference.png)
- [未知结果只读核对](assets/DSH_IDEA_P2_LITE_B2_09-uncertain.png)

最终 Client Bundle SHA-256：`82e54d256ea3fb5cf33cdd37294c594bd9d08e70078aefd8a7ca09b01e9416e6`。Host update pipeline：`71ff6882dbbf47def15bfa0b2db8ee0ef1f853d52a4f224e1a79e0399edb4eda`；域 service：`95dae19cf38d899459f3921c86faf584dba2eda7c70f400f6eb1e071165078d0`。

## 5. L01–L25 覆盖与边界

| Freeze 条目 | B2 / 复用验证 |
| --- | --- |
| L01–L02 | 零请求选择、空库、同标题、显式目标、迟到 search/get；真实无引用普通对话主动选库。长对话有界规则由 B1 捕获回归覆盖，无自动引用识别。 |
| L03–L05 | 新建/更新票据分流与批准 payload；Host 防伪/不存在/归档/漂移重跑 B1，浏览器确认受控保存前冲突。 |
| L06–L10 | B1 官方 live/cold/fork、非法锚点/replacement、截断、Prompt/parser 用例重跑；UI 来源范围/截断显示。没有重跑或移植 G0。真实模型提案质量不在离线证明内。 |
| L11–L13 | 单 flight、重复点击、错误、真实 abort/迟到、模式/目标/卸载/slot Session 回归；浏览器双击与四种取消、所述会话切换顺序。 |
| L14–L18 | 明确提交、无变化、冲突、相同/不同票据和 payload、队列/receipt/TTL/重启/uncertain 由 B1 与 B2 聚焦测试；浏览器新增来源、无变化、冲突、实际写后丢确认。无跨重启 exactly-once 声明。 |
| L19–L21 | 当前库/详情/编辑、停止旧读取、Quick Capture/搜索/引用/Related/提醒/生命周期、P1/Prompt V2 回归；真实库/引用/编辑/归档恢复/提醒及主题/窄窗口。IME/列表/离开确认由现有 UX 聚焦用例。未对 Related 真实模型判断作效果声明。 |
| L22–L25 | B1 来源正确性、冲突优先/零写/原子提交、旧 evolve/manualEdit/旧演进接口兼容重跑；Client 不替代 writer 判定。浏览器核对来源引用和旧内容，未引入任何持久结构变化。 |

SourceDiscussion 是 Host 当前可见的有界来源，不声称完整模型上下文或语义归属。取消不承诺中断 readSurface 底层 I/O，也不承诺写入准入后的回滚。未知结果仅供用户核对，未自动推断保存成功；票据/receipt 仍受 B1 的同进程 64 项/30 分钟限制，过期/重启后不能盲目新写。

## 6. 调用量、清理与交付

全程真实 Provider 请求与计费 Token **0**。累计受控 adapter 调用 **23**：合成聊天 1、提取 4、更新拟稿 18，包含环境准备、定位调试和后续复验，没有把这些计数冒称全部是单一最终流程。至少 6 次在运行中明确观测到 abort；暂停/关闭进程的额外中止不作为逐次完整计数。最终受控挂起数 0。

任务专属 Chrome 已 `browser.close()`；独立 Host 正常 SIGTERM 退出，18795/18798 均无监听，进程复核无本轮 Host/浏览器。仓库外临时 home/Profile、Workspace、Session、Idea、驱动、控制服务、原始日志和测试目录均已删除并确认不存在。仅保留合成截图和本文；没有停止其他项目进程或清理其他浏览器数据。

main 保持 BASE_SHA；G0 分支保留 `d7677a0b522609c500b72cb058f4e14b28f867a5`。原有 `.DS_Store`、`.playwright-mcp/` 与 Harness 未跟踪项保留。构建产物沿用既有忽略规则，不提交本机配置。独立分支提交推送后 fetch/ls-remote 核验，FINAL_REMOTE_SHA 在交付返回，完成后 STOP 等待独立架构审查。
