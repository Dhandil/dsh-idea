# DSH Idea T13.3B — 明确找回意图识别

日期：2026-10-26。交付：**`DSH_IDEA_T13_3B_READY_FOR_ARCHITECTURE_REVIEW`**。
提交独立架构审查，不自行验收、不合并 main。

## 基线与范围

| 项目 | 核验值 |
| --- | --- |
| BASE_MAIN / 开始时远端 main | `9ebcf3ea0cc540cf2abb928bd06f0ffa0c646ff4` |
| 独立分支 | `codex/dsh-idea-t13-3b-explicit-recall` |
| IMPLEMENTATION_SHA / TESTED_SHA | `7ad1afdfcd33b9e47dbfb95b762d0c1460e5b9a7` |
| Node / pnpm / Vitest | `v24.21.0` / `11.28.5` / `4.1.11` |
| 唯一 fresh Full | **1232/1232 PASS，exit 0，38,081ms** |
| 真实 Provider / 浏览器 / VM | **0 / 0 / 0** |

开始时工作区干净，只有当前一个 worktree。ls-remote 验证远端 main 已推进到
指定基线；fetch 更新 origin/main 后，从该 SHA 创建新分支。未移动本地 main
（仍为 `bcc35e3d09581fdb7d22a518f9d456d58ed39c22`），未操作其他分支。
初始 strict audit 为 `[]`。

产品仅修改 `src/resurfacing/detector.ts`；必要测试仅修改
`tests/resurfacing-detector.spec.ts` 和 `tests/client-resurfacing.spec.tsx`。
候选池、词法 floor、RRF、Selector、Judge prompt/parser/标准、预算、忽略、
暂停、T13.3A 交付/引用保护、Storage、Schema、Harness Core、依赖和锁文件
均未变。报告和 Full 证据另行追加。

## 实现

新增确定性的已保存 Idea 找回规则，复用现有强信号 **MEMORY_GAP**，不新增
信号类型，不选择目标身份，不读取 Idea 库，不增加分类模型调用。

新规则要求同一句中同时出现：

1. 明确请求形式（含中文礼貌请求、把字句、英文请求/命令及中英混合）。
2. 找回/翻出/回忆/find/retrieve 等检索动作。
3. Idea/想法/点子/创意/方案对象。
4. 已保存、存过、记录的、saved/bookmarked 等历史保存证据。

在 MEMORY_GAP 路径先去除常见引号、Markdown blockquote、代码块及 inline
code；NFKC 在引文过滤前执行，支持全角输入。英文 contractions 不被当作
单引号引用。否定、未保存、取消、转述/翻译/用法问答采取保守排除。
既有 MEMORY_GAP 模式也使用该边界，修复其否定和引文误触发；其他 strong /
medium 规则及短问句上下文逻辑不变。新请求不从 recentContext 继承。

每轮最多新增一个 MEMORY_GAP，evidence 仍受现有 80 字符上限约束。
**admitted 仅表示值得检索，不表示存在目标，也不保证展示。**
所有候选筛选、真实有用性判断、精确版本与交付条件仍由原有下游链路决定。
没有自动引用、保存、重试或跨会话冷却。

## 正负例及行为证据

Detector 从原有 21 项增至 **118 项**：新增 33 个正例、62 个负例及 2 个
上下文/evidence 边界用例。另新增 9 个控制器用例；总计新增 **106 项**。
数组长度经只读 TypeScript AST 统计复核，不是估算。

| 分类 | 代表输入 | 实测 |
| --- | --- | --- |
| 中文改写 | 帮我找找以前保存的 Idea。 | admitted，单一 strong MEMORY_GAP |
| 中文礼貌/倒装 | 能帮我翻出先前记下的方案吗？／我以前存过一个想法，帮我找出来。 | admitted |
| 英文 | Find the idea I saved earlier.／Could you help me retrieve my saved idea about retrieval? | admitted |
| 中英混合 | Please 找回我以前保存的那个 Idea。／Can you find 我上次保存的想法？ | admitted |
| 否定/取消 | 不用回忆之前保存过的那个方案。／Don't find the idea I saved. | silent |
| 未保存 | 帮我找回没有保存过的 Idea。／Find the idea I didn't save. | silent |
| 引文/代码 | 「请找回我之前保存过的 Idea」这句话是什么意思？／Markdown 引用、fence、inline code | silent |
| 转述/普通问答 | A sample request is please find my saved idea.／How do I find my saved ideas? | silent |
| 新建/功能讨论 | 帮我找一下新的 Idea 保存起来。／请评价找回以前保存的 Idea 这个功能。 | silent |
| 其他资源 | Find my saved files.／帮我找以前保存的密码。 | silent |
| 分句独立意图 | 不要找新的点子；帮我找回以前保存的 Idea。 | 后一句仍可 admitted |
| 历史与引文边界 | 当前“好的”，历史中有找回请求；引文外另有真实请求；长 evidence | 不借历史触发；独立请求可触发；evidence ≤80 |

控制器用例使用真实生产控制器、合成事件窗口和 scripted RPC：

- 中文、英文、混合三例都进入原有 lexical + semantic 检索，Judge 各调用一次；
  Judge 合法 NONE 时无 claim、无 get、无提醒、无 append。
- 空候选不调用 Judge 或 claim；明确找回不绕过已消费会话预算。
- 否定、引文、普通用法问答不 dispatch 检索或 Judge。
- 正常 SURFACE 仍经 CLAIMED 才展示；本次忽略不调用 setResurfacingMuted，
  不退款，不允许同会话第二次展示，不自动 append。

模型与 RPC 均为受控离线替身。这证明结构与门禁，不冒充真实模型质量或
真实浏览器验收。真实 Provider 调用为 0。

## 研发过程与原始失败记录

产品修改前，新增的第一批 67 项定向用例为 **30 failed / 37 passed**，其余
21 个既有测试被名称过滤器排除。失败包括 27 个明确找回漏识别、1 个引文外
真实请求漏识别，以及 2 个既有 MEMORY_GAP 否定/引文误触发。

首轮 Detector **88/88 PASS**；扩展 Detector+Client **204/204 PASS**；
进一步提醒相关 focused **302/302 PASS**。随后收紧未加引号的转述边界时，
一次 focused 为 **304 PASS / 1 FAIL**：误排除了“你能帮我找到我之前收藏的
Idea 吗？”。保留该断言，补回明确请求前缀后最终 **305/305 PASS**。
该阶段尚未执行 Full，没有放宽断言、超时、重试或改成 skip。

## 最终验证

| 阶段 | 结果 |
| --- | --- |
| 最终 focused | **8 files / 305 PASS** |
| typecheck / Host build / Client build | 全部 PASS |
| whitespace / 变更范围检查 | PASS，产品仅 Detector |
| 唯一 fresh root pnpm verify | **exit 0，38,081ms**；不重跑 |
| Full Runtime | **30/30 PASS**，fail/cancel/skip/todo 均 0 |
| Full 默认并行插件测试 | **65 files / 1202 PASS**，无非通过余项 |
| Full Typert / typecheck / Host build / Client build | 全部 PASS |
| Full root/package strict pre/post gates | 全部 PASS，仅合法 owning active run |
| Full 后独立 strict audit | **`[]`** |

Full 前提交并冻结实现，确认工作区干净。通过 `.dev` 新 run 执行未修改的
root verify，HOME/DSH_HOME/TMPDIR 与 Vite cache 为本轮独立新目录。
固定现有 pnpm 11.28.5 CLI，未下载、安装或修改全局工具链。默认并行度、
原始超时和 E6 断言保持。Full 后仅追加报告/证据，无源码或测试变化。

[完整脱敏 Full 证据](DSH_IDEA_T13_3B_EXPLICIT_RECALL_FULL_EVIDENCE_20261026.json)
保留完整输出、数量、exit code 和原始日志 SHA-256：
`33d5ced124ba00a2dc64c3ff860e1bcde179761b3eff85863ca1a9d60744f239`。
哈希只标识该次原始日志，不是可复现构建或依赖闭包认证。原有 tsdown
bundling/zod 提示保留。没有启动浏览器、VM、真实模型或正常 DSH。

## 证明边界与清理

- 这是保守的语言/格式规则，不是通用自然语言或 Markdown 解析器，不承诺
  覆盖所有改写、否定作用域或引文格式。同一句有否定/元语言证据时可保守
  漏识别。离线矩阵不等于真实用户 precision/recall 或模型展示率。
- 引文/否定保护限定 MEMORY_GAP；另一个独立 strong signal 仍可按原逻辑
  打开机会。没有为了该阶段重写其他机会类型。
- 新语言增加合法机会覆盖，不代表部署后的总 Selector/Judge 成本必然不变；
  每次机会的原有调用结构和预算不变，没有增加分类阶段或自动重试。
- 所有执行资源均使用 `.dev`；每次外层 run 包括诊断失败均输出
  `removed:true`。Full run/owner/lease 不存在，runs/owners 为空，strict audit
  `[]`。原始日志、临时 HOME、存储、shim 和子进程均未保留。
- 默认 system/shared 例外结束检查为 `not-enumerable`；明确记录的共享 pnpm
  entry 为 `still-present-not-deleted`。不宣称系统级产物全不存在，不清理
  共享缓存、MCP 或正常浏览器。真实 Profile、用户 Session 与凭据未访问。

仅推送独立分支，fetch / ls-remote 核验最终报告头；不合并 main。原有 T13.3A
实现和历史报告保持，等待独立架构审查。
