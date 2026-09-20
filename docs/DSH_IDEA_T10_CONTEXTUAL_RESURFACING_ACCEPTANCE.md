# DSH Idea T10 — Contextual Idea Resurfacing Acceptance Report

Final acceptance record for the `dsh-idea` external Harness plugin, T10 scope
(contextual Idea resurfacing: at most one lightweight suggestion above the
composer per conversation, delivered only when a newly completed turn presents
a genuinely useful, judge-confirmed opportunity), per
`docs/implements/DSH_IDEA_T10_CONTEXTUAL_RESURFACING_IMPLEMENTATION_INSTRUCTIONS.md`.

## 1. Frozen identities (§23.1–§23.6)

| Item | Value |
| --- | --- |
| `T10_BASELINE_SHA` | `184a8c6309bd3c5d155578583e8aceab04f6ddc6` — `docs: finalize dsh-idea t9r3 acceptance (t9 refrozen)` (= `origin/main` at round start; verified at T10 start) |
| `T10_TESTED_SHA` | `507d1228d412eb12a7268efec9d7dfe5849abe71` — `feat: add contextual idea resurfacing (T10)` |
| `T10_REPORT_SHA` | the documentation-only commit that carries this file; diff `T10_TESTED_SHA..T10_REPORT_SHA` touches only `docs/` |
| Harness read-only SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` (verified at start and at acceptance; unchanged) |
| Repository | `Dhandil/dsh-idea` (public), branch `main` |
| Domain name | `idea` (`packages/dsh-idea/src/spec.ts`) |
| Domain version | `idea/v3` — unchanged by T10; no schema change, no migration (`src/spec.ts` / `src/schema.ts` zero diff) |
| Storage layout | `per-record`; tables `ideas`, `discussions` (untouched) |

The Canonical Full (§5) ran on the exact tree content that became
`T10_TESTED_SHA`; the commit itself is the tested content, and no executable
file changed after the Full (§8).

**No Harness modification**: the Harness checkout at
`D:\Harness\deepseek-harness` was used read-only. No file under the Harness
tree was created, modified, or deleted by this task (pre-existing untracked
T0-era scratch files — `build.log`, `install.log`, `t0-*.txt` — were present
before T10 and were preserved untouched).

## 2. What T10 shipped (§23.7 — exact changed files)

31 files, +4633/−5 (see `git show --stat T10_TESTED_SHA`):

**Server side — `src/resurfacing/` (new module)**
- `types.ts` — frozen vocabulary and limits: signal types
  (`GOAL_DECLARATION`, `PROBLEM_RECURRENCE`, `MEMORY_GAP`, `DECISION_POINT`,
  `TOPIC_REENTRY`, `ATTITUDE_REOPENING`, `STRATEGY_RESET` + derived
  `FRUSTRATION`, `NO_CLEAR_PROGRESS`), suppression reasons (`IDEA_LIFECYCLE_INACTIVE`,
  `CURRENT_DISCUSSION_DESCENDS_FROM_IDEA`, `CREATED_IN_CURRENT_CONVERSATION`,
  `BELOW_RETRIEVAL_FLOOR`, `CANDIDATE_VERSION_CHANGED`,
  `CANDIDATE_BECAME_INELIGIBLE`), stop reasons (`FEATURE_DISABLED`,
  `NO_ELIGIBLE_IDEAS`, `CURRENT_TURN_IDEA_ACTIVE`,
  `CONVERSATION_SURFACE_BUDGET_EXHAUSTED`), Judge fail-closed codes
  (`JUDGE_UNAVAILABLE`, `JUDGE_INVALID_OUTPUT`, `JUDGE_FAILED`), expiry
  reasons (`USER_CONTINUED`, `TRIGGER_TURN_NO_LONGER_CURRENT`,
  `COMPOSER_CHANGED_SINCE_TRIGGER`), floor `8`, pool cap `3`, evidence/payload
  limits.
- `detector.ts` — deterministic Chinese opportunity detector: explicit
  atomic signals, short-form topic re-entry requiring both prior-entity
  overlap and a choice/attitude marker, medium-form attitude/strategy
  signals with `derivedFrom` derivation (no double count), continuation
  phrases silent, evidence snippets bounded (≤80).
- `retrieval.ts` — shared T9 lexical mechanics under resurfacing semantics:
  positive evidence only, floor `8`, no zero-score fill, no recency fallback,
  ranking score → updatedAt → ideaId, cap 3, computed scores stamped onto
  returned candidates.
- `suppression.ts` — deterministic suppression in frozen check order
  (lifecycle → descends-from → created-in-conversation → below-floor).
- `prompt.ts` — bounded tag-safe Judge prompt (system = frozen
  `JUDGE_SYSTEM_PROMPT`; closed answer shape `DECISION: NONE|SURFACE`,
  positive/negative reason vocab, one `IDEA:` line only when SURFACE; payload
  ≤ `RESURFACING_PAYLOAD_LIMIT`; `<` escaped so no raw tag opening can
  appear).
- `parser.ts` — strict closed-vocabulary parser; any malformed shape
  (unknown vocab, wrong casing, extra prose, SURFACE without known id or
  negative reason, NONE with idea line/positive reason, empty) fails closed
  to `JUDGE_INVALID_OUTPUT`.
- `service.ts` — `ideaResurfacing` service: zero-model `evaluate`
  (pin current versions → score → suppress → stop `NO_ELIGIBLE_IDEAS` when
  the pool is empty; no model call ever) and one-call `judge` (canonical
  revalidation of pinned ids/versions/lifecycle **before** framing, exactly
  one direct plugin-framed model call, strict failure classification with no
  retry and no lexical fallback, zero durable writes).

**Wire — `src/remote-host/`**
- `service.ts` — two new `@Remote` verbs: `idea/evaluateResurfacing`
  (non-cancellable, delegates to the resurfacing service) and
  `idea/judgeResurfacing` (client-cancellable, trailing `signal?: AbortSignal`,
  pre-aborted `gateway/cancelled` guard). Generated descriptors mark exactly
  `judgeResurfacing` cancellable (`{ parameter: 'signal' }`), everything else
  unchanged; `result.mode` stays `strict` for all.
- `types.ts` — request/result wire shapes for both verbs.

**Client — `src/client/`**
- `resurfacing-state.ts` (new) — the per-conversation
  `IdeaResurfacingController`: §9 ordering (trigger → Gate → Detector →
  retrieval/suppression → Pending → settlement wait → Judge → Final Gate →
  surface); per-epoch stale guards; `draftRev` revalidation (no TTL);
  reply-required-at-judge semantics (pre-settlement evaluate allowed, the
  judge waits for the Assistant reply to appear in-window before the
  turn/end); budget of one surfaced suggestion per conversation consumed at
  surfacing; referenced/dismissed/surfaced identity sets sharing one
  candidate-filter path; expiry reasons (`USER_CONTINUED` for a visible
  suggestion on a newer user message;
  `TRIGGER_TURN_NO_LONGER_CURRENT` when a newer user message invalidates a
  pending/triggered evaluation; `COMPOSER_CHANGED_SINCE_TRIGGER` on draft
  revision; correct-but-late results stay silent); ephemeral state only.
- `IdeaResurfaceStrip.tsx` (new) — the dock strip:
  `💡 以前保存过一个可能相关的 Idea：「<title>」` with 查看/收起， 引用， 忽略；
  查看 expands a read-only detail (核心想法 / 可能价值 / 适用场景 /
  当前结论， reusing the existing read.field locale keys). The strip never
  injects anything anywhere: until 引用 is clicked there is no prompt
  mutation, no new version, no auto save/reference/continue, and the
  triggering Assistant reply is never altered.
- `index.ts` — per-session controller map with dispose-on-effect cleanup;
  dock slot registration `conversation.input.dock` id `idea-resurface`
  order 15 (below the composer, above nothing else in the idea family);
  reference action reuses the T9 `attachReference` seam (one reference
  protocol everywhere).
- `slots.ts` — `ResurfaceStripInjected` / `ResurfaceStripProps` faces.
- `styles.ts` — `.dsh-idea-resurface*` theme-aware styles.
- `locales.ts` — `resurface.*` keys (zh/en).

**Package glue**
- `cordis.patch.yml` — `dsh-idea-resurfacing` contribution registration.
- `package.json` — `./resurfacing` export path.

**Instruction document (task-owned, tracked)**
- `docs/implements/DSH_IDEA_T10_CONTEXTUAL_RESURFACING_IMPLEMENTATION_INSTRUCTIONS.md`.

**Tests**
- New: `tests/resurfacing-detector.spec.ts` (21),
  `tests/resurfacing-retrieval-suppression.spec.ts` (12),
  `tests/resurfacing-judge.spec.ts` (27),
  `tests/client-resurfacing.spec.tsx` (26).
- Updated harnesses/assertions only: `remote-continue/evolution/lifecycle/
  read/related/search/service.spec.ts` (each remote-suite harness now
  provides an `ideaResurfacing` throwing stub — the same pattern as the
  existing `ideaEvolutions`/`ideaRelated` stubs — because the remote
  controller's inject list gained the dependency; `remote-service.spec.ts`
  additionally pins the two new descriptor ids and the cancellable set),
  `client.spec.tsx` (descriptor list, dock slot registration, component
  count 6).

## 3. Test totals (§23.8–§23.12)

| Bucket | Total | File |
| --- | --- | --- |
| Client event/replay/stale-race (§17 client vectors) | 26 | `tests/client-resurfacing.spec.tsx` |
| Detector deterministic vectors | 21 | `tests/resurfacing-detector.spec.ts` |
| Retrieval + suppression deterministic vectors | 12 | `tests/resurfacing-retrieval-suppression.spec.ts` |
| Judge parser / contract / fail-closed / zero-model evaluate / revalidation | 27 | `tests/resurfacing-judge.spec.ts` |
| **T10 total** | **86** | 4 new files |

- **T9 compatibility regression (§23.12, §16)**: the full suite at
  `T10_TESTED_SHA` is **607 / 607 passing across 40 test files**. The 521
  pre-T10 tests (T1–T9 suites) pass unchanged — no T9 behavior test was
  modified; the only pre-existing-suite changes are the remote-suite harness
  dependency stubs and the generated-descriptor/component-count assertions
  listed in §2, none of which alter T9 semantics.
- Offline seams only: every T10 test runs against scripted fakes
  (`FakeLlm`, fake session query, fake event window); no network, no
  provider.

## 4. Static / pre-Full gate results (§19 / §23.13)

| Gate | Result |
| --- | --- |
| format/lint | no format/lint script exists in this package (N/A; no Python checks mechanically run) |
| `generate:typert` | regenerated; **zero drift** against the committed `lib/` output |
| `typecheck` | clean (0 errors) |
| `build` (host) | clean |
| `build:client` | clean (tsdown, 2 files) |
| `git diff --check` | clean (CRLF conversion warnings only, no whitespace errors) |
| domain/schema drift | zero — `src/spec.ts` / `src/schema.ts` untouched, `idea/v3` unchanged |
| Harness SHA check | `c291e7961a515f6d7af9304e7fd1d257929aef26`, tracked diff zero |
| generated artifact freshness | typert host + remote-client both fresh (regeneration idempotent) |

## 5. Canonical Full (§18 final gate / §23.14)

`pnpm test` (vitest, full suite) at the tested tree: **Test Files 40 passed
(40); Tests 607 passed (607)**. This was the last executable gate; see §8
for the post-Full drift proof.

## 6. Real provider/model call count (§22 / §23.15)

**Zero.** No real provider, network, or model call was made anywhere in T10:
all suites (including every Judge test) use scripted fakes; no smoke or E2E
stage is defined by the T10 instruction document, and none was improvised.
The Judge prompt-framing and call-shape assertions pin that the runtime
call would be one direct plugin-framed request on the default route, but no
such call was executed during acceptance.

## 7. Architecture / scope audit

- **Resurfacing ≠ Context Injection**: no prompt injection, no
  Conversation/Idea mutation, no new version, no auto Save/Reference/Continue,
  and no alteration of the triggering Assistant reply anywhere in the
  pipeline; the only write-shaped action is the user-initiated 引用，
  which goes through the existing T9 reference-append seam and produces a
  composer chip (explicit user choice).
- **Default silence**: every failure and every gate expires to silence —
  no retry, no lexical fallback for the Judge, no suggestion without a
  valid surface verdict on a valid pinned candidate.
- **Ephemeral runtime state only** (§15): controller maps live in module
  scope and die with the session; nothing resurfacing-related is persisted.
- Out-of-scope items confirmed not implemented: no TTL-based revalidation
  (draftRev only), no embedding/vector retrieval, no learned ranking, no
  cross-conversation dismiss cooldown, no §15.1 durable audit trail, no
  harness-core change, no T11 work.

## 8. Post-Full executable drift (§21 / §23.20–§23.21)

**None.** After the Canonical Full the only commit is `T10_TESTED_SHA`
itself (the tested working tree committed verbatim) followed by this
documentation-only commit. `git diff --stat T10_TESTED_SHA..T10_REPORT_SHA`
will list only `docs/DSH_IDEA_T10_CONTEXTUAL_RESURFACING_ACCEPTANCE.md`.

`git status` at acceptance (§23.20): clean —
`nothing to commit, working tree clean` after the report commit; no
unrelated user drift exists in this repository (§23.21). The unrelated
drift that does exist elsewhere is confined to the read-only Harness
checkout's pre-existing untracked scratch files (§1) and is preserved
untouched.

## 9. Known limitations (§23.19)

- Lexical-only retrieval may miss synonym-only resurfacing opportunities.
- Deterministic Chinese opportunity rules are intentionally conservative.
- No cross-conversation dismiss cooldown (a dismissal in one conversation
  does not suppress the same Idea in another).
- No embedding/vector retrieval.
- No learned resurfacing ranking.
- The §15.1 durable audit trail is not implemented; runtime observability
  is limited to the evaluate result's `suppressed[]` and the client
  `lastExpireReason` state.
- The per-conversation budget (one surfaced suggestion) is consumed at
  surfacing: after any visible suggestion, later turns are budget-blocked
  even if the suggestion was dismissed; the referenced/dismissed/surfaced
  identity sets remain as defense in depth (and carry the composer-chip
  race filter).

## 10. origin/main verification (§23.22)

After the report commit, `main` was pushed to `origin` and re-verified:
`origin/main` = the `T10_REPORT_SHA` docs-only commit whose parent is
`T10_TESTED_SHA`, whose parent is `T10_BASELINE_SHA` (`184a8c6…`). Exact
SHAs are recorded in the execution report that accompanied this file.

## 11. Verdict (§24)

All required executable gates passed and the final remote verification is
clean:

```text
DSH_IDEA_T10_CONTEXTUAL_RESURFACING_ACCEPTED
```

T10 stops here. T11 is not started.
