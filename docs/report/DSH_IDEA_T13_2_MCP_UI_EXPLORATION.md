# DSH Idea T13.2 Playwright MCP 真实 UI 探索

**结果：`DSH_IDEA_T13_2_MCP_UI_EXPLORATION_COMPLETE`**<br>
**基线：** `c1d2030b246eed68cd78f85a50df6e4b98be1654`<br>
**Harness 只读参考：** `ddefc45fbc7f8e46dd73185e68295696d1297887`<br>
**Idea 代码提交：** `7f1703badb6e48845798d8444d00f1e12023c5d8`（使用现有构建产物；未构建或修改产品文件）
**范围：** 独立测试 Host 的真实 UI 探索；不是正式 Gate 2 验收，也不构成 Gate 2 通过证据。

## 隔离与启动

开始时 PAH 任务为 `notLoaded`、相关对话空闲；进程快照无 PAH Chrome/Profile，现有 `mcp__playwright` 只有 `about:blank` 页。18795、18796、3080 均无监听。全程使用现有 `mcp__playwright`；未访问或改动 PAH 历史数据。

Harness 使用外置临时 `HOME/DSH_HOME/TMPDIR`，通过受保护的 DSH CLI source launcher（`node --import tsx/esm apps/cli/src/bin.ts --profile web`）绑定 `127.0.0.1:18795`；项目插件由临时 overlay 加载，并把 `dsh-idea-semantic.mode` 设为 `off`。Host/CLI 运行于 Seatbelt：对真实 `~/.dsh/settings.yaml` 的只读打开成功，非写入式 `O_WRONLY` 探针返回 `EPERM`。临时 DSH_HOME 启动前为空，无既有凭据文件。浏览器来自现有 MCP Profile；其同用户文件系统能力不是 OS 写保护，按已接受的隔离风险记录。

鉴权后仅调用一次官方 `workspace/create`：HTTP 200、`result.ok=true`、`created=true`，Workspace ID `7432110b-0121-4403-be1c-0ccfe6f83d7a`，路径为本轮临时目录下的 `workspace`。没有打开 Workspace 选择器、原生目录选择器或 `directoryPicker/pick`。

## UI 顺序与证据

1. 打开 Host 的一次性鉴权 URL（报告不保留 token），点击内测声明的「继续」和 API Key 提示的「稍后配置」；后者只写入临时 DSH_HOME，随本轮目录删除。
2. 点击「设置」→「Ideas」→「＋ 新建 Idea」。Ideas 初始列表为空。
3. 在文本框 `想到什么就写下来，保存为一条 Idea…` 输入唯一临时标记 `T13.2 MCP UI 临时样例 20261015-A7C1` 和样例正文，点击「直接保存」。详情显示当前版本 v1、原因「初次保存」。
4. 从列表点击该 Idea，再点击「编辑」。填写「标题 *」「核心想法 *」「为什么值得保留 *」「当前结论」「可能价值」「适用场景（每行一条）」「待解决问题（每行一条）」；适用场景和待解决问题各填两行。点击「保存为新版本」后详情显示 v2 和「手动修改」。

Playwright 使用的按钮 locator 均为可访问名称：`getByRole('button', { name: '设置' })`、`Ideas`、`＋ 新建 Idea`、`直接保存`、`编辑`、`保存为新版本`；表单字段按上述 textbox 标签填写。没有点击「AI 整理」、讨论、Agent、Judge 或 Fixture A 操作。

## RPC 只读核验

| RPC | 结果 |
| --- | --- |
| 初次保存后 `idea/list`、`idea/get`、`idea/getVersions` | 均 HTTP 200、`ok=true`；仅 v1，原因 `initial-save`。Direct Save 原文进入 core，其余结构化字段为空。 |
| 编辑后 `idea/get`、`idea/getVersions`、两次 `idea/getVersion` | 均 HTTP 200、`ok=true`；当前 v2，原因 `manual-edit`。标题、core、motivation、currentConclusion、possibleValue、两条 useWhen、两条 openQuestions 与 UI 表单一致；v1 内容不变。 |
| 清理后 `idea/list` | HTTP 200、`ok=true`、空数组。 |

本轮 Agent **0**、Judge **0**、真实 Provider 请求 **0**、AI 整理 **0**。临时 overlay 将 semantic 模式关闭；Host 网络套接字只连接 loopback，Playwright 列出的非静态应用请求均指向 `127.0.0.1:18795`。

## 清理与截图

通过 Idea 详情页「删除」→勾选「我知道此操作无法恢复」→「永久删除」删除本轮唯一 Idea；官方 `idea/list` 随后为空。Host 退出后 18795/18796/3080 均无监听；临时 HOME、DSH_HOME、Workspace、Profile、overlay 和日志目录已删除。关闭了本轮页面，清除了仅对应 `127.0.0.1:18795` 的 MCP 鉴权 cookie，并移除了本轮生成的 MCP 快照/日志；MCP Profile 的其他 Cookie 与文件未清理。PAH 未受影响。

- [Direct Save 表单](assets/DSH_IDEA_T13_2_MCP_UI_01_direct_save.png)
- [v1 详情](assets/DSH_IDEA_T13_2_MCP_UI_02_v1_detail.png)
- [结构化编辑表单](assets/DSH_IDEA_T13_2_MCP_UI_03_structured_edit.png)
- [v2 详情](assets/DSH_IDEA_T13_2_MCP_UI_04_v2_detail.png)
- [清理后的空列表](assets/DSH_IDEA_T13_2_MCP_UI_05_cleanup_empty.png)

**提交范围：** 仅本报告和上述截图；原有未跟踪 `.DS_Store` 漂移保留。未修改 dsh-idea 产品代码或 Harness 仓库。
