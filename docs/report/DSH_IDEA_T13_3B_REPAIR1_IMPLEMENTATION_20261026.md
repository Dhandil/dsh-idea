# T13.3B Repair1 — Detector 覆盖修复与最终 Full 阻塞记录

日期：2026-10-26。状态：**BLOCKED — FINAL_SHA_FULL_REQUIRED**。
修复代码、聚焦与静态验证已完成并提交；不能返回
`DSH_IDEA_T13_3B_REPAIR1_READY_FOR_ARCHITECTURE_REVIEW`，因为本轮唯一 Full
之后又修复了一个已证实的覆盖反例，最终代码 SHA 尚未运行 Full。

## 身份与范围

| 项目 | 值 |
| --- | --- |
| BASE_MAIN / 开始时远端 main | `9ebcf3ea0cc540cf2abb928bd06f0ffa0c646ff4` |
| CANDIDATE | `7ad1afdfcd33b9e47dbfb95b762d0c1460e5b9a7` |
| 开始时独立分支报告头 | `3a9bdf474c4ba14296b412665ae93471d890a254` |
| 分支 | `codex/dsh-idea-t13-3b-explicit-recall` |
| 初次修复 / 本轮 Full TESTED_SHA | `ff9f7c53912b78e7826ca4e348c42a7e3fcd2192` |
| 最终 REPAIR_SHA | `43d917edc9e7533f00308107b8456c067ae6f89e` |
| 最终 focused / 静态门 | **355/355 PASS / 全部 PASS** |
| 已执行 Full | **1278/1278 PASS，exit 0，38,550ms**，仅覆盖 ff9f7c5 |
| 最终 SHA 的 Full | **NOT RUN / BLOCKED** |
| Provider / 浏览器 / VM | **0 / 0 / 0** |

初始工作区干净、只有当前一个 worktree，strict audit `[]`。ls-remote 匹配
上述 main 和报告头；candidate → 报告头仅两份文档。沿用独立分支，不合并
main，不操作其他项目。产品只修改 Detector；必要测试只修改 Detector 和
Client 控制器测试文件。候选池、Judge、预算、忽略/暂停、调用结构、Schema、
Storage、Harness、依赖和锁文件均未改变。

## 修复行为

- 中文“找”允许不带回/出/一下等补语，识别“帮我找之前保存的 Idea”等直接
  请求；同步保持“不找”等否定边界。
- MEMORY_GAP 准入前区分操作方法询问：怎么/如何/怎样/how、解释/教学前缀、
  步骤/方法问题及找按钮等用法询问，不直接派发 Idea 检索。
- 直接找回的目标内容可以包含 how/如何。仅当关于/about/named 之前已有
  已保存 Idea 目标证据时，才把后续方法词视为目标主题；中文“保存的关于…
  Idea”允许定语后置。不能仅凭一个 about 就忽略后面的如何检索问题。
- 继续使用原 MEMORY_GAP、原 evidence 上限和确定性规则；不增加模型分类、
  自动重试、冷却或新下游调用。admitted 不保证候选存在或 Judge SURFACE。

## 正负例与原始失败

修改产品前，先增加 41 项纯 Detector 定向用例，结果
**23 failed / 18 passed / 118 filtered out**：8 个直接请求漏识别、15 个操作
询问误触发。修复后 Detector **159/159 PASS**，相关 focused **351/351
PASS**，typecheck、Host/Client build 均 PASS，随后提交 ff9f7c5 并运行 Full。

Full 后静态复核提出并通过隔离纯函数探针确认了额外反例：

> Can you find information about how to retrieve my saved idea?

ff9f7c5 实际返回 `admitted=true / MEMORY_GAP`。这是操作信息询问，不应因
about 主题截断触发；不能作为“通用语言局限”带过。随后修复目标证据条件，
补 4 项回归，提交最终 43d917e。没有改写先前 Full 成绩或测试 SHA。

最终新增 45 项纯 Detector 用例（13 直接正例、22 操作询问、10 其他负例），
另加 5 项控制器用例，共 50 项；数组数量经只读 TypeScript AST 核对。

| 类别 | 代表输入 | 最终结果 |
| --- | --- | --- |
| 中文直接请求 | 帮我找之前保存的 Idea／你能帮我找之前保存的 Idea 吗？ | admitted，单一 MEMORY_GAP |
| 混合直接请求 | Please 帮我找之前保存的 Idea。 | admitted |
| 方法主题作为目标内容 | 请找回我以前保存的关于如何写测试的 Idea。／Find the idea I saved about how to write tests. | admitted |
| 中文方法询问 | 请问怎么找回以前保存的 Idea？／请列出找回以前保存的 Idea 的步骤。 | silent |
| 英文方法询问 | Can you explain how to retrieve my saved idea?／Please show me the steps to find my saved ideas. | silent |
| 混合方法询问 | Can you explain 如何找回我保存的 Idea？ | silent |
| Full 后补充反例 | find information about how…／find saved information about how…／找保存的资料，关于如何找回 Idea… | silent |
| 否定、未保存、引文、普通问答 | 请不找我之前保存的 Idea。／帮我找没有保存过的 Idea。／引文、翻译、术语解释、新建、文件查找 | silent |

控制器实测：两个直接请求进入原 lexical + semantic + Judge 路径，合法
NONE 时无 claim、无写入意图、无提醒或 append；中文/英文/混合的三个操作
询问均不调用 evaluate、semantic、Judge、claim。既有 T13.3B 负例及忽略、
预算回归保留。这是离线组件/控制器证据，不是浏览器或真实模型效果验证。

## Full 证据与阻塞原因

| 检查 | 实际结果 |
| --- | --- |
| 最终 focused | **8 files / 355 PASS** |
| 最终 typecheck / Host build / Client build | 全部 PASS |
| whitespace / 范围检查 | PASS |
| ff9f7c5 的唯一 fresh root pnpm verify | **exit 0，38,550ms** |
| 该 Full Runtime | **30/30 PASS**，fail/cancel/skip/todo 均 0 |
| 该 Full 默认并行插件测试 | **65 files / 1248 PASS** |
| 该 Full Typert / typecheck / Host/Client build | 全部 PASS |
| root/package strict pre/post gates | 全部 PASS，仅合法 active run |
| 43d917e 的 Full | **未执行**，不能用前次结果替代 |

[完整脱敏 Full 证据](DSH_IDEA_T13_3B_REPAIR1_FULL_EVIDENCE_20261026.json)
保持 `testedSha=ff9f7c5…`，明确 `finalRepairCoveredByThisFull=false`。
原始日志 SHA-256：
`ec8bb3cf0fca8be4811b86097fbffb6861cd42f335f309a2bcdb36deececc8ed`。
不是依赖闭包或可复现构建认证；原有 tsdown bundling/zod 提示保留。

本轮 Full 执行过早，最终反例复核未完成。后续确实修改了源码和 4 项测试，
因此即使原 Full 全绿，也不覆盖最终交付。用户要求“执行一次 fresh pnpm
verify”；本轮已执行一次，没有自行启动第二次、重新命名或隐藏原调用。
需要用户明确授权针对 **43d917e** 的新 fresh Full 后，才能解除该验证阻塞。
本报告不宣告最终 Gate 通过。

## 清理与剩余边界

所有外层执行 run（包含红测与反例探针）均输出 `removed:true`。最终 strict
audit `[]`，runs/owners 为空，无 lifecycle lease。临时 HOME/DSH_HOME、
storage、raw log、shim 和任务子进程未保留。唯一 Full 使用新 .dev run、
空 Vite cache、固定已有 pnpm 11.28.5；Node v24.21.0 / Vitest 4.1.11。
默认并行度、timeout、断言和 verify 脚本未改；未 install 或更改全局配置。

默认 system/shared 例外检查为 `not-enumerable`；固定共享 pnpm entry 为
`still-present-not-deleted`。不宣称全部 OS 临时产物不存在，不清理共享 MCP、
浏览器或其他项目。真实 Profile、Session 正文、凭据和 Keychain 未访问。

语言识别仍为保守规则，不是通用语义/Markdown 解析器；未知改写可漏识别。
方法主题边界不代表目标真实性证明。其他独立 strong signal 保持原逻辑。
未进行真实质量率或总 Provider 成本评估。

修复、历史 Full 证据和此阻塞报告均提交并推送独立分支，以 fetch/ls-remote
核验最终报告头；不合并 main，停止等待后续授权与独立审查。
