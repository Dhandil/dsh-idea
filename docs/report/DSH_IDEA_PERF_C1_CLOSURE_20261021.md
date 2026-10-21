# PERF-C1 双击误取消收口

结果：`DSH_IDEA_PERF_C1_CLOSURE_READY_FOR_FINAL_REVIEW`。

基于 TESTED_SHA `8898cf31ba3a1fa367d2060fbc0f60ef74a0bc2c` 和 REPORT_SHA `0cc536dbcd4792e9147a0431a3e02778ead11721`；继续使用 `codex/dsh-idea-perf-c1`，未合并 main。Harness 只读参照 `86a402200d95fecef4529d969836f1fe13c6cb0d`（0.2.1-alpha.4）。

## 先复现，再修复

在真实 DSH Web 的合成聊天回复操作栏点击「保存为 Idea」，取得「总结」menuitem 的真实 bounding box，执行 Playwright `page.mouse.dblclick(x, y, { delay: 65 })`。两次 click 都是浏览器产生的 `isTrusted=true` 指针事件，不是 DOM `dispatchEvent`。

修复前的事件与结果：

| 事件 | detail | 遮罩目标 | 坐标 |
| --- | ---: | --- | --- |
| 第一次 click | 1 | 否（总结菜单项） | 494, 326 |
| 第二次 click | 2 | 是（刚出现的 Modal 遮罩） | 494, 326 |

实际提取调用 1 次、abort 1 次、准备 dialog 0 个。确认此前报告中记录的双击关闭行为就是本轮要求修复的误取消；保留原报告历史事实，以本收口结果取代其“快速双击”验收结论。

最小修复仅位于 `IdeaSaveDialog.tsx`：在 Idea Modal 的 React 父节点捕获 click，阻止 `detail > 1` 且目标为 dialog 外 `aria-hidden` 遮罩的连续点击传播。Portal 事件仍经过该 React 父节点。没有更改 Harness Modal、Host、提取或持久化逻辑，也没有添加延时或临时禁用关闭操作。普通遮罩单击 `detail=1`、明确取消/关闭按钮及 Escape 保留原语义。连续第三击也不会误取消。

## 回归结果

| 检查 | 结果 |
| --- | --- |
| 同一真实指针双击 | 第二击仍为 `isTrusted=true`、`detail=2`，仍命中遮罩；准备 dialog 保留，提取次数精确为 1，abort 为 0。PASS |
| 双击后的正常成功 | 受控输出释放后，原 dialog DOM 身份不变，转为可编辑草稿；标题可编辑。PASS |
| 正式预览遮罩单击 | 普通真实指针单击遮罩可正常关闭。PASS |
| 明确取消 | 单独请求，点击「取消」使 abort 增加 1；释放迟到输出后不重开。PASS |
| 关闭按钮 | 单独请求，点击「关闭」使 abort 增加 1；释放迟到输出后不重开。PASS |
| Escape | 单独请求，通过真实浏览器键盘按 Escape，使 abort 增加 1；迟到输出不重开。PASS |
| 打开后立即单击遮罩 | 无须等待保护窗口，正常单击可取消；迟到输出不重开。PASS |
| 稍后单击遮罩 | 等待 600 ms 后正常单击可取消；迟到输出不重开。PASS |

修复后真实 Web 回归共 6 次受控提取调用、1 次成功、5 次取消，无重复请求。浏览器 pageerror 0，外部请求拦截计数 0。截图：[双击后准备态仍在](assets/DSH_IDEA_PERF_C1_CLOSURE_double-pending.png)、[同一弹窗转为可编辑草稿](assets/DSH_IDEA_PERF_C1_CLOSURE_double-preview.png)。

`tests/client.spec.tsx` 新增 5 个聚焦用例，覆盖第二/三击拦截、精确一次请求、成功转换后的正常遮罩关闭，以及四种即时取消方式与迟到响应防护。明确取消和关闭还以 `detail=2` 校验其不会被误拦截。该文件 38 tests 全部通过；typecheck 和 Client build 通过。未运行 Host build、全量或无关测试。

最终 Client Bundle SHA-256：`e5d2fb460bafc48d6a2572a3251f4c70b748f050a05e157a687dddd7aa69f1ff`。Host 提取及 Remote 构建产物的 SHA-256 与前次报告相同（分别为 `972a18f871d08914080f42e255190b65c2dc29340e4945f29f081cda902fcff1`、`6b84d70cd5faf6237ffd3f494f5ceca1487e455364e83f3b6279caea7eaf97be`）。

## 隔离、调用量与清理

使用全新仓库外 `DSH_HOME` 和临时 Chrome Profile、真实 Web 18795、官方 Workspace RPC、官方 base/web 与 Idea Bundle。一次性启动驱动使用官方 LLM adapter 注册接口提供合成聊天和可控提取输出；收到 abort 后仍故意释放输出，验证迟到防护。重新启动隔离 Host 后才加载修复后的 Client Bundle。

Host 使用无凭据环境，Seatbelt 禁止读写真实 `~/.dsh`；浏览器启用 Chromium sandbox，Host fetch 和浏览器请求限制为 loopback。整个任务只有 1 次受控聊天、1 次修复前复现提取和 6 次修复后提取，共 8 次内存替身调用；真实 Provider 调用及计费 Token 为 0。初始自动操作曾因首次使用提示未关闭而停在发送前，未产生模型调用，修正测试驱动等待后继续。

本轮所有测试浏览器及 Host 已退出，18795/18798 无监听，运行目录、临时 Profile、Workspace、Session、驱动和原始日志已删除，仅保留脱敏报告与合成内容截图。真实 Profile、用户 Idea 数据、Harness Core、Host 提取和持久化模型均未修改。保留原有 `.DS_Store`、`.playwright-mcp/` 及 Harness 未跟踪 `deepseek-harness` 等无关 drift。
