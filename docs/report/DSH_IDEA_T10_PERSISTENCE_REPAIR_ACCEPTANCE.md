# DSH Idea — T10 Persistence Repair 验收报告

结论：`DSH_IDEA_T10_PERSISTENCE_REPAIR_ACCEPTED`

---

## 1. 基线 SHA

| 项目 | SHA |
| --- | --- |
| starting SHA（修复前 dsh-idea HEAD = origin/main） | `3f0fd2b70a019bb9fbd23b74b3bc2004fda624e2` |
| Harness SHA（全程只读） | `ddefc45fbc7f8e46dd73185e68295696d1297887` |
| tested executable SHA（Canonical Full 通过时的提交） | `4c38e2b38cb7167be0af62f309cdb8817347846d` |
| docs-only acceptance SHA | 即本报告所在提交（父提交为 tested executable SHA，仅含本报告一个文件，可用 `git show --stat` 验证） |

---

## 2. 变更文件（executable commit，共 11 个）

源码（7 个）：

- `packages/dsh-idea/src/types.ts` — 新增 `ResurfacingBudget { surfaceBudgetConsumed: true }`
- `packages/dsh-idea/src/schema.ts` — 新增 `resurfacingBudgetSchema`（zod literal）
- `packages/dsh-idea/src/spec.ts` — idea 域声明追加 `resurfacing_budgets` 表（version 保持 3）
- `packages/dsh-idea/src/service.ts` — Host 预算读 `getResurfacingBudget` / 原子认领 `claimResurfacingBudget` + `budgetTails` per-conversation mutation tail
- `packages/dsh-idea/src/remote-host/types.ts` — 预算读/认领的 wire 类型
- `packages/dsh-idea/src/remote-host/service.ts` — 两个 `@Remote` 面：`idea/getResurfacingBudget`、`idea/claimResurfacingBudget`
- `packages/dsh-idea/src/client/resurfacing-state.ts` — controller 修复：read-before-evaluate、claim-after-final-gate、claim-before-UI、全部 fail-closed（`budgetUsed` 完全移除，替换为 `budgetState: 'loading' | 'free' | 'consumed' | 'failed'` + `retainedTurn`）

测试（4 个）：

- `packages/dsh-idea/tests/resurfacing-budget.spec.ts`（新建，6 用例）
- `packages/dsh-idea/tests/client-resurfacing.spec.tsx`（新增 durable budget 全套用例）
- `packages/dsh-idea/tests/client.spec.tsx`（descriptor 精确清单 + 2 个新面）
- `packages/dsh-idea/tests/remote-service.spec.ts`（descriptor 精确清单 + 2 个新面）

合计 784 insertions / 35 deletions。除上述 11 个文件外无任何可执行改动。

---

## 3. 新表 schema 与冻结一致性

- 表名（spec `tables` key，即 on-disk 目录名）：`resurfacing_budgets`（满足 storage-domain `UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/` 的小写 snake_case 约束）
- 键：`string` = SessionId / conversationId
- 记录值：精确 `{ surfaceBudgetConsumed: true }`（`z.literal(true)`，别无他键）
- on-disk 文档（per-record 布局，`root/idea/resurfacing_budgets/<sessionId>.json`）：

```json
{
  "version": 3,
  "record": { "surfaceBudgetConsumed": true }
}
```

测试断言 `Object.keys(record) === ['surfaceBudgetConsumed']`，最小持久事实与冻结一致。

---

## 4. 域版本保持 3 / 无迁移证明

- 程序化核验输出：`version: 3`、`compatibleVersions: [1,2]`、`tables: ideas,discussions,resurfacing_budgets`
- 无 `idea/v4`、无新 domain（唯一 `defineDomain` 名为 `idea`）
- 无迁移证明（`resurfacing-budget.spec.ts` "additive table compatibility"）：手写修复前的 ideas/discussions fixture（不存在 budget 目录）→ 正常打开、list/getDiscussion 正确、`getResurfacingBudget → {consumed: false}`、`readdir(resurfacing_budgets)` reject；认领后仅新增 `conversation-fixture.json`，既有记录字段（updatedAt=100、currentVersionId）原样未动。budget 表从空开始，无 backfill、无迁移代码。

---

## 5. Host mutation tail 设计

`service.ts` 中 `budgetTails: Map<string, Promise<void>>`，`enqueueBudgetClaim<T>(sessionId, operation)`：

- 同 session：`tail.then(operation, operation)` 串行追加，后一操作只见前一操作的已决结果，不与之赛跑
- 不同 session：互不阻塞
- tail 永远 settle（rejection 被吞掉），失败认领不污染后续操作
- 空闲条目自移除（测试断言 tail size 归 0）

原子性范围：仅同一 Host 进程内（冻结 §10 的既定范围）。

---

## 6. 核心证明

- **原子同 Host 认领**：10 轮 × 每轮 8 个并发认领 → 每轮恰好 1 个 `CLAIMED` + 7 个 `ALREADY_CONSUMED`；磁盘恰好 10 个 `.json`
- **跨 session 独立**：12 个并发不同 session 全部 `CLAIMED`，二次认领全部 `ALREADY_CONSUMED`，未认领 session 保持 free
- **持久化 round-trip**：创建 idea + 认领 → `ctx.fiber.dispose()` → 以同 root 重启完整栈 → `consumed: true`、再认领 `ALREADY_CONSUMED`、idea 列表完好
- **refresh/recreate（client）**：controller #1 认领并展示 → dispose → 同 session controller #2：0 次 evaluate / judge / claim，无 suggestion
- **双 controller（同 Host）**：共享同一 Host 预算存储，两客户端 judge 各自延迟后先后解决 → 认领结果排序后为 `['ALREADY_CONSUMED', 'CLAIMED']`，恰好一条 suggestion，落败方静默
- **read 失败 fail-closed**：budget 读 `{ok:false}` 或 transport reject → `budgetState='failed'`（永久），不 evaluate
- **claim 失败 fail-closed**：认领 `{ok:false}` → 静默返回、`budgetState` 不变（Host 侧认领可能已提交，由 Host 对后续机会重新把关）；"ambiguous failure" 用例验证后续 turn 经排队响应重读预算后被抑制
- **ALREADY_CONSUMED**：静默 + `budgetState='consumed'` 终身抑制 + 持久层二次认领一致返回

---

## 7. 聚焦回归（§23）

Canonical Full 之前运行除 `package.spec.ts` 外全部 40 个测试文件：**40 files / 611 tests 全部通过**。覆盖：

- T9：`search`、`related-*`（prompt/retrieval/service）、`reference-*`（projection/service/uri）、`continuation`、`discussion`、`client-search`、`client-related`、`client-continue`、`client-t9r2`、`client-t9r3`、`remote-search`、`remote-related`、`remote-continue`
- T10：`resurfacing-detector`、`resurfacing-judge`、`resurfacing-retrieval-suppression`、`lexical-regression`、`client-resurfacing`、`resurfacing-budget`、`remote-service`
- 其余：schema / service / lifecycle / preparation-* / evolution* / remote-* / client-* / version

T9 与 T10 既有面零回归。

---

## 8. §28 架构审计（全部 PASS）

| 审计项 | 结论 | 证据 |
| --- | --- | --- |
| idea/v3 version unchanged | PASS | 程序化核验 version=3、compatibleVersions=[1,2] |
| new table additive only | PASS | spec tables 块仅追加 `resurfacing_budgets`，既有两表声明未动 |
| no idea/v4 | PASS | 同上 |
| no new domain | PASS | 唯一 domain `idea` |
| no Harness modification | PASS | Harness HEAD 不变、tracked diff = 0 |
| no cleanup on session/disposed | PASS | src 中 grep `session/disposed` = 0 命中 |
| no cleanup on api-session/removed | PASS | src 中 grep `api-session/removed` = 0 命中 |
| Host per-conversation mutation tail exists | PASS | `budgetTails` + `enqueueBudgetClaim` |
| same-session claim serialized | PASS | 10×8 并发认领恰好 1 CLAIMED |
| read-before-evaluate fail-closed | PASS | 初始 `loading` 门；读失败→`failed` 永久不 evaluate |
| claim-after-final-gate | PASS | Final Delivery Gate 全部检查通过后才 await claim（期间 `judging=true` 不释放） |
| claim-before-UI | PASS | CLAIMED + post-claim 重检后才 publish |
| ALREADY_CONSUMED silent | PASS | 静默 + 消费态 + 无 publish |
| claim failure silent | PASS | `!claim.ok` 静默返回、budgetState 不变 |
| dismiss/reference not persisted | PASS | `dismissedIds` 为内存 Set；全 service.ts 仅三处 put（ideas、discussions、budget claim），无新 dismissal 写路径 |
| T9 Reference authority unchanged | PASS | reference-* 源文件零改动（git diff --stat） |
| T10 Judge unchanged | PASS | resurfacing/（judge/detector/retrieval）源文件零改动 |
| T10 UI unchanged | PASS | UI 相关源文件零改动 |
| T11 not started | PASS | src 中 grep `T11` = 0 命中 |

---

## 9. 静态门与 Typert（§25 / §24 / §27）

- `pnpm setup:dev` 通过（dsh-idea 0.1.6-alpha.2 链接刷新）
- `pnpm generate:typert` 重新生成成功
- `git diff --check` 通过（仅 CRLF 提示，无空白错误）
- `pnpm typecheck` 通过
- `pnpm build` 通过；`pnpm build:client` 通过（lib/client.js 340.84 kB）
- **Typert 生成结果**：重新生成后审计 `lib/typert.remote-client.d.ts` — 恰好新增 2 个非可取消面（`idea/getResurfacingBudget`、`idea/claimResurfacingBudget`，无 signal 参数），既有 19 个面签名与取消性完全不变；descriptor 精确清单测试（21 个 id）与取消性断言双向锁定。**注**：`lib/` 在 `.gitignore` 中，生成 Typert 属构建产物、不进版本库——由 `package.spec.ts` 在构建后验证。
- **§27**：`REAL_PROVIDER_CALLS=0`、`REAL_CHAT_MODEL_CALLS=0`、`PUBLIC_NETWORK_CALLS=0`（全部测试走离线 seam / 本地 json 后端 / fake）

---

## 10. Canonical Full 精确总数（§26，最后执行）

```text
Test Files  41 passed (41)
     Tests  625 passed (625)
```

修复前基线为 40 files / 608 tests；净增 1 文件 / 17 用例。Full 通过后无任何可执行改动（tested executable SHA = 本节对应的提交 `4c38e2b38cb7167be0af62f309cdb8817347846d`）。

---

## 11. Harness 只读与漂移保留

- Harness HEAD：`ddefc45fbc7f8e46dd73185e68295696d1297887`（未变）
- Harness tracked diff = **0**
- 6 个既有 untracked 全部保留：`build.log`、`install.log`、`t0-model.txt`、`t0-remote.txt`、`t0-session.txt`、`t0-storage.txt`
- dsh-idea 用户 docs 漂移原样保留（未还原、未提交）：5 个已删除的 `docs/DSH_IDEA_*.md` 保持未暂存删除；`docs/architectue/`、`docs/implements/*`、`docs/report/` 既有文件保持 untracked
- 生成 Typert（`lib/typert.host.*`、`lib/typert.remote-client.*`）为 gitignored 构建产物，不在提交内

---

## 12. 最终 git status 与 origin/main 等值（§31）

- 本次提交后执行 push 与 `git fetch`，要求 `git rev-parse HEAD == git rev-parse origin/main`
- `T10_PERSISTENCE_REPAIR_TESTED_EXECUTABLE_SHA..HEAD` 仅含本报告（docs-only），以 `git diff --name-only <tested>..HEAD` 验证
- T11 未开始（本任务在此停止）
