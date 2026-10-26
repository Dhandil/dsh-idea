# T13.3B Repair1 — 用户授权的最终源码 Full 补验

日期：2026-10-26。交付：
**`DSH_IDEA_T13_3B_REPAIR1_READY_FOR_ARCHITECTURE_REVIEW`**。

用户在前次报告明确说明最终 SHA 缺 Full 后回复“授权”，允许针对最终修复
执行额外一次 fresh Full。本授权执行 **1 次**，exit 0，解除
`FINAL_SHA_FULL_REQUIRED` 验证阻塞；不自行宣告独立架构验收或合并 main。

## 提交与历史

| 项目 | 值 |
| --- | --- |
| BASE_MAIN / 开始时远端 main | `9ebcf3ea0cc540cf2abb928bd06f0ffa0c646ff4` |
| 修复 SHA / 本次 TESTED_EXECUTABLE | `43d917edc9e7533f00308107b8456c067ae6f89e` |
| 实际执行 HEAD（报告提交） | `a5c677b6e79e175672a87404f6775900b4a805b0` |
| 独立分支 | `codex/dsh-idea-t13-3b-explicit-recall` |
| 新授权 Full | **1282/1282 PASS，exit 0，40,992ms** |
| 真实 Provider / 浏览器 / VM | **0 / 0 / 0** |

开始时工作区干净、一个 worktree，远端分支与 a5c677b 一致，strict audit `[]`。
43d917e → a5c677b 恰好新增前次报告及证据两份文档；Full driver 在执行前再次
断言整个提交差异只在 docs 下。因此本次执行源码、测试、脚本、配置与最终
43d917e 完全一致，没有切换/重置工作区，也没有额外产品修改。

[前次阻塞报告](DSH_IDEA_T13_3B_REPAIR1_IMPLEMENTATION_20261026.md) 与
[前次 Full 证据](DSH_IDEA_T13_3B_REPAIR1_FULL_EVIDENCE_20261026.json) 原样保留：
前次 ff9f7c5 上 **1278/1278 PASS**，之后补充 topic 目标证据检查及 4 项回归，
所以当时阻塞成立。其 `finalRepairCoveredByThisFull=false` 仍正确指向那次
旧执行。本次是 Repair1 的**第 2 次 Full**，由新授权允许，不改写为全阶段
只执行了一次，也不把旧 Full 当作最终源码的证明。

## 实际 Full 结果

| 阶段 | 结果 |
| --- | --- |
| root/package strict pre/post gates | 全部 PASS，仅本轮合法 owning active run |
| Runtime | **30/30 PASS**；fail/cancel/skip/todo 均 0 |
| Typert generation | PASS |
| typecheck | PASS |
| 默认并行插件测试 | **65 files / 1252 tests PASS**，无非通过余项 |
| Host build | PASS |
| Client build | PASS |
| 完整 root pnpm verify | **exit 0，40,992ms** |
| Full 后独立 strict audit | **`[]`** |

本授权内仅运行这一次 fresh Full，没有再跑 focused，也没有修改测试或重试。
先前最终 focused **355/355 PASS** 及静态门结果继续有效；本次 Full 额外覆盖
完整最终测试集合。新增直接请求、how-to 询问、否定/引文/问答，以及控制器
不派发检索/合法 NONE 静默等证据见前次报告。仍不声称覆盖所有自然语言，
也不把离线替身当作真实模型或浏览器验收。

通过 .dev 新 run 执行未修改的 root verify；HOME/DSH_HOME/TMPDIR、Vite cache
全新。使用既有 Node `v24.21.0`、固定 pnpm `11.28.5`，Vitest `4.1.11`。
没有 install、全局工具链修改、timeout 扩大、默认串行或 skip；原有 tsdown
dependency bundling/zod 提示保留。

[本次完整脱敏输出与计数](DSH_IDEA_T13_3B_REPAIR1_AUTHORIZED_FULL_EVIDENCE_20261026.json)
明确记录 testedSha、executionHead、docs-only 差异、授权及 Full 次序。
本次原始日志 SHA-256：
`a23092046013c4dc6423dd82327fc57acd3245cb5985515f7c16a7f6db610b19`。
该 hash 只标识此次原始日志，不是依赖闭包或可复现构建认证。

## 清理与完整性

外层 run 输出 `removed:true`；精确 run 目录、owner 记录及生命周期 lease 均
不存在，runs/owners 为空，独立 strict audit `[]`。没有保留原始日志、临时
HOME、存储、shim 或任务子进程。

默认 system/shared 例外为 `not-enumerable`；固定共享 pnpm entry 检查为
`still-present-not-deleted`。不宣称系统级产物完全不存在，不清理共享缓存、
MCP、用户浏览器或其他项目。真实 Profile、Session 正文、凭据和 Keychain
未访问，未启动正常 DSH。

本授权只新增本报告和对应证据，43d917e 源码及测试未变；旧报告不覆盖、
不删除。推送原独立分支并 fetch/ls-remote 核验，不合并 main，等待独立审查。
