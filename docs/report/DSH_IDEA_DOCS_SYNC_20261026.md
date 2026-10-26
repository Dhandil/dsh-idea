# DSH Idea 文档同步执行报告

日期：2026-10-26。结果：`DSH_IDEA_DOCS_SYNC_READY_FOR_ARCHITECTURE_REVIEW`。
仅更新文档，提交独立审查；不合并 main。

## 基线与交付

| 项目 | 值 |
| --- | --- |
| 指定基线 / 开始时远端 main | `3f1f6958f2ea6188cf37a1b5f4eb3987bd9eaadc` |
| 独立分支 | `codex/dsh-idea-docs-sync`，直接从指定基线建立 |
| 文档实现 SHA | `0f96f1735a37e4a27ad673ece206391c95383532` |
| 产品源码 | 与基线相同；本轮没有新增可执行实现 SHA |
| Full / 测试 / 构建执行次数 | **0 / 0 / 0** |
| 真实 Provider / 浏览器 / Web / VM | **0 / 0 / 0 / 0** |

开始时工作区干净，唯一 worktree 是项目根目录，没有额外 checkout。
本地 main 原为 `bcc35e3d09581fdb7d22a518f9d456d58ed39c22`，本轮不推进它；
远端 main 已由其他已完成工作推进至用户指定基线，以 `ls-remote` 核实。

## 变更文件

- [README](../../README.md)：替换 T1-only 范围、全手动操作及“未来安装”描述，补充当前入口、能力分层、兼容参照、证据边界和正确的插件包安装目录。
- [用户使用指南](../USER_GUIDE.md)：新建/直接保存、AI 更新与手工编辑、普通引用继续讨论、相关查询、情境提醒、明确找回、引用/忽略/暂停及生命周期操作。
- [开发运行规范](../DEV_RUNTIME.md)：补齐导航和 root/package verify 区别、正式生成物边界、Full 原始结果保留、固定嵌套 pnpm 入口及精确恢复/结束审计。
- 本报告：单独记录执行、验证和限制，不改写历史报告或 Freeze。

## 源码与架构核对

下表是只读源码比对，不是本轮运行的功能测试。

| 文档结论 | 当前依据 |
| --- | --- |
| 一个 Idea 只展示当前内容；新建/更新由用户选择，旧后端保留 | [P2-Lite Freeze](../architectue/DSH_IDEA_P2_LITE_ARCHITECTURE_FREEZE.md)、[Instructions](../implements/DSH_IDEA_P2_LITE_IMPLEMENTATION_INSTRUCTIONS.md)；`src/client/IdeaSaveDialog.tsx`、`IdeaSection.tsx`、`index.ts`，均位于 `packages/dsh-idea/`。 |
| 明确生成、可编辑确认；AI 更新持久保存本次来源、冲突优先、无变化零写 | `src/preparation/update.ts`、`update-registry.ts`、`src/service.ts`、`src/client/state.ts`。普通 manualEdit 与旧 evolve 的兼容契约没有被文档扩大为新行为。 |
| 截至所选回复，最多 12 条 / 12,000 字符；不含插件 recall/工具正文 | `src/preparation/context.ts`、`update.ts`。不声称捕获全会话或模型完整历史。 |
| 普通引用固定版本；继续讨论使用普通会话；灯泡相关窗口仍存在 | `src/client/index.ts`、`IdeaAssistantActions.tsx`、`IdeaRelatedOverlay.tsx`、`src/reference/`。区分 Related 结果窗口与 P1 已删除的关联对话卡片。 |
| 确定性本地搜索；明确找回只是检索机会 | `src/search/service.ts`、`src/resurfacing/detector.ts`、`tests/resurfacing-detector.spec.ts`；中文/英文指南示例确实存在于当前测试中，但本轮未执行测试。 |
| 提醒复核、原子版本 claim、引用前检查、暂停作废迟到引用 | `src/resurfacing/service.ts`、`src/service.ts:claimResurfacingDelivery`、`src/client/resurfacing-state.ts`。保留每会话预算、持久暂停及本次忽略的区别。 |
| 模型使用与配置边界 | `src/semantic/config.ts`、`cordis.patch.yml`、`src/preparation/service.ts`。默认 llm；不把 `off` 描述为全局暂停，不把零分类调用描述为整个提醒链路零模型。 |
| 当前命令与清理边界 | root/package `package.json`、`scripts/dev-run.mjs`、`dev-runtime.mjs`、`packages/dsh-idea/scripts/setup-dev.mjs`、`generate-typert.mjs`、`vitest.config.ts` 及根 AGENTS。 |

上述 `src/` 和 `tests/` 均相对 `packages/dsh-idea/`。
安装命令仅用 Harness `86a4022` 的 `apps/cli/src/plugin.ts` 及插件 manifest/Bundle
做静态核对，未运行插件安装、版本豁免或 Web 启动。

## 验证记录

本轮选择文档一致性检查，不运行 fresh `pnpm verify`，避免无必要生成 Typert/lib
或把历史测试当作当前执行。没有 typecheck、build、install、测试或浏览器检查。

1. `git diff --check`：PASS。
2. 在 `pnpm dev:run -- node --input-type=module` 内进行临时检查：三份交付文档的
   **20 个仓库内链接、6 个代码围栏标记、13 个根脚本命令入口、15 项实际 UI 文案**
   一致；另核对 root/package verify 差别、验证脚本包装、源码捕获上限和两个找回示例。
3. 初版检查器曾把正文 “pnpm toolchain” 当成命令，exit 1。
   限定为 Markdown 代码围栏/代码跨度后重查 PASS，exit 0；没有修改产品或放宽产品门禁。
   两次都不是 Full 或功能回归，不隐藏首次检查失败。
4. 报告补充后的检查：**4 份文档、29 个本地链接、6 个围栏标记、5 个表格 PASS**；
   变更路径白名单恰为上述三份文档和本报告，本地 main 未变化。
   产品、测试、配置、依赖、锁文件、Freeze 和 AGENTS 均保持基线内容。

验证表述保留历史边界：[P2-Lite B2](DSH_IDEA_P2_LITE_B2_IMPLEMENTATION_20261023.md)
是受控模型的真实 Web 浏览器操作；
[T13.3A](DSH_IDEA_T13_3A_ASYNC_INTERACTION_REPAIR_20261026.md) /
[T13.3B](DSH_IDEA_T13_3B_REPAIR1_AUTHORIZED_FULL_20261026.md) 是各自提交的离线证据，
没有改写为当前源码的真实模型/浏览器或独立架构验收。
[T13.2](DSH_IDEA_T13_2_FINAL_ARCHITECTURE_ACCEPTANCE_CLOSURE_20261015.md)
的真实 SURFACE/UI 事实保留，同时保留 Gate 2 BLOCKED、Provider 5/20 但 Judge
逐条阶段归属未证明的历史；不推广该次功能例外。

## 清理、例外与 Git 边界

初版及修正版检查，以及报告补充后的文档范围检查，均由 `.dev` wrapper 回收，
输出 `removed: true`，后续 strict audit 为 `[]`。
没有持久化检查脚本、临时日志或新截图，未访问真实 Profile、Session 正文或凭据。
系统和共享资源两个默认例外的结束状态均为 `not-enumerable`；
不据此声称系统级资源已全部枚举或不存在。无本轮新增的外部资源路径。
没有改变共享 MCP、浏览器、Harness Core 或其他项目。

文档实现和本报告分开提交，只推送独立分支。交付时用 fetch 和 `ls-remote`
核验分支 HEAD 一致，并复核 main、本地工作区、worktree 与 strict audit；
最终报告 SHA / FINAL_REMOTE_SHA 在交付回复给出，避免文档自引用 SHA。
