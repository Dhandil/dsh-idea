# UX-02B：浏览器隔离方案调查

日期：2026-10-26。结论：**`DSH_IDEA_UX02B_ISOLATION_DESIGN_READY`**。
这是只读技术调查及待审查的实施方案，不是浏览器安全验收。
**UX-02A 浏览器 Gate 继续 BLOCKED，体验结论继续 INCONCLUSIVE。**

## 1. 范围与基线

| 项目 | 核验值 |
| --- | --- |
| main / origin/main | `bcc35e3d09581fdb7d22a518f9d456d58ed39c22` |
| UX-02A 实现 / 唯一 Full | `51d3542ac82dcb69ea201c10bcdc48a18498a9cc` |
| UX-02A 报告分支头 | `e9eb0dfcb49e7947af0272f1bf26c8cd52bdce89` |
| 本次独立文档分支 | `codex/dsh-idea-ux02b-isolation-design` |
| Harness（沿用 UX-02A 固定值） | `86a402200d95fecef4529d969836f1fe13c6cb0d` |

开始时工作区干净，只有当前工作目录一个 worktree。UX-02A 实现到报告头
仅新增两份报告文件；本次从该报告头创建分支，不推进 main。

本次没有启动浏览器、Web、VM、容器或 Provider，没有安装、构建、测试或
重跑 Full。没有访问真实 `.dsh`、正常浏览器 Profile 或 Keychain 内容，
没有改变系统网络、Keychain 或 MCP 配置。只查源码、既有脱敏报告、SDK、
工具/应用元数据及官方资料；文档与 Git 操作是本轮唯一持久变更。

历史事实以 [UX-02A 执行报告](DSH_IDEA_UX02A_IMPLEMENTATION_20261026.md)
及 [脱敏证据](DSH_IDEA_UX02A_EVIDENCE_20261026.json) 为准：

- 唯一离线 Full **1101/1101 PASS**，不包含被阻断的浏览器验收。
- 外层 Seatbelt 下，CFT 子进程报告 sandbox initialization failed / Operation
  not permitted，伴随 GPU/network helper 失败。之后无外层浏览器 Seatbelt
  的尝试也没有完成总结矩阵，用户随后报告 Chromium Keychain 弹窗。
- `--use-mock-keychain`、`--password-store=basic` 已写入任务专用草案，
  **补充后未启动验证**，没有“弹窗已消失”的证据。
- `scripts/ux02a-browser.mjs` 在创建 Host/Profile/browser 前直接抛出
  `DSH_IDEA_UX02A_BROWSER_BLOCKED_ISOLATION`；本轮保持原阻断不变。
- Host 单独 Seatbelt 的路径权限查询和 loopback 服务证据不能外推给浏览器。

## 2. Seatbelt 冲突：已证明与未证明

本机 SDK `sandbox.h` 明确记录：对已经 sandboxed 的进程再次调用
`sandbox_init()` 会忽略新 profile 并返回错误；同时该公共 API 已弃用。
Chromium 的官方 Mac V2 设计说明 Helper 会先应用自己的 sandbox，
再加载 Chromium Framework。因此，从外层 `sandbox-exec` 继承约束后再进行
原生沙箱初始化，存在兼容性冲突，与历史失败一致。
依据：[Chromium Mac V2 设计](https://chromium.googlesource.com/chromium/src/+/main/sandbox/mac/seatbelt_sandbox_design.md)。

但这仍是**机制支持的根因判断，不是那次失败的精确调用栈证明**。
与当前 CFT 版本对应的 Chromium 源码同时包含 `sandbox_init`、
`sandbox_init_with_parameters`、编译 profile 后 `sandbox_apply` 等路径；
历史证据没有定位实际失败 API、完整 errno 来源或具体被拒操作。
不能把公共 `sandbox_init` 的契约扩写成“所有 sandbox_apply 永远不能嵌套”，
也不能排除外层策略另外拒绝了原生初始化所需资源。
依据：[Chromium 151.0.7922.34 Seatbelt 实现](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/sandbox/mac/seatbelt.cc)。

本轮没有重新复现。继续放宽外层策略直至启动成功，既不能自动证明主进程
拒读，又可能扩大允许面，不是当前可认证的解决方案。禁用 Chromium 原生
沙箱、修改 CFT 签名/二进制、忽略初始化失败均排除。

### 本机只读佐证

- 系统元数据：macOS `27.0.1` / build `26A434` / `arm64`。
- 已安装 CFT 的 Info.plist 版本：`151.0.7922.34`。只读 bundle 元数据，
  未启动、未读取 Profile；不能据此证明旧尝试使用的二进制哈希。
- 本地 SDK 根：`/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk`。
  `usr/include/sandbox.h:24` 包含上述二次初始化契约；
  `System/Library/Frameworks/Virtualization.framework/Headers/` 中
  `VZVirtualMachineConfiguration.h` 包含 entitlement、设备默认值及配置校验接口。
- `sandbox-exec`、`pfctl`、`tcpdump` 路径存在；没有执行策略变更或抓包。
  常见独立 VM CLI（tart、limactl、qemu-system-aarch64、prlctl、VBoxManage、vz）
  未在 PATH 找到。Docker.app/CLI 存在，不代表引擎已启动或方案已就绪。
- 沙箱拒绝读取可选的 RAM/CPU sysctl；本轮未为此扩大权限。
  宿主容量、恢复镜像、VM 工具与许可条件仍是实施前置项。

## 3. 安全目标必须分开验收

1. **数据边界**：浏览器主进程、helper、driver、Host 均无法获得宿主真实
   `.dsh`、正常 Profile、Keychain；新的 HOME/Profile 只是生命周期隔离，
   不构成文件访问控制。
2. **网络边界**：所有相关进程的 IP 通信仅允许 loopback，覆盖 IPv4/IPv6、
   background/network service、GPU、crash handler 和间接代理，不能只查页面。
3. **原生沙箱**：保留 CFT 原生 sandbox，不出现 `--no-sandbox` 或等效禁用。
4. **生命周期**：任务结束释放 VM/浏览器/Host/driver、端口、磁盘及句柄，
   再由 `.dev` 清理，不关闭共享 MCP 或正常浏览器。

`browserContext.route`、关闭部分后台功能、环境变量及 mock Keychain flags
只是辅助。Playwright 文档明确存在 Service Worker 请求拦截边界，不能以
这些机制认证 OS 全进程网络隔离。
依据：[Playwright 网络文档](https://playwright.dev/python/docs/network)。

还有两个不能混称的验收口径：

- **同一宿主目录被访问控制拒绝**与**真实目录从未暴露到 guest**不同。
  VM 中 ENOENT 不等于针对宿主同一 inode 的 EACCES。本方案推荐“不可见且
  无可达映射”的安全目标；必须先获独立架构接受，不能自行改写旧 Gate。
  若坚持必须证明同一宿主目录 EACCES，本轮没有满足该字面条件的可用方案。
- **不能成功发送非 loopback 流量**与**没有发生非 loopback 连接尝试**不同。
  Chrome 可能尝试后台连接而被拒；必须记录拒绝计数，不能报告成“未尝试”。
  若要求连 syscall 尝试都为零，另设断言；无网卡/防火墙不能证明这一点。

威胁模型为可信宿主内核/虚拟化组件与受控测试，不承诺抵御宿主管理员、
内核攻陷或任意 hypervisor escape。普通真实用户数据仍不得作为负例读取。

## 4. 方案比较

成本是待实施的工程估计，不是本轮实测工期或资源报价。

| 方案 | 文件/全进程网络证明 | 原生 sandbox 兼容性 | 成本、风险与结论 |
| --- | --- | --- | --- |
| 仅新 HOME/Profile、mock flags、页面 route | 两者都不足 | 通常不形成外层冲突，但本轮未启动 | 低成本；不满足 Gate，不能采用 |
| stock CFT 外包当前 Seatbelt | 策略可表达目标，但运行失败 | UX-02A 已失败 | 继续调策略需要精确诊断和完整证明；不是已验证最小方案 |
| 专用宿主 UID + EndpointSecurity 文件授权 + NetworkExtension socket 过滤 | 理论上可建同一宿主路径拒绝及进程级网络策略 | 避免给 CFT 再套 Seatbelt，仍需实测 | 高成本；签名、entitlement、TCC/系统授权、helper/代理归属与 fail-closed 服务生命周期复杂，影响真实宿主，不推荐本轮引入 |
| 同机独立 macOS ARM VM，无网卡/共享 + guest 防火墙 | 宿主数据不暴露；guest 全进程网络可独立设 Gate | 不继承宿主 Seatbelt；guest 内仍须验证 CFT | 推荐。一次性镜像/runner 成本中高；保留 macOS 原生行为，VM 延迟不可外推裸机 |
| 独立 Linux VM/容器，无共享且 network none | 可建立另一内核/网络命名空间边界 | Linux 原生 sandbox，不能证明 Mac Keychain/Seatbelt 行为 | 可另行接受为功能替代验证，不能冒充此次 Mac 隔离验收 |

本机专用 UID 本身不足：其他用户的可读文件、共享组、继承描述符及系统代理
不会因“换 HOME”自动消失。不改变真实目录权限。若研究 ES/NE，必须用进程
身份而非旧 PID，并覆盖 AUTH_OPEN、既有 fd/mmap、fork/exec、helper、
崩溃服务及代理；只拦新 open 不代表完整文件边界。
本地 `ESClient.h:737–766` 明确 `es_new_client` 需要 ES entitlement 与 Full
Disk Access。网络侧至少要 socket-flow 过滤，不能只拦浏览器 URL。
依据：[Apple Network Extension entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension)、
[filterSockets](https://developer.apple.com/documentation/networkextension/nefilterproviderconfiguration/filtersockets)。

Linux 备选也不能套用不安全示例：Docker `network none` 仅创建 loopback，
默认不配置 IPv6 loopback；Playwright 官方镜像默认 root 会禁用 Chromium
sandbox。因此必须非 root、验证 user namespace/seccomp，不用 privileged、
host network/IPC、Docker socket 或宿主 HOME 挂载，也不把 Linux 结果解释为
macOS 弹窗和沙箱兼容证据。
依据：[Docker none network](https://docs.docker.com/engine/network/drivers/none/)、
[Playwright Docker](https://playwright.dev/docs/docker)。

## 5. 推荐的最小方案：所有组件同处无外联 macOS guest

### 5.1 独立内核与数据不暴露

采用 Apple Virtualization 支持的 macOS ARM guest。DSH Web、受控模型替身、
CFT、Playwright driver 全部在 guest 内，通过 guest `127.0.0.1` / `::1`
通信。不要为了让宿主 driver 访问 guest 而引入转发端口或联网桥。

foreground runner 必须在最终有效配置中明确锁定：

```text
networkDevices = []
directorySharingDevices = []
socketDevices = []
serialPorts = []
consoleDevices = []
customVirtioDevices = []
storageDevices = only explicitly owned guest/input/output disk images
```

不配置 NAT、bridged、host-only 网络、virtio-socket、SSH/VNC/CDP 转发、
共享剪贴板、拖放、USB 数据透传、宿主 agent/socket 或云账号。仅保留必要的
图形、键盘和指针设备。SDK 的空设备默认值必须变成显式校验，不能信任 VM
应用的默认共享设置。`VZSharedDirectory` 的 readOnly 仍允许读取，不能用来
挂载真实 HOME。宿主 runner 不向 guest 传受保护文件 fd 或宿主路径代理。
依据：[Apple networkDevices](https://developer.apple.com/documentation/virtualization/vzvirtualmachineconfiguration/networkdevices)、
[directorySharingDevices](https://developer.apple.com/documentation/virtualization/vzvirtualmachineconfiguration/directorysharingdevices)、
[macOS VM 前置要求](https://developer.apple.com/documentation/virtualization/running-macos-in-a-virtual-machine-on-apple-silicon)；
本地 `VZVirtualMachineConfiguration.h:123–178`、`VZSharedDirectory.h` 和
`VZVirtioSocketDeviceConfiguration.h` 提供可直接核查的接口定义。

这使 guest CFT 无需继承宿主外层 Seatbelt。guest 内不再对 CFT 套同一外层
policy，原生 sandbox 必须成功；DSH Host 仍保留独立的 guest Seatbelt 门禁。
这是新的隔离执行环境提案，不是本轮解除现有脚本阻断。

### 5.2 全进程 loopback

无 NIC 且无跨边界 IPC 提供外联不可达边界；再在 **guest 内**预置默认拒绝的
PF 策略，只允许 lo0 上 loopback 来源到 loopback 目的，覆盖双栈和所有进程。
不改宿主 PF。规则意图如下，**不是已验证的可直接部署脚本**：

```text
block drop all
pass quick on lo0 inet from 127.0.0.0/8 to 127.0.0.0/8
pass quick on lo0 inet6 from ::1 to ::1
```

启用后必须检查完整生效 rules/anchors、state、接口和路由，不得遗留先前的
宽松 pass state、`set skip on lo0` 或后续 override。策略在测试启动之前生效，
普通非管理员测试用户不能改变策略；监测配置漂移即停止。PF 语法、loopback
覆盖及系统服务兼容性必须针对所选 guest OS 实测，不能只因规则能解析就认证。
本机只读 `/usr/share/man/man5/pf.conf.5` 说明 skip 会绕过过滤、匹配既有 state
可绕过后续规则；未读取或更改真实生效规则。
概念依据：[PF filtering](https://www.openbsd.org/faq/pf/filter.html)，
该上游文档不能代替 macOS guest 的运行证据。

浏览器、helper 乃至 guest 系统代理都受 guest 边界约束，减少按 PID 过滤的
遗漏；仍需对负例记录拒绝，抓包只能作为佐证。无 NIC 不应被说成“所有后台
请求不存在”。AF_UNIX/Mach 是 guest 本地 IPC，不等于 IP loopback；禁止其
跨 hypervisor 桥接，单独记录该语义。

### 5.3 输入、工具链和资源归属

1. 先离线准备经过审查的干净 guest，不从真实 Profile 克隆，不登录账号，
   不带真实凭据/Session/Keychain。任何镜像获取与工具安装均需后续实施授权。
2. 输入盘仅含 allowlist 的源码快照、完整依赖、构建产物、受控 fixture、
   CFT/driver。冻结 SHA、lockfile 与二进制/依赖闭包哈希。Node/pnpm 先沿用
   UX-02A `24.21.0` / `11.28.5`；需 guest 支持验证。绝对依赖链接在 guest
   的隔离副本内重新解析验证，不能引用宿主真实工作区；不复制 `.env`、
   私有 Session、凭据或不必要 `.git` 内容，不调用 Provider。
3. 选择满足 restore image 配置要求的 CPU/RAM/disk，调用官方 validate。
   runner 需 `com.apple.security.virtualization` entitlement。当前没有已证明
   可直接使用的 runner/image；这是前置 Gate，不假定“机器已有 Docker”可替代。
4. host foreground runner 放入 `pnpm dev:run -- <runner> ...` 进程组。
   run-owned VM 磁盘/配置位于 `DSH_IDEA_BUILD/vm/`，日志在提供的 logs，
   不挂载 run 外真实数据。guest 内另启自己的 `.dev` 生命周期与所有权记录；
   不能复用 host PID/capability 冒充 guest 所有者。
5. guest CFT 用 guest run 的 `DSH_IDEA_BROWSER_PROFILE`，截图/视频/日志均用
   guest run 路径，显式 mock-keychain/basic flags，保留原生 sandbox。flags
   不是文件或网络控制，尤其不能假设 basic 参数在该 macOS CFT 上一定有效。
6. 结果在 guest 清理前只提升经过审查的合成截图与脱敏数值到 run-owned
   输出盘。停 guest/VMM 后才作受控导出：只读、安全文件类型/大小白名单、
   不跟随链接、不执行输出，卸载后才允许 `.dev` 清理。
7. 每次使用 disposable run-owned 磁盘；若保留共享基础镜像，必须单独批准
   存放路径、容量、哈希、责任人，并 `recordException`。OS sockets/crash
   reports 等无法完全枚举的例外同样记录，不能声称不存在。

资源估算起点可为 4 vCPU / 8 GiB RAM / 64 GiB sparse disk，但不是保证足够，
以 restore image 要求、宿主余量和构建占用为准。已有合规基础镜像时，runner、
封闭输入、边界证明与证据导出约需数个工程日；从零准备镜像和签名条件会增加
时间与磁盘成本。本轮未分配、下载或采购任何资源。

## 6. 实施顺序与验收 Gate

下一轮必须先接受“数据不暴露”的证明口径、选定 macOS guest/runner，并授权
隔离基础设施实施。不得直接删除旧脚本顶部 throw。若要求宿主路径 EACCES，
则先审查本机 ES/NE 方案；不能用 VM 路径不存在悄悄过关。

| Gate | 必须产生的证据 | 失败处理 |
| --- | --- | --- |
| V0 平台与输入 | restore image/工具链/依赖/源码/二进制 manifest、许可/资源前置条件；无真实资料输入 | 未证明就不启动测试 CFT |
| V1 effective VM | 配置与运行时设备清单；零 NIC/共享/跨边界 socket/转发；唯一盘映像清单；runner fd/入口审查 | 任何未知设备/桥接立即阻断 |
| V2 文件边界 | 所有宿主真实数据未映射的配置证明；用独立 synthetic canary 验证链接、路径逃逸和输入盘 allowlist，不读取真实目录 | 不能仅用 HOME 值或 ENOENT 代替完整证明 |
| V3 网络 | guest rules/anchors/state/接口/路由；loopback HTTP/SSE/CDP 正例；双栈非 loopback 负例被拒；浏览器主进程/helper/后台与 guest 代理覆盖，计数及抓包佐证 | 策略无效/漂移、未知通道或外发即停；不降级页面拦截 |
| V4 原生浏览器 | 二进制哈希/版本、实际启动参数和进程树；native sandbox 状态与成功启动证据；明确无禁用参数；fresh guest 下无 Keychain 弹窗 | 任一失败 STOP；不访问/重置系统钥匙串 |
| V5 UX-02A | 真实指针进入现有 UI；短/长 × live/cold × 新建/更新；受控 reasoning/text/end；取消、迟到响应与一次调用；分开记录 React commit、compositor 与合成 PNG | 失败保留原结果，不扩 timeout 或伪造绘制样本 |
| V6 清理 | browser/Host/driver 全部退出，再停 guest/VMM，释放端口/挂载/句柄；host+guest 严格审计，host removed:true 和目录不存在；例外结束检查 | 活动/未知/越界归属保留并报告，不广泛删除 |

V3 的主动负例仅在后续获授权的封闭 guest 中进行，测试地址采用预定 synthetic
目的，不访问真实服务。不能靠“这一轮没观察到包”代替持续强制策略。V4 需要
实际浏览器主进程启动参数与 helper 原生 sandbox 证据，不能用仅 renderer 的
状态推断整个进程树。

V5 保留 UX-02A 的受控模型，不产生真实 Provider 调用。首次使用免责声明应
通过正常 UI 显式处理，避免重演 Workspace 点击被拦截。不得使用 force click
掩盖状态问题。VM 内耗时只支持该平台的因果与交互结论，不能当作用户裸机的
绝对延迟；后续若需要裸机体验估计，应另立可接受的安全实验方案。

## 7. 本轮交付与边界

- 仅新增本调查文档；产品、fixture、启动阻断、依赖、Harness Core、Freeze
  与 main 均不修改。没有新浏览器样本、popup 结果或性能结论。
- 初始及提交前 strict audit 均返回 `[]`；本轮不创建执行 run，不产生
  Profile/VM 镜像。提交前远端 main/UX-02A 头仍匹配上述基线，工作区仅新增
  本报告。无清理对象、未停止任何服务。
- 历史 OS/system-service 例外仍按 UX-02A 报告保留，不声称能由本轮元数据检查
  排除历史系统产物。共享浏览器安装/工具不删除、不改配置。
- 推荐方案目前为**可分阶段实现与证伪的设计**，不是“已在当前 Mac 证明安全”。
  若 VM 设备封闭、guest 网络策略、CFT 原生 sandbox 或 Keychain 验证不能成立，
  浏览器 Gate 继续 BLOCKED，不降低安全条件，也不重跑 Full 刷绿。
