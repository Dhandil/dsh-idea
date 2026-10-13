# DSH Idea T13.2 Positive-Surface Fixture Design Proof

- **Outcome:** `T13_2_POSITIVE_SURFACE_FIXTURES_READY_FOR_ARCHITECTURE_REVIEW`
- **Baseline:** `674aa8aa729ce5cb425821540a8820eb83b2b9ab`
- **Preflight:** `HEAD == origin/main == 674aa8aa729ce5cb425821540a8820eb83b2b9ab`; tracked and staged drift were zero before this document was created.
- **Tested executable:** `7f1703badb6e48845798d8444d00f1e12023c5d8`
- **Scope:** Offline fixture design proof against the current production detector and lexical retrieval code only.
- **Not performed:** real-provider calls, browser validation, product/test/Harness changes, or a test-suite run.

This proof establishes deterministic admission and lexical eligibility for the exact fixtures below. It does not predict or claim a positive Judge verdict: Judge output is deliberately nondeterministic and was not called. The intended positive reason is a design hypothesis for the later live closure.

## Production proof method

Each exact trigger was passed to `detectResurfacingOpportunity({ currentTurn, recentContext: [] })` from `src/resurfacing/detector.ts`. Candidate fields were scored with the production `extractQueryFeatures` and `scoreResurfacingCandidate` functions, and the production `selectResurfacingPool` confirmed that each candidate survives the frozen floor. The floor is `8`; the production field weights are title `5`, core `4`, motivation `3`, currentConclusion `3`, useWhen `3`, possibleValue `2`, and openQuestions `2`.

Each candidate uses the supplied TARGET draft verbatim. The drafts do not specify `motivation` or `openQuestions`; those fields were empty for scoring. Synthetic IDs and other required non-text candidate metadata do not contribute to lexical scoring. `FIELD_MATCHES` below lists each distinct extracted query feature found in each normalized candidate field; each feature is counted once per field.

## Selection

| Rank | Fixture | Detector | Lexical score / floor | Information-gap and live-use assessment |
|---:|---|---|---:|---|
| 1 | A — Missing option | `GOAL_DECLARATION`, strong | `39 / 8` (`+31`) | Best primary: the trigger states the spatial-decision problem but not a rotating-range mechanic. The otherwise-fixed shape and limited post-deploy rotation are a concrete missing option. |
| 2 | C — Forgotten direction | `GOAL_DECLARATION`, strong | `59 / 8` (`+51`) | Fallback: the trigger asks about position and orientation but does not supply a front-entry bonus or connect enemy approach direction to tower facing. Useful under its stated simple-map constraint. |
| 3 | B — Decision value | `GOAL_DECLARATION`, strong | `91 / 8` (`+83`) | Second fallback: the prompt presents two unchosen alternatives, including the target's broad direction. The exact three-family prototype and test criterion add the unique actionable value, but this has the greatest ordinary-reply duplication risk. |

**Recommended primary for one final live positive-surface closure: Fixture A.** It has the cleanest information gap while retaining a strong lexical margin. Fixture C is the fallback. Fixture B should be used only if Architecture Review agrees that its concrete three-family test remains useful beyond the broad alternative already named in the trigger.

## Fixture A — Missing option

**Exact TARGET draft**

- **Title:** 塔防的旋转攻击范围模块
- **Core:** 不要只让塔拥有固定圆形或扇形攻击范围。给每座塔增加一个独立的“旋转范围模块”：攻击覆盖形状本身不变，但玩家可以在部署后有限次数旋转覆盖方向。不同塔通过旋转次数、旋转冷却和覆盖形状形成空间构筑差异。
- **Possible Value:** 把“塔的差异”从单纯数值差异变成空间决策。玩家需要考虑道路转角、敌人来向和不同塔之间的覆盖拼接。
- **Use When:** 当塔防玩法已经有基础攻击范围，但不同塔的部署决策仍然过于相似时。
- **Current Conclusion:** 先只做“固定形状 + 可有限旋转”的 Prototype，不加入自由绘制或复杂模块拼装。

**Exact trigger**

```text
我准备重新做一款塔防游戏。现在不同塔虽然数值和技能不同，但摆放时的思考还是太像了，我想让不同塔在空间布局上真正产生不同决策，第一步应该尝试什么？
```

**Detector proof**

- `ADMITTED = TRUE`
- `STRONG_SIGNAL_TYPES = [GOAL_DECLARATION]`
- `EVIDENCE = [{ type: GOAL_DECLARATION, strength: strong, evidence: "准备重新做" }]`

**Lexical retrieval proof**

- `QUERY_FEATURES` (58): `我准, 准备, 备重, 重新, 新做, 做一, 一款, 款塔, 塔防, 防游, 游戏, 现在, 在不, 不同, 同塔, 塔虽, 虽然, 然数, 数值, 值和, 和技, 技能, 能不, 但摆, 摆放, 放时, 时的, 的思, 思考, 考还, 还是, 是太, 太像, 像了, 我想, 想让, 让不, 塔在, 在空, 空间, 间布, 布局, 局上, 上真, 真正, 正产, 产生, 生不, 同决, 决策, 第一, 一步, 步应, 应该, 该尝, 尝试, 试什, 什么`
- `FIELD_MATCHES`: title `[塔防]`; core `[不同, 同塔, 空间]`; motivation `[]`; currentConclusion `[]`; useWhen `[塔防, 不同, 同塔, 决策]`; possibleValue `[不同, 同塔, 数值, 空间, 决策]`; openQuestions `[]`.
- `LEXICAL_SCORE = 1×5 + 3×4 + 4×3 + 5×2 = 39`.
- `RETRIEVAL_FLOOR = 8`; margin `+31`; production pool selection retained the candidate.

**Exact text-overlap review**

`UNIQUE_VALUE_NOT_IN_TRIGGER = TRUE`. The trigger describes similar placement decisions and asks what to try; it does not state an attack-range module, preserve a fixed shape while rotating it, or limit rotations after deployment. The distinctive missing option is “固定形状 + 部署后有限次数旋转覆盖方向,” with rotation count and cooldown as balancing variables. This is not a rewording of the trigger's problem statement.

**Intended Judge positive reason:** `ADDS_MISSING_OPTION` — a specific spatial mechanic absent from the user's stated alternatives that could change the first prototype and its next step.

## Fixture B — Decision value

**Exact TARGET draft**

- **Title:** 塔防攻击范围应该优先做方向性而不是复杂形状
- **Core:** 如果目标是让部署位置产生明显差异，第一版不要先做十几种复杂攻击范围。只做三种方向性：前方长条、侧向扇形、环形近距离。先验证方向性是否真的改变玩家选位。
- **Possible Value:** 用最小 Prototype 判断空间方向性本身是否值得继续投入。
- **Use When:** 需要决定攻击范围 Prototype 第一版范围时。
- **Current Conclusion:** Prototype 先比较方向性差异，不先堆复杂形状数量。

**Exact trigger**

```text
我打算重新设计塔防的攻击范围系统。现在我在犹豫，第一版到底应该优先增加很多不同形状，还是先把少量范围做出明显的空间差异？
```

**Detector proof**

- `ADMITTED = TRUE`
- `STRONG_SIGNAL_TYPES = [GOAL_DECLARATION]`
- `EVIDENCE = [{ type: GOAL_DECLARATION, strength: strong, evidence: "打算重新设计" }]`

**Lexical retrieval proof**

- `QUERY_FEATURES` (51): `我打, 打算, 算重, 重新, 新设, 设计, 计塔, 塔防, 防的, 的攻, 攻击, 击范, 范围, 围系, 系统, 现在, 在我, 我在, 在犹, 犹豫, 第一, 一版, 版到, 到底, 底应, 应该, 该优, 优先, 先增, 增加, 加很, 很多, 多不, 不同, 同形, 形状, 还是, 是先, 先把, 把少, 少量, 量范, 围做, 做出, 出明, 明显, 显的, 的空, 空间, 间差, 差异`
- `FIELD_MATCHES`: title `[塔防, 攻击, 击范, 范围, 应该, 该优, 优先, 形状]`; core `[攻击, 击范, 范围, 第一, 一版, 明显, 差异]`; motivation `[]`; currentConclusion `[形状, 差异]`; useWhen `[攻击, 击范, 范围, 第一, 一版]`; possibleValue `[空间]`; openQuestions `[]`.
- `LEXICAL_SCORE = 8×5 + 7×4 + 2×3 + 5×3 + 1×2 = 91`.
- `RETRIEVAL_FLOOR = 8`; margin `+83`; production pool selection retained the candidate.

**Exact text-overlap review**

`UNIQUE_VALUE_NOT_IN_TRIGGER = TRUE`, narrowly. The trigger presents “many shapes” versus “a few ranges with clear spatial difference” as unresolved alternatives; it does not choose one. The TARGET adds a testable implementation: exactly three directional families (front long-range, lateral fan, close ring) and a prototype check of whether directionality changes player placement. The broad choice itself is already salient in the trigger and is not claimed as unique. This has the highest risk that an ordinary Agent answer will independently recommend the same broad direction, so it is ranked third.

**Intended Judge positive reason:** `ADDS_DECISION_VALUE` — the candidate resolves the stated first-version scope decision with a small, testable set of concrete range families.

## Fixture C — Forgotten direction

**Exact TARGET draft**

- **Title:** 用敌人来向决定塔的朝向价值
- **Core:** 塔的空间差异不一定来自攻击范围形状本身。可以让部分塔对正面进入覆盖区的敌人获得额外效果，从而让敌人来向和塔的朝向成为部署变量。
- **Possible Value:** 即使地图格子数量不多，也能通过方向性制造新的布局决策。
- **Use When:** 地图结构较简单，但仍希望塔的位置和朝向具有策略意义时。
- **Current Conclusion:** 优先测试“敌人来向 + 塔朝向”的小型机制，而不是继续增加地图规则。

**Exact trigger**

```text
我决定重新开发塔防原型。现在地图已经比较简单了，我不想再增加更多格子和地形规则，但还是希望摆塔的位置和方向更有策略性。之前有没有值得重新拿出来的思路？
```

**Detector proof**

- `ADMITTED = TRUE`
- `STRONG_SIGNAL_TYPES = [GOAL_DECLARATION]`
- `EVIDENCE = [{ type: GOAL_DECLARATION, strength: strong, evidence: "决定重新开发" }]`

**Lexical retrieval proof**

- `QUERY_FEATURES` (64): `我决, 决定, 定重, 重新, 新开, 开发, 发塔, 塔防, 防原, 原型, 现在, 在地, 地图, 图已, 已经, 经比, 比较, 较简, 简单, 单了, 我不, 不想, 想再, 再增, 增加, 加更, 更多, 多格, 格子, 子和, 和地, 地形, 形规, 规则, 但还, 还是, 是希, 希望, 望摆, 摆塔, 塔的, 的位, 位置, 置和, 和方, 方向, 向更, 更有, 有策, 策略, 略性, 之前, 前有, 有没, 没有, 有值, 值得, 得重, 新拿, 拿出, 出来, 来的, 的思, 思路`
- `FIELD_MATCHES`: title `[决定, 塔的]`; core `[塔的]`; motivation `[]`; currentConclusion `[地图, 增加, 规则]`; useWhen `[地图, 较简, 简单, 希望, 塔的, 的位, 位置, 置和, 有策, 策略]`; possibleValue `[地图, 格子, 方向]`; openQuestions `[]`.
- `LEXICAL_SCORE = 2×5 + 1×4 + 3×3 + 10×3 + 3×2 = 59`.
- `RETRIEVAL_FLOOR = 8`; margin `+51`; production pool selection retained the candidate.

**Exact text-overlap review**

`UNIQUE_VALUE_NOT_IN_TRIGGER = TRUE`. The trigger states the constraints (simple map, no more tile or terrain rules) and the desire for strategic placement/orientation. It does not specify that enemies entering a tower's coverage from the front receive a bonus, or make enemy arrival direction plus tower facing a deployment variable. That mechanic is the distinct direction to restore.

**Intended Judge positive reason:** `RESTORES_FORGOTTEN_DIRECTION` — the user explicitly asks for a worthwhile earlier idea, and this candidate offers a particular orientation mechanic not contained in the present trigger.

## Later live-run automation constraints

- Automated workspace creation must use the official `workspace/create` Remote/RPC only.
- Do not open macOS Select Workspace Directory.
- On every outcome, terminate the task-owned automation Chromium instance, not just the page.
- Verify task-owned pages `= 0`, contexts `= 0`, windows `= 0`, and browser processes `= 0`.
- Never broad-kill the user's normal browser.

This document freezes fixture candidates for Architecture Review only. No live provider or browser step is authorized by this proof; await review before the later live run.
