# P1：「关联 Idea」对话卡片移除

结果：`DSH_IDEA_P1_DISCUSSION_CARD_REMOVAL_READY_FOR_REVIEW`，等待独立审查，未合并 main。

日期：2026-10-22。分支：`codex/dsh-idea-p1-remove-discussion-card`。

## 基线与修改范围

- 显式 fetch `origin main` 后，从最新远端 main `67c4d11fbcd6d6e6c383e6f3ddd09c664e1337b7` 建立独立分支。
- IMPLEMENTATION_SHA：`111bde50f3b20c5f0421159f210202196bb0b23b`。
- 删除 `IdeaDiscussionCard.tsx`（含组件专用 Props 类型）、`idea-discussion-card` 槽位注册、专用 CSS、八条中英文文案及组件专用测试。
- 更新 Client 挂载回归：六个槽位组件、仅保留 `idea-resurface` dock；切换及重进会话仍能构造其余 dock 状态，不读取卡片 RPC。保留灯泡操作、Idea 命令及固定版本引用 codec 的断言。
- Host 讨论关联、`getDiscussionCard` 兼容 RPC 及其 Host wire 类型保留；这些不是残留的前端组件类型。讨论、演进、引用服务和版本模型未修改，设置详情中的「讨论」按钮保留。
- 未引入 PERF-C2B/C2C/P0R 分支提交。未修改 Harness Core、Storage schema、Migration、Provider 配置或正常 Profile。

## 自动验证

环境：Node `v24.21.0`，pnpm `11.28.5`；沿用本机工具链，未更改全局版本。

| 验证 | 结果 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm build`（Host） | PASS |
| `pnpm build:client` | PASS |
| 聚焦 Vitest：13 文件、212 项 | 全部 PASS |
| `git diff --check` | PASS |

聚焦文件：`client.spec.tsx`、`client-continue.spec.tsx`、`client-evolution.spec.tsx`、`client-search.spec.tsx`、`client-read.spec.tsx`、`remote-continue.spec.ts`、`remote-evolution.spec.ts`、`discussion.spec.ts`、`continuation.spec.ts`、`reference-service.spec.ts`、`reference-uri.spec.ts`、`version.spec.ts`、`evolution.spec.ts`。

覆盖原有讨论复用与恢复、上下文不重复注入、pending/delivered 判定、固定版本引用、演进 readiness/准备/审批保存/冲突、不可变版本历史及 Client 入口。模型接口使用既有受控替身，本轮未运行全量测试。新增挂载检查首次暴露测试 fixture 缺少真实接口形状的 `sessions.binding`；补齐 fixture 后，完整上述聚焦集合通过，没有为此修改产品逻辑。

## 隔离真实 Web 验证

使用 Harness `86a402200d95fecef4529d969836f1fe13c6cb0d` 的已构建 CLI/Web 与本轮插件 Host/Client 构建产物。采用仓库外临时 `DSH_HOME`、临时 HOME/Workspace 和独立 Chromium 临时上下文，启用 Chromium sandbox。Profile 组合官方 base/web 和本地 Idea Bundle；仅在临时 Profile 关闭标题模型并设 semantic 为 `off`。进程环境不继承凭据，Host fetch 和浏览器请求限制为 loopback；未访问正常 `~/.dsh`。

通过官方 `workspace/create` 建立临时 Workspace，通过确定性的 direct quick capture RPC 创建合成 Idea v1，再通过 `continueDiscussion` 持久化关联；没有发送聊天输入。随后正常停止并冷启动临时 Host，验证既有记录恢复。

| 操作 | 结果与证据 |
| --- | --- |
| 冷启动后打开预先持久化的关联会话 | 点击侧栏会话，核对所选节点对应原关联会话；输入框正常，卡片 DOM 数为 0。只读关联 RPC 仍返回原 Idea、v1 和 pending。 |
| `+ → Idea` | 「添加文件或调用指令」→「Idea 搜索并添加已保存的 Idea」→选择合成样例→「添加到对话」；输入框出现引用，未发送。 |
| 设置入口与灯泡 | Ideas 设置入口及灯泡可见；详情「讨论」仍在，空讨论下「生成演化提案」禁用并显示原因。 |
| UI 手动追加版本 | 详情→「编辑」→填写保留原因及当前结论→「保存为新版本」；UI 显示当前 v2 及 v1/v2 历史，官方 `getVersions` 精确返回两个不同版本。 |
| 原关联保持固定版本 | v2 保存后，只读关联 RPC 仍显示原讨论固定于 v1，未自动改绑或注入。 |
| 再次重进、窄窗口及深色 | 关闭设置、刷新并重进原会话；600×800 深色窗口仍能看到引用输入框，没有关联卡片。 |
| 卡片请求与异常 | 定稿验证仅有两次驱动显式只读关联 RPC；UI 自动卡片 RPC 为 0。pageerror 为 0，浏览器外部请求为 0。 |

截图仅含合成数据：[引用及无卡片的会话](assets/DSH_IDEA_P1_reference.png)、[v1/v2 历史与保留的讨论入口](assets/DSH_IDEA_P1_versions.png)、[深色窄窗口重进](assets/DSH_IDEA_P1_reentry_dark.png)。

验证边界：旧关联恢复使用本轮预先持久化的合成记录，未打开真实用户会话。真实浏览器覆盖 pending 关联、引用和手动版本保存；delivered 状态、防重复注入及模型演进准备/审批保存由聚焦 Host/Client 测试覆盖，未做真实 Provider 端到端演进验证，不据此宣称模型质量已验证。

## 调用量、清理与工作区

隔离 Session 日志中 `turn/start`、`request/header`、`assistant/message` 均为 0；真实 Provider 调用及计费 Token 为 0。

浏览器均已在 finally 中关闭，临时 Host 正常 SIGTERM 退出；18795 已无监听，临时目录对应的驱动/浏览器/Host 进程无残留。临时 HOME、Profile、Workspace、Idea、Session、驱动、认证信息与日志全部删除，只保留本文和三张合成截图。

Harness SHA 未变，保留其既有未跟踪项。Idea 仓库既有 `.DS_Store`、`.playwright-mcp/`、`docs/.DS_Store`、`docs/architectue/.DS_Store`、`packages/dsh-idea/.DS_Store` 均保留且未纳入提交。正常 Profile 和真实数据未修改。
