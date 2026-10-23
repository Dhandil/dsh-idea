# P2-Lite-B1 Host 核心能力执行报告

日期：2026-10-23。状态：`DSH_IDEA_P2_LITE_B1_READY_FOR_ARCHITECTURE_REVIEW`，等待独立审查，未自行验收或合并 main。

## 1. 基线与范围

- BASE_SHA / 未推进的 main：`3a4dd63a9da13274058952f781303510d5d4d957`。
- 分支：`codex/dsh-idea-p2-lite-b1`。
- IMPLEMENTATION_SHA / TESTED_SHA：`984867f54e0f8f621d0f82af8f07da1ce8a3db79`。测试、生成和构建针对该提交的相同源码及测试内容执行；本报告为之后单独的文档提交。
- 依据：main 已接受的 P2-Lite Architecture Freeze 与 Implementation Instructions；用户本轮授权仅实施 Host/Domain。
- Harness 仍为 `86a402200d95fecef4529d969836f1fe13c6cb0d`；Node `v24.21.0`，pnpm `11.28.5`，Vitest `4.1.11`。

仅新增更新 pipeline、临时 registry、Host 类型/错误、两个 Remote 入口，以及 evolve 的默认关闭选项和相关测试。未修改 Client UI、Harness、持久 types/schema、Storage/Migration、依赖或 Freeze；未实施 B2。未读取真实 Profile、凭据或用户 Session，未启动 Web/浏览器/Agent/Judge。真实 Provider 调用 **0**。

## 2. 实施

### 2.1 Host 可信绑定与一次提案

`prepareUpdateFromMessage` 接收 requestKey、Session、assistant 锚点、用户明确选择的 Idea ID 和 expected current 标记。Host 重读目标并验证存在性、非归档及当前基线；不依赖 Client 标题/正文，不从 pin/recall 猜测目标。

新路径仅一次公开 `readSurface` 取得 detached 来源，校验唯一、有可用文字的本地 assistant 锚点及未来 replacement 风险，复用既有捕获规则：最多 12 条、12,000 规范化字符，排除 recall、system、工具和锚点之后的消息。条数或字符截断均返回 truncated；统计不返回可信来源正文。

复用现有 `buildIdeaEvolutionPrompt`、route、stream drain、parser：Host currentDraft + 空 historySummary + 当前 openQuestions + 有界对话，仅一次直接模型拟稿，无分类、Agent Loop、工具或隐藏重试。合法空 motivation 不套用新建特有的非空门。路由 observation 只用于模型选择并释放 lease，不充当第二份来源正文。生成结束重新核对基线，不静默 rebase。

### 2.2 有界票据与确认提交

独立 updateId，不冒充新建 preparationId 或旧 evolution proposal。entry 保存 Host target/currentDraft/base、模型草稿、固定 SourceDiscussionDraft、范围统计、状态和时间；requestKey 索引同时绑定 Session/锚点/目标/base。

- 64 项、30 分钟，惰性 sweep，无后台 timer；活动 preparing/committing 不驱逐，满活动容量在工作前拒绝。
- 同 key 同参数 join；不同绑定拒绝；失败 flight 在保留窗口内重放失败，不自动再生成。
- commit 只接受票据和通过既有 schema 规范化的可编辑 draft；target/base/source 只取 Host entry。
- 同规范化 payload 的并发提交 join，同成功 payload 重放 receipt；不同 payload 拒绝。无变化结果也绑定 payload，不能换稿复用。
- 已知未写失败允许显式同 payload 再提交；未知结果进入 uncertain，不盲目再写。测试包含实际写完后丢失确认的故障。
- 过期、驱逐、重启、跨类型及未知票据不能恢复为新写。生命周期卸载取消准备并清空 registry。

明确提交唯一调用 `IdeaService.evolve(..., 'continued-discussion', { skipUnchanged: true })`。有变化时既有一次 aggregate mutation 同时追加本次来源、内部内容记录、事件各一项，当前内容引用该来源；不创建专用讨论 Session/IdeaDiscussion，不走 manualEdit 或旧 discussion commit。结果的 updated 标记从 writer 返回的 aggregate 推导，不另读可能变化的 current。

### 2.3 域级原子无变化保护

evolve 第六个可选参数省略或 false 保持旧追加行为。启用时仍先做原 draft/source 校验和删除准入检查；在原 per-Idea mutation 队列槽内读 canonical state，先校验 expected base，再按既有 sameIdeaDraft 比较规范化内容。相同即返回 detached aggregate，位于 mutate/records.update 之前，不分配新内容/来源/事件 ID；不同才继续原 mutate/CAS。没有新增 writer、表、迁移或嵌套入队。

## 3. 验证结果

| 检查 | 结果与证据 |
| --- | --- |
| 聚焦 Domain/Host/既有契约回归 | **16 文件、240/240 PASS**；未跑全量 |
| 新增 Domain | 13 项；旧默认/false 对照、规范化无变化、列表顺序、冲突优先、AI/manual/archive/delete 竞争、写前失败、重启读取 |
| 新增 registry | 8 项；绑定/join/容量/TTL/驱逐、payload、失败/uncertain、取消、dispose |
| 新增 Host/Remote | 31 项；生成 codec、来源/防伪、单次模型、过期/冲突、截断、取消/迟到、同票据与不同票据并发、丢确认 |
| 官方公开 Session 集成 | 3 项；真实 SessionStore/SessionQuery/JSONL 的 live、cold、fork；fork inherited 锚点拒绝、本地锚点通过，route lease 已释放 |
| `pnpm generate:typert` | PASS；正常生成 Host 注册、Remote 描述/类型及两个新 RPC codec；公开 performance 属性补显式类型以满足生成器，运行语义不变 |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS，Host TypeScript 构建；本轮未执行 Client UI build |
| `git diff --check` | PASS |

聚焦命令（在插件包执行 `pnpm exec vitest run`，参数如下）：

```text
tests/p2-lite-domain.spec.ts tests/p2-lite-registry.spec.ts
tests/p2-lite-update.spec.ts tests/p2-lite-session.spec.ts
tests/service.spec.ts tests/lifecycle.spec.ts
tests/preparation-context.spec.ts tests/preparation-service.spec.ts
tests/preparation-registry.spec.ts tests/remote-service.spec.ts
tests/remote-read.spec.ts tests/remote-lifecycle.spec.ts
tests/evolution.spec.ts tests/evolution-registry.spec.ts
tests/remote-evolution.spec.ts tests/quick-capture.spec.ts
```

### 3.1 来源证据

H01/H05/H05b 逐字段核对保存的 Session/锚点/起止序号/正文数组；实际发送的模型 JSON discussion.messages 与持久 capturedContext 相等。提交前改变查询结果不会替换固定来源；Client 伪造 source/target 不能覆盖。当前内部记录只引用本次新增来源，其他 Idea 和旧记录不变。D11 验证 dispose/reopen 后内容和来源仍在，不依赖临时票据。

S01 使用公开官方 Session/JSONL 接口而非 G0 helper，无新 Agent Loop；cold 通过官方事件追加/flush/close 后读入，fork 验证当前逻辑 Session 的本地锚点。此处证明有界来源快照，**不证明对话语义属于所选 Idea，也不实施自动引用归属**。

### 3.2 并发与零写证据

- D02：变化更新 `records.update = 1`、`put = 0`，来源/内部记录/事件各 +1，旧内容完整保留。
- D03/H08：相同规范化内容即使来源不同，`records.update = 0`、`put = 0`，文件字节、aggregate、current、updatedAt 和全部来源/事件不变；返回 detached，重复提交继续零写。
- D04/D07/H07：请求等于新 current 但携带旧 base 时仍冲突，不能以 no-op 绕过 CAS。
- D06/D07/D08/D09、H09/H10：用受控 Promise 屏障占住真实 storage 更新，验证同一队列槽、先到变更使后到冲突；合法 no-op 不阻止下一合法变更；同票据并发仅一写、不同票据同 base 仅一个成功；删除准入和归档保护保留。
- D10：受控写前失败无部分来源或文件变化，队列可继续；H15：实际成功写入后抛出丢确认故障，票据进入 uncertain，后续零重写。
- D01 与旧 evolution/manualEdit/create/Quick Capture/read/history focused tests 保持既有契约；新选项没有自动用于旧入口。

## 4. 验证边界

- 本轮仅 Host/Domain，不证明 B2 picker/Modal、浏览器传输、正常 Profile 的加载或模型提案质量。离线替身不代表真实模型行为已验收。
- readSurface 没有底层 abort 参数；等待期间取消可阻止之后的模型调用和票据注册，不承诺中断底层读 I/O。共享 prepare 由首个调用者 signal 拥有；加入者取消只结束自己的等待。写入准入后取消不承诺回滚。
- prepare 的存在性/状态/base 采用公开域读取；不读取 private deleting 集合。pending deletion 可能在一次拟稿后被域提交准入拒绝，这是 Freeze 已记录的预防边界。
- requestKey dedup 与 receipt 均限同 Host 的有界保留窗口；驱逐/重启后的旧 updateId 一律不可写。不保留无界 tombstone，不承诺跨重启 exactly-once；重新生成必须由调用方明确动作，未知保存结果应先核对。
- 任何无法证明未写的异常均保守归入 uncertain，可能包含实际写前的未知错误；不会自动重试或伪称回滚。

## 5. 清理与交付

测试使用独立临时 JSON storage/Session 根目录；afterEach dispose 所有 Context/Session lease/JSONL handle，删除任务根目录，并断言 ENOENT。新增测试逐项阻止并断言 fetch 调用为 0。没有启动需保留的 Web、浏览器或其他后台任务。

main/origin/main/远端 main 在提交前复核仍为 BASE_SHA。G0 分支仍为 `d7677a0b522609c500b72cb058f4e14b28f867a5`，未合并任何证明代码。既有 `.DS_Store`、`.playwright-mcp/` 及 Harness 未跟踪项均保留，未加入提交。机器生成 lib/build 产物按原忽略规则留在工作区，不提交本机安装配置。

实现与本报告在独立分支提交、推送后 fetch/ls-remote 核验；FINAL_REMOTE_SHA 由最终交付返回，避免文档自引用提交哈希。完成后 STOP，等待独立架构审查，不继续 B2。
