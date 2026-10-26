# dsh-idea

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立外部插件，
包名 `@dsh-external/dsh-idea`，loader id `dsh-idea`。
用于保存长期想法，在普通对话中引用、更新，并在合适的讨论情境中提醒用户。

当前 API 兼容参照为 Harness `v0.2.1-alpha.4`
（`86a402200d95fecef4529d969836f1fe13c6cb0d`）；依赖声明见
[插件 manifest](packages/dsh-idea/package.json)。未来 Harness 版本仍需验证实际兼容性。

## 使用入口

- 回复下方灯泡 → **总结**：选择「保存新 Idea」或「更新已有 Idea」，主动生成草稿，编辑后确认保存。
- 输入框 **+ → Idea**：搜索、添加固定版本引用，也可「记录新想法」后直接保存或 AI 整理。
- **设置 → Ideas**：查看当前内容、编辑、归档、恢复、删除及管理单条 Idea 的提醒状态。
- 回复下方灯泡 → **相关**：查找当前讨论可能用得上的 Idea，查看后可添加到对话。
- **Idea 提醒**：符合条件的新对话轮次结束后，可能出现「查看 / 引用 / 本次忽略 / 暂停提醒」。

操作步骤、失败处理及找回示例见 [用户使用指南](docs/USER_GUIDE.md)。

## 当前能力与边界

| 能力 | 当前状态 |
| --- | --- |
| 保存、预览与更新 | 已实现 Web UI 和 Host RPC。生成草稿不等于保存；更新目标必须由用户从库中明确选择。 |
| 内容与版本演进 | UI 只展示一份当前有效内容；底层保留线性不可变旧记录、来源和并发保护。历史读取及旧讨论/演进后端继续兼容，当前 UI 不提供版本管理或专用讨论入口。 |
| 引用与继续讨论 | 已实现普通对话的固定版本引用；用户添加并发送后，引用才参与上下文注入，不自动改绑最新版。 |
| 相关 Idea | 已实现显式查询和可选添加；结果可以为空，模型判断不保证召回或准确率。 |
| 情境提醒与明确找回 | 已实现确定性 Detector、候选检索、Judge、每会话至多一次展示预算及单 Idea 持久暂停。明确找回只触发检索，不保证展示；表达识别为有限规则支持。 |
| 自动识别更新目标、自动保存、跨会话冷却、忽略后学习偏好 | 未实现；「本次忽略」不会永久暂停 Idea。 |

提醒在符合条件的新 live 完成轮次上触发，不因打开历史会话而重放。默认语义后端为
`llm`，另有需显式配置的 `embedding` 和 `off` 模式；见
[配置实现](packages/dsh-idea/src/semantic/config.ts) 与
[Bundle 默认配置](packages/dsh-idea/cordis.patch.yml)。AI 整理、总结、相关查询和部分提醒链路
可能调用模型；本地搜索、直接保存和手动编辑不调用模型。

当前内容交互依据 [P2-Lite Architecture Freeze](docs/architectue/DSH_IDEA_P2_LITE_ARCHITECTURE_FREEZE.md)
及 [Implementation Instructions](docs/implements/DSH_IDEA_P2_LITE_IMPLEMENTATION_INSTRUCTIONS.md)。
早期文档记录当时的阶段行为，不能直接当作当前 UI 说明；退役研究见
[研究归档](docs/report/DSH_IDEA_RESEARCH_BRANCH_RETIREMENT_ARCHIVE_20261023.md)。

## 验证范围

- [P2-Lite B2](docs/report/DSH_IDEA_P2_LITE_B2_IMPLEMENTATION_20261023.md)：隔离真实 Web 浏览器，使用受控模型替身，真实 Provider 调用 0。
- [T13.2 关闭报告](docs/report/DSH_IDEA_T13_2_FINAL_ARCHITECTURE_ACCEPTANCE_CLOSURE_20261015.md)：历史真实 Judge/UI 功能证据；Gate 2 的 Provider 阶段归属仍是 BLOCKED，以仅限该次功能验收的例外关闭。
- [T13.3A 异步修复](docs/report/DSH_IDEA_T13_3A_ASYNC_INTERACTION_REPAIR_20261026.md)、[T13.3B 最终源码 Full](docs/report/DSH_IDEA_T13_3B_REPAIR1_AUTHORIZED_FULL_20261026.md)：两项修复已通过独立架构审查；链接记录中的离线竞态/识别及回归证据不等于真实模型或浏览器验收，也不能证明整体召回率、误报率。

这些记录针对各自提交和范围，不构成当前版本真实模型效果、召回率或全部浏览器环境的承诺。

## 开发与验证

使用现有 Node 24 / pnpm 工具链及已安装、已构建的本地 Harness checkout。
从本仓库根目录执行：

```sh
pnpm install
DSH_CHECKOUT=/absolute/path/to/deepseek-harness pnpm setup:dev
pnpm typecheck
pnpm test schema.spec.ts
pnpm build
pnpm build:client
```

`setup:dev` 链接所需 Harness 包及同一 zod 实例；每次 install 后应重新执行。
它会修改本地依赖链接，不属于任务临时清理。当前 Runtime 在 macOS 验证，
Windows 缺少进程/句柄适配时拒绝执行，Linux 需单独验证。

创建执行资源的其他命令使用 `pnpm dev:run -- <command> [args...]`；
上述验证脚本已自动包装。完整验证入口为 `pnpm verify`，包含 strict audit、
Runtime 测试、Typert 生成、类型检查、插件测试及 Host/Client 构建。
按任务授权决定是否运行 Full，保留每次原始结果。

临时资源放在被忽略的 `.dev/runs/<run-id>/`；成功、失败、取消后检查
`removed: true`，结束执行 `pnpm dev:audit:strict`。
路径、并发、取消、异常恢复及系统例外见 [开发运行规范](docs/DEV_RUNTIME.md)
和 [任务入口约束](AGENTS.md)。Runtime 不是网络或 OS 沙箱。

## 安装到 Harness Web Profile

这是用户主动安装时的步骤，不是测试准备命令。先完成上面的依赖链接和
Host/Client 构建，备份目标 Profile 配置并检查已安装 Bundle，避免重复注册。
在对应 Harness 源码仓库执行官方插件管理命令，目标是插件包目录：

```sh
pnpm dsh plugin --profile web add /absolute/path/to/dsh-idea/packages/dsh-idea
```

包 manifest 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，注册 Host 服务及 Web Client。
安装/更新后应在无活跃任务时正常重启目标 Web Profile，核对 Ideas 和灯泡入口。
保留现有数据和其他插件，不通过版本豁免绕过兼容问题。此文档同步任务未执行安装或重启。

## License

MIT
