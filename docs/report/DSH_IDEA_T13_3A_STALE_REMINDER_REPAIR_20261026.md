# DSH Idea T13.3A — 过时提醒竞态修复执行报告

日期：2026-10-26。交付：**`DSH_IDEA_T13_3A_READY_FOR_ARCHITECTURE_REVIEW`**。
本报告提交独立审查，不自行宣告架构验收或合并 main。

## 基线与实现

| 项目 | 值 |
| --- | --- |
| 本地 main / origin/main / 开始时 ls-remote main | `bcc35e3d09581fdb7d22a518f9d456d58ed39c22` |
| 独立分支 | `codex/dsh-idea-t13-3a-stale-reminder` |
| IMPLEMENTATION_SHA / TESTED_SHA | `8f9c485744139d3654c63bd74c1a28388da7e6a2` |
| 工具链 | Node `v24.21.0` / pnpm `11.28.5` / Vitest `4.1.11` |
| 唯一 fresh Full | **exit 0，1120/1120 PASS，38,365ms** |
| 真实 Provider / 浏览器 / VM 启动 | **0 / 0 / 0** |

开始时工作区干净，只有当前一个 worktree。从指定 main 新建分支，未带入
UX-02A/B 提交。原分支保留。实现仅涉及 6 个源码文件、4 个测试文件；
报告及脱敏 Full 证据在实现冻结后追加。

## 修复内容

1. **Judge 返回后再次核验赢家。** `IdeaService.getResurfacingEligibility`
   只读核验存在性、删除进行中、active、确切版本及暂停状态。合法 SURFACE
   返回后必须再次通过；失败变为 none，并保留 canonical dropped reason。
   不替换为新版本，不重新 Judge，不重试。原 pre-Judge 保护保持。
2. **原子交付绑定预期版本。** `claimResurfacingDelivery` 必须接收 Judge 的
   `evaluatedVersionId`。保留 Idea mutation tail → conversation budget tail
   的锁序，在两个队列等待完成后校验资格，再执行预算 test-and-set。
   旧版本/非 active/暂停目标不写预算。已进入删除过程的请求保持 fail-closed。
3. **跨 RPC 响应及引用前复核。** 客户端 claim 携带确切版本；Host 拒绝的
   失效结果不会把本地 free 预算标为 consumed。CLAIMED 后发布前，以及用户
   点击引用时，各调用一次已有的只读 `idea/get`，核验身份、active、版本及
   `resurfacingMuted=false`，不能拿旧快照静默改绑新版。
4. **异步引用保护。** 重复点击合并；读取未返回时不插入 chip。销毁、忽略、
   新用户消息、草稿修改、暂停进行中/已成功等情况阻止迟到 append。正常
   append 仍走原 T9 通道，append 失败仍保留提醒条，不假装成功。

没有新增 Remote 方法；现有 claim 请求增加可选 wire 字段、扩展拒绝结果。
ideaId 与预期版本必须成对提供，缺失时拒绝，不隐式读取最新版代替。
原 session-only 预算调用保留；旧客户端若发送 ideaId 却缺预期版本，将静默
拒绝交付，需要同步更新 Client/Host。Typert 已重新生成验证，生成物属于原
`lib/`，不提交缓存或临时构建文件。

**业务边界保持：** idea/v3、Schema、Storage/Migration、Idea 版本模型、普通
T9 历史固定版本引用、Judge prompt/parser、模型路由与调用次数、检索/Detector、
暂停与忽略语义均未修改。没有加入冷却、自动重试或额外模型分类。
新增的是只读 RPC 复核，不是 Provider 调用。

## 先证明原缺口，再修复

在产品源码修改前新增 8 项定向断言，运行
`pnpm test resurfacing-judge.spec.ts resurfacing-preference.spec.ts -t T13.3A`。
结果 **6 failed / 2 passed**；其余 40 项被该诊断过滤器排除，未伪装为完整套件。

| 等待窗口 / 操作 | 原实现实际结果 |
| --- | --- |
| Judge 模型已进入 gate，随后编辑 | 返回 SURFACE，未丢弃旧 pin |
| 同窗口归档 | 返回 SURFACE，未丢弃非 active 目标 |
| 同窗口删除 | 返回 SURFACE，未丢弃已不存在目标 |
| 同窗口暂停 | 已正确返回 none / USER_MUTED，原保障保留 |
| claim 前已编辑或归档 | 两种均返回 CLAIMED，错误消费预算 |
| claim 前已删除 | 原实现抛 idea-not-found，属于安全拒绝；新增断言要求统一失效结果，因此也计入上述 6 个失败之一 |
| claim 前已暂停 | 已正确返回 USER_MUTED，原保障保留 |

这次红测使用真实 JSON storage、真实 Domain/Judge 服务与 gated scripted
LLM，未使用 Provider。模型 gate 在 finally 释放，诊断失败后 wrapper 仍输出
`removed:true`。不是以任意异常或字面量真值作为 PASS。

## 关键竞态证据

新增 **38 项**定向回归（Judge 4、Domain 9、Client 24、Remote 1）：

- **Judge：** 模型 dispatch 后停住，完成编辑/归档/删除/暂停，再返回原始合法
  SURFACE。最终均 none；分别携带 VERSION_CHANGED / BECAME_INELIGIBLE /
  USER_MUTED。每例恰好 1 个 scripted model call，预算始终 free。
- **零持久写：** claim 拒绝后 `domain/changed` 事件为零、Idea 文件字节不变、
  预算文件读取得到 ENOENT；不只检查客户端字段。
- **编辑先获得队列：** gate 停在真实 records.update，后入队的 8 个旧 pin
  全部 VERSION_CHANGED，预算文件不存在；随后 8 个新 pin 恰好
  1 CLAIMED + 7 ALREADY_CONSUMED，持久文件内容正确。
- **claim 先获得队列：** gate 停在真实预算 put；后入队编辑不能提前改变版本。
  放行后 claim 先完成，编辑再完成；之后的旧 pin 被拒。证明锁覆盖预算写，
  并非一律拒绝并发。
- **其他 mutation：** 并发归档/暂停先入队时，claim 必须观察其已提交状态；
  删除 gate 未释放时资格为 INELIGIBLE、claim 拒绝、预算 free，最终释放删除。
- **客户端：** 对编辑、归档、dormant、删除、暂停、身份不符及读取失败，分别
  覆盖发布前与引用前复核，实际 append 数为 0。有效双击引用只触发一次
  引用读取和一次原 pin append。销毁/忽略/新轮次/草稿修改/暂停与读取交错时
  不 append。两个新增 claim 拒绝结果后，同一会话后续合法机会仍可交付。
- **Remote/T9：** 请求缺 pin 或 pin 过期不消费预算；有效 pin 可认领，旧
  session-only 预算契约保持；普通 T9 明确引用 v1、而当前已是 v2 的既有
  测试仍成功投影 v1，不自动改绑 v2。

## 验证结果

| 阶段 | 结果 |
| --- | --- |
| 初次修复 focused | 4 files / **137 PASS** |
| 最终 focused，含并发、Remote、T9、生命周期 | 10 files / **224 PASS** |
| Typert / 最终 typecheck | PASS |
| 最终 Host / Client build | PASS |
| diff whitespace / 范围检查 | PASS |
| 唯一 fresh root `pnpm verify` | **exit 0，38,365ms** |
| Full Runtime | **30/30 PASS**；fail/cancel/skip/todo 均为 0 |
| Full 默认并行插件测试 | **65 files / 1090 tests PASS**，无非通过余项 |
| Full Typert / typecheck / Host build / Client build | 全部 PASS |
| Full root/package strict pre/post gates | 全部 PASS，仅合法 owning active run |
| 独立结束 strict audit | **`[]`** |

只执行 **一次** fresh 完整 Full，不重试、不重跑。开始前确认实现工作区干净、
HEAD 为 TESTED_SHA、run/Vite cache 新建；经 `.dev` 外层 wrapper 执行未修改的
root `pnpm verify`。使用现有 pnpm JS entry 和 run-owned shim，避免隔离 HOME
触发 Corepack 选择/下载新版本；没有 install 或依赖重链接。默认并行度、
原始 timeout、E6 断言和 Runtime 测试配置均未改变。

完整脱敏输出、实际数量和 exit code 见
[Full evidence](DSH_IDEA_T13_3A_FULL_EVIDENCE_20261026.json)。原始日志 SHA-256：
`bdcd1aabb5fa8636805d1e1da1694e3f7b67aca6045ce38c68f3a4fb6533625d`。
哈希仅标识该次原始调用，不是依赖闭包或可复现构建认证。tsdown 仍输出原有
dependency bundling 提示与 zod 信息，没有为了绿灯隐藏提示或改构建选项。

Full 后只追加报告/证据，源码和测试与 TESTED_SHA 完全一致。浏览器、VM、
真实模型和真实 UI Gate 均 **NOT RUN，遵照本轮禁止项**；组件/控制器测试不
冒充浏览器验收。

## 一致性与已知边界

- 原子保证限于现有单 Host 队列：资格校验与预算写的线性化点明确，不新增
  多 Host 分布式事务承诺。
- 发布前只读失败发生在预算已提交之后时，保持既有 **safe loss**：不展示，
  不退款、不重试；不会为增加召回而破坏一次展示预算。
- `idea/get` 校验的是 Host 读取时的 canonical 状态，不是跨浏览器、Host、
  后续 Agent admission 的长事务；未增加持续轮询或永久锁定 Idea。已展示的
  文本不会因此自动实时刷新，用户稍后引用时重新校验。引用附着后的普通
  T9 固定版本语义继续成立。本轮不宣称能消除读取之后所有未来状态变化。
- 读取失败按 fail-closed 清除失效机会，不偷偷引用旧版；正常 T9 append 失败
  保留现有失败行为。未知状态不会变成“默认有效”。

## 清理与完整性

所有 9 次拥有执行资源的外层运行（红测、focused、静态门和 Full）均输出
`removed:true`。Full 的 run 目录、owner 记录、生命周期 lease 均不存在；
`.dev/runs` 与 `.dev/owners` 为空，最终 strict audit 为 `[]`。没有临时 HOME、
DSH_HOME、Workspace/Storage、raw log、shim 或测试服务保留。

外部例外如实保留：OS sockets/shared memory/crash reports 和共享安装的默认
例外结束检查为 `not-enumerable`；明确记录的既有 pnpm entry 为
`still-present-not-deleted`。这些不是被遗漏的 run 目录，也不等于已经证明
系统级临时产物不存在。本轮没有额外清理系统目录、共享 MCP 或正常浏览器。

只有本仓库内批准的实现、测试及报告变更；未修改 Harness Core、真实
`~/.dsh`、正常浏览器 Profile、Freeze、锁文件或依赖配置。main 保持原基线，
没有合并其他分支。推送后以 fetch / ls-remote 核验独立分支，最终 SHA 作为
交付字段返回。
