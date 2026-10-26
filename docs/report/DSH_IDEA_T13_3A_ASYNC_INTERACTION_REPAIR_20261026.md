# T13.3A 最终审查收口：暂停与引用异步竞态

日期：2026-10-26。结果：修复及离线验证完成，提交独立审查；不合并 main。

| 项目 | 值 |
| --- | --- |
| 本轮基线 / 开始时远端分支头 | `858f8d59c7d26f23085c1cc0fb8a2bf69c5dfd73` |
| 前轮实现 | `8f9c485744139d3654c63bd74c1a28388da7e6a2` |
| 分支 | `codex/dsh-idea-t13-3a-stale-reminder` |
| REPAIR_SHA / 本轮 TESTED_SHA | `67cbf5909c798a023c414fb2e572cad19de6db02` |
| main（保持不变） | `bcc35e3d09581fdb7d22a518f9d456d58ed39c22` |
| 本轮唯一 fresh Full | **1126/1126 PASS，exit 0，40,632ms** |
| Provider / 浏览器 / VM | **0 / 0 / 0** |

开始时工作区干净，当前独立分支及 ls-remote 匹配基线；strict audit 为 `[]`。
沿用原分支，没有带入其他分支或修改 main。只有当前一个 worktree。

## 根因与最小修复

原实现只检查 `pauseInFlight` 当前值：引用 A 的只读 get 等待期间，暂停 P
开始又失败，P 把该标志恢复为 false；此后 A 的迟到结果仍可能 append。
若 A 返回读取错误，还会清掉提醒条和暂停失败提示。旧的
`referenceInFlight` 布尔值也会阻挡用户在 A 未返回时重新明确发起引用 B。

本轮只修改 `client/resurfacing-state.ts` 和对应 Client 回归：

- 每次引用记录独立递增操作代次。
- 用户发起暂停时同步递增代次，立即使此前引用失效，并释放旧引用的本地
  in-flight 占位；暂停 RPC 进行中仍不接受新引用。
- 暂停失败后，失败提示和提醒条保持原有行为；旧引用结果在任何状态更新或
  append 前必须通过代次检查，因此不能迟到执行，也不能清掉失败反馈。
- 用户之后明确点击引用可以启动新操作，不必等待旧读取结束；旧操作 finally
  仅能释放自己的占位，不能解锁/覆盖新操作。

这是逻辑失效，不承诺取消已经发出的只读 RPC；旧 RPC 即使完成，其结果也被
忽略。后续请求来自用户的新点击，不是自动重试。没有增加模型调用。
原版本/生命周期/暂停复核、Host 原子 claim、普通 T9 固定版本引用、Schema、
Storage、Harness Core、配置及失败文案均未修改。

## 精确 RPC 顺序回归

先仅添加六项测试，产品源码仍为原基线，执行带名称过滤的红测：
**6 failed / 80 filtered out**。观察到实际错误 append、失败提示被清除、以及
新引用被旧 in-flight 阻塞；不是夹具异常或空洞断言。随后实施上述修复。

| 用例 | 受控顺序与实际修复结果 |
| --- | --- |
| P 返回业务错误，A 迟到有效 | A 等待 → P 开始 → P 失败 → A 返回；append=0，提醒条及失败提示保留；之后显式点击引用成功一次 |
| P 返回业务错误，A 迟到无效 | 同顺序；A 的失败不得清空提醒条/失败提示；之后显式引用成功 |
| P RPC reject，A 迟到有效 | transport rejection 同样永久失效旧 A；失败 UI 保留，显式新点击成功 |
| P RPC reject，A 迟到无效 | 旧错误结果不覆盖暂停失败反馈；显式新点击成功 |
| A 在新 B 完成前返回 | P 失败后先启动 B，再放行 A；A 不 append、不解锁 B，第三次点击仍折叠；放行 B 后只 append 一次 |
| A 在新 B 完成后返回 | P 失败 → B 先成功 → A 最后返回无效结果；最终仍为 REFERENCED，append 恰好一次 |

测试使用 deferred gates 控制真实控制器的 RPC 返回顺序。前四项通过真实
React strip 检查可见提醒条、`role=status` 的“暂停失败，请重试。”，并点击
真实组件引用按钮；后两项检查新旧完成顺序、RPC 次数和实际 append。
都没有读取私有代次字段作为测试 oracle。普通 T9 历史版本回归继续通过。
这些是组件/控制器验证，不是浏览器验收。

## 验证与唯一 Full

| 阶段 | 结果 |
| --- | --- |
| 最终 focused | **6 files / 161 PASS**，含六项新回归、暂停、Domain 和 T9 引用相关测试 |
| typecheck | PASS |
| Host / Client build | PASS |
| whitespace / 变更范围检查 | PASS，仅 Client 控制器与测试 |
| 本轮唯一 root pnpm verify | **exit 0，40,632ms**，无重跑 |
| Full Runtime | **30/30 PASS**，fail/cancel/skip/todo 均为 0 |
| Full 插件默认并行测试 | **65 files / 1096 PASS**，无非通过余项 |
| Full Typert / typecheck / Host build / Client build | 全部 PASS |
| Full root/package strict pre/post gates | 全部 PASS，仅本轮合法 active run |
| Full 后独立 strict audit | **`[]`** |

Full 在干净的修复提交上，以新的 `.dev` run、独立 HOME/DSH_HOME/TMPDIR 和
空 Vite cache 执行。固定现有 pnpm `11.28.5` entry；Node `v24.21.0`，
Vitest `4.1.11`。root/package verify 脚本未变，没有 install、Provider、
浏览器、VM、超时扩大、默认串行、skip 或 Full 重跑。

[完整脱敏 Full 输出](DSH_IDEA_T13_3A_ASYNC_REPAIR_FULL_EVIDENCE_20261026.json)
保留阶段、数量、exit code 和原日志 SHA-256：
`bac316e1b420e0926790ba6abb2b35660e3ad6b401dc2514783f3d6785414c63`。
该 hash 只标识本次原始日志，不是依赖闭包认证。保留原有 tsdown dependency
bundling/zod 提示。前轮 1120/1120 Full 报告与证据原样保留，不能混称为本轮
结果；本轮为新增六项回归后的 1126/1126。

Full 后源码及测试与 REPAIR_SHA 完全一致，只追加本报告和本轮证据。

## 清理与交付

本轮六次拥有运行资源的外层命令（红测、focused、三项静态门、Full）均输出
`removed:true`。Full run、owner 记录与 lifecycle lease 均不存在；
`.dev/runs`、`.dev/owners` 为空，最终 strict audit `[]`。没有保留原始日志、
测试 HOME、临时存储、shim 或任务子进程。

外部例外保持透明：默认 system/shared 结束检查为 `not-enumerable`；固定的
共享 pnpm entry 为 `still-present-not-deleted`。没有据此宣称所有 OS 临时
产物不存在，也没有清理共享服务、浏览器缓存或系统目录。真实 `~/.dsh`、
正常 Profile、其他项目和所有无关分支未操作。

提交及推送原独立分支，随后 fetch / ls-remote 核验报告头一致；不合并 main。
最终报告 SHA 和远端 SHA 随交付返回，等待独立最终审查。
