# DSH Idea T9 — Search, Reference, and Unified Actions Acceptance Report

Final acceptance record for the `dsh-idea` external Harness plugin, T9 scope
(composer Idea search, exact-version Idea references, unified assistant
actions, Settings library search), per
`docs/implements/DSH_IDEA_T9_SEARCH_REFERENCE_UNIFIED_ACTIONS_IMPLEMENTATION_INSTRUCTIONS.md`.

## 1. Frozen identities

| Item | Value |
| --- | --- |
| `T9_BASELINE_SHA` | `6767ec0dafe2cec6e782c6bf5b58b4175e6076e4` — `docs: update dsh-idea t8 acceptance` (T8/T8R/T8R2 accepted state) |
| `T9_TESTED_SHA` | `4e220714de10f15822e2a934d8e6ed1429486e54` — `feat: add dsh-idea search, exact-version references, unified actions` |
| `T9_REPORT_SHA` | the documentation-only commits that carry this file — a two-commit chain directly after `T9_TESTED_SHA`: `ac178e1` (`docs: record dsh-idea t9 acceptance`, which added this report plus the pending T8/T8R/T8R2/T9 instruction documents) and `943dce5` (`docs: update dsh-idea t9 acceptance`, wording only). The diff `T9_TESTED_SHA..943dce5` touches only `docs/`. |
| Harness read-only baseline SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| Repository | `Dhandil/dsh-idea` (public), branch `main` |
| Domain name | `idea` (`packages/dsh-idea/src/spec.ts`) |
| Domain version | unchanged by T9 — no schema change, no migration |
| Storage layout | `per-record`; tables `ideas`, `discussions` (untouched) |

`T9_TESTED_SHA` is the executable candidate that produced every result below.
All offline gates, the zero-provider smoke, and the real-model E2E were run
against exactly this tree; the executable files did not change after the final
E2E stage (see §12).

**No Harness modification**: the Harness checkout at
`D:\Harness\deepseek-harness` was used read-only at the SHA above. No file
under the Harness tree was created, modified, or deleted; no Harness-core
patch, shim, or override was introduced. T9 ships entirely inside
`packages/dsh-idea`.

## 2. What T9 shipped

### 2.1 Search architecture and result semantics (§4–§7)

- `src/search/service.ts` — the pure host-side ranking core. A **blank query**
  surfaces every in-scope Idea by `updatedAt DESC → ideaId ASC` (recency
  fallback). A **non-blank query** surfaces only positive-score Ideas, ordered
  `score DESC → updatedAt DESC → ideaId ASC`, with **no zero-score recency
  fill**. Ranking runs over current versions only, is deterministic, and
  performs no durable write.
- Lexical scoring reuses the T7 Related field weights
  (`SEARCH_FIELD_WEIGHTS = RELATED_FIELD_WEIGHTS`) over title / core /
  motivation / currentConclusion / possibleValue / useWhen / openQuestions,
  with the shared normalization (`normalizeLexical`) and a shared
  `isBlankQuery` predicate — Search is a **lexical ranking read, never an LLM
  call** (§31 non-goal enforced; no embeddings, no BM25 dependency).
- Result cap `IDEA_SEARCH_RESULT_LIMIT`; results project to `IdeaSearchResult`
  `{ ideaId, title, core, status, updatedAt, reference }` where `reference` is
  the canonical `ideaReferenceDescriptor` (exact ideaId + currentVersionId).
- Scope parameter `current | all`: `current` excludes archived records;
  `all` includes them with their status label (Settings surface).
- `src/remote-host/service.ts` exposes `idea/search` as a `@Remote` read
  (`IdeaSearchRequest { query, scope }` → `IdeaSearchResult[]`). The verb is
  **client-cancellable**: it declares the trailing `signal?: AbortSignal`
  parameter (gateway cancellation contract) and fails fast with
  `RemoteError('gateway/cancelled')` when the signal is already aborted. The
  generated typert descriptors mark exactly
  `create / prepareFromMessage / prepareEvolution / relatedFromMessage /
  search` as cancellable (`{ parameter: 'signal' }`); every other verb stays
  non-cancellable (contract-asserted in `tests/remote-service.spec.ts`).

### 2.2 Exact-version Idea Reference protocol (§8–§14)

- `src/reference/uri.ts` — canonical URI codec:
  `dsh-idea:<base64url({ideaId, versionId})>` pins one exact version, with
  label escaping (`escapeIdeaReferenceLabel` / `unescape…`), mention
  formatting `@[label](dsh-idea:…)` (frozen `MENTION_PATTERN`), and
  `ideaReferenceDescriptor` producing the canonical client-side projection.
  Decode rejects malformed payloads; encode is deterministic.
- **Client serialization** (`src/client/`, composer integration): the chip is
  a Lexical decorator node (`data-composer-chip="idea"`); at submit the codec
  serializes the composer to exactly the canonical mention form — labels are
  display-only, the wire payload carries the pinned
  `{ideaId, versionId}`. Multiple/degraded mentions cannot pass serialization
  (validated; the submit serializer accepts exactly one canonical mention).
  The codec's copy/cut/persistence projection is plain text per the host
  input contract.
- **Host resolution** (`src/reference/service.ts`): one prepended
  `agent/pre-step` inspects **only direct user messages**, extracts canonical
  mentions, decodes the exact-version pins, loads those aggregates, and splices
  a bounded recall context (`src/reference/context.ts`, budgeted by
  `src/retrieval/budget.ts`) as a user-role context — the mention text is
  rewritten to `Idea「label」` prose. Resolution is exact-version: the recall
  content comes from the pinned `versionId`, not from whatever happens to be
  current at read time. Pins to missing or deleted ideas/versions are a
  fail-loud rejection before any model request (pre-step reject, zero model
  calls, zero partial recall context) — never a degradation, a substitution,
  or a marked-unavailable note.
- **Search/Related shared reference behavior (§13)**: the composer search
  card's 添加 and the Related overlay's 添加 both go through the same
  reference-append seam (`src/client/reference-append.ts`) and produce the
  same canonical chip from the same `ideaReferenceDescriptor` — one reference
  protocol everywhere; neither path sends a prompt by itself.
- **Projection tests** (`tests/reference-projection.spec.ts`,
  `tests/reference-uri.spec.ts`, `tests/reference-service.spec.ts`) pin the
  codec round-trip, label escaping, pre-step boundaries (non-user messages
  ignored), exact-version recall, and the fail-loud rejection of malformed,
  over-limit, and missing/deleted pins before any model request.

### 2.3 Unified assistant-action behavior (§15–§18)

- `src/client/IdeaAssistantActions.tsx` replaces the T6/T7 split entry points
  (`IdeaMessageActions` / `IdeaRelatedActions` deleted) with one 保存为 Idea
  action on assistant messages whose menu offers 总结 (save preparation) and
  相关 (related lookup). One command id, one visibility rule, one locale set.
- The client contribution registers the required inject declarations
  (`commandUi`, `inputTriggers`, `conversation`) — asserted by
  `tests/package.spec.ts`.
- The menu and card surfaces drive the remote verbs
  `idea/prepareFromMessage` (cancellable) and `idea/relatedFromMessage`
  (cancellable); the durable `idea/create` commit stays non-cancellable.

### 2.4 Settings Search behavior (§19–§21)

- The Settings Ideas page gains 搜索全部 Idea…: blank query renders the
  当前/已归档 tab views; a non-blank query renders one mixed ranked list
  across statuses with per-row status labels (已归档 included via scope
  `all`); clearing the box restores the prior tab. State machine in
  `src/client/search-state.ts` (epoch-guarded async runner; stale responses
  discarded; client-side abort on new input/close).
- The composer search card (`.dsh-idea-search`) shares the same remote verb
  with scope `current`, so archived Ideas are never discoverable from the
  composer (§31).

## 3. Full test counts and files

- **487 / 487 tests passing across 34 test files** (`pnpm test`, vitest) at
  `T9_TESTED_SHA`. T9 added: `search.spec.ts`, `remote-search.spec.ts`,
  `client-search.spec.tsx`, `reference-uri.spec.ts`,
  `reference-projection.spec.ts`, `reference-service.spec.ts`,
  `lexical-regression.spec.ts`, and extended `remote-service.spec.ts`
  (cancellation contract), `package.spec.ts` (inject declarations),
  `client.spec.tsx` / `client-read.spec.tsx` / `client-related.spec.tsx`
  (unified action surfaces), `related-*.spec.ts` (shared weights/normalizer).
- Offline seams only: no real provider, network, or model in the suite.

## 4. Static / build gate results (§25 order)

| Gate | Result |
| --- | --- |
| `generate:typert` | no drift (regenerated after the `idea/search` signature change; committed output matches) |
| `typecheck` | clean |
| `pnpm test` | 487/487 (34 files) |
| `build` (host) | clean |
| `build:client` | clean |
| `git diff --check` | clean (CRLF conversion warnings only, no whitespace errors) |

## 5. Zero-provider smoke (§26)

- Result: `SMOKE_RESULT {"passed":18,"failed":0}` — run once before the search
  cancellation fix and **re-run in full after the fix** against an isolated
  temp `DSH_HOME` with profile `dsh-idea-v1-offline` (no credentials, no
  network route): 18/18 both times. The 18 checks cover boot, Idea menu
  presence, search card open/close, blank-query tab rendering, scoped queries,
  add-chip formation, Settings search, and archive/restore filtering without
  any provider configured.

## 6. Real E2E scenarios and outcomes (§27)

Harness: real Playwright chromium against the acceptance profile
(`dsh-idea-v1-acceptance`, real DeepSeek-V41-Flash route), isolated from prior
storage. Evidence ledger: 170 chronological records; **86 unique checks,
80 PASS**, with the remaining 6 being (a) one deliberate superseded-record
bookkeeping entry, (b) one old-named check superseded by its corrected
re-recording, and (c) four records from two harness-script defects that were
repaired and superseded by clean re-runs (§10). Final states:

| Stage | Scenario | Outcome |
| --- | --- | --- |
| A | Unified assistant action: menu shows 总结/相关 under 保存为 Idea; extraction proposal; save | PASS (10 records) |
| B | Composer search card: open, blank + query views, 添加 chip formation | PASS after `idea/search` cancellation fix |
| C | NS-4471 Idea creation via extraction; exact-version pin decoded from the wire mention | PASS |
| D | Search → 添加 → send: wire POST carries exactly one canonical mention; **decoded pin == the idea's current version**; no model call for Search/添加; no URI before send; chip survives typing; model answers the referenced content (label-stripped check) | PASS — decisive artifacts `75-wire-all-d.json` / `75-wire-posts-d.json` |
| E | 相关 flow: judge returns ≤3 (exactly 1 strong NS-4471 result; weak same-topic not forced); 查看 opens a read-only detail (0 editable fields, 返回列表); 添加 attaches the chip and **sends no prompt** | PASS (12 records; dialog-scoped locators) |
| F | Archive from detail → leaves 当前 list, excluded from composer search, still discoverable via Settings scope `all` with 已归档 label; 恢复 → rediscoverable in composer search | PASS |
| G | Settings search: blank → tabs; mixed query → one list with status labels; clearing restores the prior tab | PASS (6 records) |
| H | Reference survives reload (final clean run `e2e-fh3.mjs`, **13/13 PASS**): A-idea chip added in a fresh session → page reload → the persisted draft carries the canonical mention **text** `@[label](dsh-idea:…)` whose decoded pin is the exact current version (`def560a7/89dd470f`) → composer holds the intact mention + question pre-send → wire POST carries exactly one mention whose decoded pin **equals the pinned current version** → the model answers the three archived-item categories from the referenced content → no raw `dsh-idea:` URI outside the canonical mention protocol → zero console/page errors | PASS — decisive artifact `77-wire-posts-h3.json` |

**Known limitation (disclosed, not a defect against §22)**: after a page
reload the persisted draft seeds as **plain text** (host
`SessionInputShell.setDraft` persistence projection per the input codec
contract "copy/cut/persistence"), so the composer shows the canonical mention
text rather than a re-decorated chip (`data-composer-chip` count = 0 after
reload). The **semantic requirements of §22 are met and proven**: the mention
text survives the remount/reload path, the submit serializer still serializes
the canonical mention, and the wire pin resolves to the exact version (H3
artifacts). Re-decorating restored drafts would require modifying the Harness
conversation input facade (plain-text seed path / restore-parse hook), which
is Harness-core work outside T9's allowed boundary.

## 7. Real provider call disclosure

- Real model calls ran on the **DeepSeek-V41-Flash** route via the dedicated
  acceptance profile. Real (billable) calls occurred only for: assistant
  discussion turns; the 总结 extraction proposals (stages A/C); and the 相关
  judge calls (stage E). **Search (`idea/search`) and 添加 never made a model
  call** — asserted in E2E by zero prompt/model traffic around those
  interactions (timestamp-filtered HTTP capture), and by architecture (lexical
  ranking only).
- Stage D/E/H answer turns confirm the recall path is content-driven (answers
  quote referenced content absent from the question text).

## 8. Browser console / page / network results

- Final E2E stages (B–H, incl. the H3 re-run): **zero console errors, zero
  page errors, zero failed requests** on every stage's closing check.
- During diagnosis (before fixes) the search-card failure surfaced as a
  caught client error (see §9, defect 4); after the fix it no longer occurs.

## 9. Defects found during E2E and how they were repaired

Product/code defects (all fixed at `T9_TESTED_SHA`):

1. **`idea/search` rejected the carrier signal** (`client api: idea/search
   expected 1 argument(s), got 2` → card showed 搜索失败). The host verb
   lacked the gateway cancellation declaration. Fix: trailing
   `signal?: AbortSignal` parameter + pre-aborted `gateway/cancelled` guard;
   typert regenerated; both bundles rebuilt; cancellation contract test
   updated (`tests/remote-service.spec.ts` now asserts search is cancellable);
   §26 re-run 18/18; affected E2E stages re-run green.
2. **Reference barrel default-export mismatch** — client imports of the
   reference module resolved the default export; corrected the barrel shape.
3. **Missing client inject declarations** (`commandUi`, `inputTriggers`,
   `conversation`) — registered in the client contribution and pinned by
   `package.spec.ts`.
4. **Identity-preserving mention rewrite + `MENTION_PATTERN` /
   `isBlankQuery` / `SYSTEM_PROMPT` exports** — pre-step rewrite no longer
   mutates the mention payload; shared predicates exported for Search/Related
   parity (unit-pinned).

Harness-script (test-rig) defects found and repaired — none of these are
product defects; each was superseded by a clean re-run recorded in the
ledger:

5. `composer.fill()` destroyed the decorator chip (stage D false start) —
   replaced with click + `keyboard.insertText` and a chip-count pre-send
   assertion.
6. WebSocket/HTTP capture attached after `goto` missed boot-time frames —
   capture moved before navigation; timestamp-filtered analysis instead of
   frozen snapshots.
7. Chat-text checks contaminated by sidebar session titles — body-vs-aside
   text isolation and label-stripped marker checks.
8. Stage E locators matched background buttons behind the modal mask — all
   overlay interactions scoped to the `关联 Idea` dialog.
9. **FH/FH2 anomalies fully root-caused as rig defects**: (a) the search query
   存档匣 matched both Ideas and the first-row click could select NS-4471
   instead of the A-idea — FH3 selects the row by full title; (b) after a
   reload the plain-text mention has no decorator block, so the rig's
   caret-then-insert spliced the question **into the base64 URI** (wire URI
   truncated; two H checks failed and one decode record crashed) — FH3 moves
   the caret to the composer end (`Control+End`) before inserting and asserts
   mention integrity pre-send. FH3 then passed 13/13 with an intact wire pin.

## 10. Post-E2E executable drift

**None.** The last executable change (the `idea/search` cancellation fix) was
followed by: full offline gate re-run (§4), §26 smoke re-run (18/18), and the
final E2E stages (D re-verification, E–H including H3). The only commits after
`T9_TESTED_SHA` are the two documentation-only commits named in §1 (`ac178e1`
and `943dce5` — this report and the pending instruction documents), proven by
the diff touching only `docs/`. (The T9R repair round later superseded
`4e220714` as the accepted executable baseline; see §14 — that round produced
its own executable commit and its own documentation-only chain.)

## 11. Runtime cleanup record (§28)

- Acceptance servers killed after use (PID-verified by command line before
  termination; the re-run acceptance server on :3080 was killed and the port
  confirmed closed). Zero `bin.ts` node processes remain.
- Zero `ms-playwright` chromium processes remain (the rig closes its own
  browsers; the user's own Chrome windows were never touched).
- Token-bearing files deleted: `acceptance-server.log`,
  `acceptance-server2.log`, `offline-server.log`, `url.txt`,
  `offline-url.txt`, `server.log`, `22-console.log`. Final
  `grep -rl "token="` over the smoke directory: clean.
- Evidence artifacts (YAML accessibility snapshots, wire-post captures,
  DOM/JSON artifacts, the 170-record ledger `e2e-results.jsonl`) are retained
  under the temp smoke directory for review.

## 12. Non-goals respected (§31)

No proactive resurfacing or background scanning; no auto-Save / auto-Add; no
embeddings / BM25 (lexical scoring reuses the existing T7 weights); no Idea
Graph, tags, merge, or cross-idea links; no PAH / Memory / Knowledge
integration; no full-history search; archived Ideas are excluded from composer
search discovery (visible only in Settings scope `all`); no lifecycle actions
in the Related view; no second Discuss surface; no Harness-core patches; no
schema change or migration; Search remained a lexical read and Related kept
its judge semantics (not reduced to pure similarity). §32 stop conditions:
none triggered.

## 13. Verdict

T9 is accepted at `T9_TESTED_SHA`
(`4e220714de10f15822e2a934d8e6ed1429486e54`) with the disclosed reload
re-decoration limitation (§6), which is a host-persistence design property
explicitly outside the plugin's allowed modification boundary, and whose
semantic bar §22 requires is proven by wire evidence.

## 14. T9R repair round — reference admission and Search Add (supersession)

Per `docs/implements/DSH_IDEA_T9R_REFERENCE_ADMISSION_AND_SEARCH_ADD_REPAIR.md`,
the T9R round repaired four reference-admission defects found in T9. This
section supersedes §13: the accepted executable baseline for the T9 scope is
no longer `4e220714` but `T9R_TESTED_SHA`
(`47b1894f19ad1b7969f3f82cb58f73e02a3f36fa`, `fix: harden idea reference
admission`). T9's history and evidence above are preserved unchanged; every
§4–§13 record remains a true statement about `4e220714`.

| Item | Value |
| --- | --- |
| `T9R_BASELINE_SHA` | `943dce5be7412c34f924efda810e464ddb6379ee` — `origin/main` at round start |
| `T9R_TESTED_SHA` | `47b1894f19ad1b7969f3f82cb58f73e02a3f36fa` — `fix: harden idea reference admission` |
| `T9R_ACCEPTANCE_SHA` | the documentation-only commit that carries this section (SHA in git history and the execution report; diff `T9R_TESTED_SHA..T9R_ACCEPTANCE_SHA` touches only `docs/`) |
| Harness read-only SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` (unchanged) |

### 14.1 The four repairs (R1–R4)

- **R1 — Search Add failure keeps the card open**: `attachReference` returns
  `boolean`; the search card closes only after a successful append. A CAS
  failure keeps the card open with one bounded localized failure notice (and
  performs no submit); a missing seam keeps the card open with the composer
  untouched and no notice. The Related overlay's 添加 keeps its T9 semantics
  (chip appended, overlay state free, status stays ready) and is covered by
  the same deterministic client tests.
- **R2 — over-limit reject, never silent truncation**: after dedup by
  `(ideaId, versionId)`, more than `MAX_IDEA_REFERENCES` (5) unique pins
  reject the request at the pre-step before any model call — zero model
  requests, zero partial recall context. Duplicate exact pins count once.
- **R3 — malformed empty reference rejected**: `MENTION_PATTERN` now matches
  an empty payload (`dsh-idea:[^\s)]*`), so an explicit `@[X](dsh-idea:)`
  mention reaches the canonical decoder and throws instead of surviving as
  prose; `decodeIdeaReferenceUri()` stays the single canonical validator, and
  prose that merely contains the scheme stays prose.
- **R4 — Host-authoritative rewrite of every occurrence**: after resolution,
  every parsed occurrence of an admitted pin is rewritten to the Host-resolved
  exact-version title, so two mentions of one pin under different labels
  produce one projection and zero raw mentions. Client labels remain
  presentation-only.

### 14.2 T9R evidence

- **Offline gates** at `T9R_TESTED_SHA`: `generate:typert` (no drift),
  `typecheck` (clean), `build` + `build:client` (clean), `git diff --check`
  (clean), full test suite **499 passed / 34 files** (12 new tests across
  `reference-uri.spec.ts`, `reference-service.spec.ts`, and a new
  `client.spec.tsx` reference-add-close-semantics suite with the integration
  seam: success closes, CAS failure opens + one notice + no submit, missing
  seam opens + composer untouched, Related failure opens + status ready).
- **Zero-provider smoke** (§26 equivalent) re-run fresh in an isolated
  providerless home: 10/10 records (boot, +→Idea opens the search card, blank
  recency, explicit query, close, Settings Ideas search box/list, zero
  console/page errors, zero failed requests).
- **Full Playwright A–H** on a fresh isolated acceptance home (fresh profile
  copy, seeded workspace table, empty Idea storage; real DeepSeek route):
  stages A (10), B (7), C (6), D (12), E (12), F1+F2 archive/restore (11),
  G (6), H (13) — 77 records, zero failures
  (`e2e-results-t9r-final.jsonl`). Stages A/C created both Ideas with NEW
  ids, and stages D/H proved the exact-version pin on the wire against those
  newly discovered ids (D: pin `846b01c4/0ae242fd` = current version of the
  NS-4471 idea; H: reload-persisted draft mention and post-reload wire pin
  `ff84daa0/931b471f` = current version of the A idea). R1's browser-side
  rejection proof is covered authoritatively by the deterministic client
  tests (the real-browser CAS failure would be artificial); the browser
  Search success path is proven by stages B/D.
- **Architecture unchanged**: Search/Add/Reference still make zero LLM calls;
  no ranking/weights/limits/retrieval/judge/save/lifecycle/domain/
  continuation/payload-budget changes; no Harness-core or schema changes
  (domain `idea/v3`, storage untouched).
- **Runtime cleanup**: acceptance server killed by PID, port 3080 confirmed
  closed, zero `bin.ts` nodes, zero `ms-playwright` chromium processes, user
  Chrome untouched; token-bearing logs and the isolated home deleted; final
  token grep clean.

### 14.3 Wording corrections to this report (§6 of the T9R instructions)

The T9 text above described missing/deleted pins as degrading to a "marked
unavailable note". That was wrong at `4e220714` and is wrong now: pins to
missing or deleted ideas/versions **reject loudly before any model request**
(§2.2 and the projection-tests paragraph have been corrected in place). The
post-tested commit chain was also corrected in §1 and §10: T9's docs landed
as **two** commits (`ac178e1`, `943dce5`), not one.

### 14.4 Verdict (T9R)

T9 scope is accepted at `T9R_TESTED_SHA`
(`47b1894f19ad1b7969f3f82cb58f73e02a3f36fa`), which supersedes `4e220714` as
the accepted executable baseline; the acceptance commit chain remains
documentation-only after it.

## 15. T9R2 repair round — UI consistency and detail readability (pending architecture review)

Per `DSH_IDEA_T9R2_UI_CONSISTENCY_AND_DETAIL_READABILITY_REPAIR`, the T9R2
round repaired eight UI defects (R1–R8) found in the delivered T9/T9R Ideas
UI during acceptance review. This is **not** a new feature phase and **not**
T10; it touches only presentation and shell-integration glue inside the
already-delivered T9 Ideas surfaces. This section records the T9R2 round but
**does not re-freeze T9** — the round ends `READY_FOR_REVIEW` and waits for
architecture review.

| Item | Value |
| --- | --- |
| `T9R2_BASELINE_SHA` | `c11fd57bd204412451b52c16f827ad20b34149ea` — `origin/main` at round start (T9/T9R accepted state) |
| `T9R2_TESTED_SHA` | `25db48c954bcc87b58b665a6ac5dbb0224f8beee` — `fix: repair idea UI consistency and detail readability (T9R2)` |
| `T9R2_ACCEPTANCE_SHA` | the documentation-only commit that carries this section (SHA in git history and the execution report; diff `T9R2_TESTED_SHA..T9R2_ACCEPTANCE_SHA` touches only `docs/`) |
| Harness read-only SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` (unchanged) |
| Domain version | `idea/v3` (unchanged; no schema, storage, or migration change) |

### 15.1 The eight repairs (R1–R8)

- **R1 — conversation Idea action icon**: the assistant Idea action button
  previously reused a sun/brightness glyph; it now renders a semantically
  correct lightbulb.
- **R2 — consistent Settings nav glyph**: the Settings Ideas nav row uses the
  **same shared icon source** — `src/client/icons.tsx` defines the lightbulb
  geometry once (`IDEA_BULB_GLASS_PATH` + `IDEA_BULB_BASE_PATH`) and exports
  both the React component (`IdeaLightbulbIcon`, used by the conversation
  action and the `idea` command) and a DOM twin (`ideaLightbulbSvgElement`,
  tagged `data-dsh-idea-icon="bulb"`, used by the nav adapter
  `src/client/nav-icon.ts`, a MutationObserver that swaps only the exact-label
  Ideas row and re-applies after shell re-renders). No second icon definition
  exists.
- **R3 — idle search border**: the Ideas library search box now has a visible
  idle border (`1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.35))`,
  focus deepens to l4); focus is no longer the only way to see the border.
- **R4 — hover preview readability**: the Idea item hover preview card is
  theme-aware — light surface (`var(--dsw-alias-bg-layer-1, #fff)` + l2
  border + lv3 shadow) in the light theme, dark override kept under
  `body[data-ds-dark-theme]`. Preview content semantics unchanged.
- **R5 — compact back button**: the detail 返回列表 button sits in a
  left-aligned flex row (`.dsh-idea-back-row`) and keeps its natural width
  instead of stretching across the content area.
- **R6 — action labels**: `继续讨论`→`讨论`, `永久删除`→`删除`; `编辑` and
  `归档` unchanged. Display strings only — underlying action semantics,
  and the §14-frozen delete-confirmation copy (`永久删除 Idea？` /
  `永久删除`), are untouched.
- **R7 — Settings re-entry reset**: entering a detail, switching to another
  Settings section, and re-entering Ideas now lands on the initial list
  (the section re-mounts and resets the read state on mount); the in-page
  list → detail → back flow is unaffected.
- **R8 — lightweight detail sections**: each detail field (核心想法 /
  为什么值得保留 / 当前结论 / 可能价值 / 适用场景 / 待解决问题) renders in a
  restrained bordered card (l3 border, 10px radius, light padding, stable
  spacing). Field order, semantics, saved data, and the domain/schema are
  unchanged.

### 15.2 T9R2 scope freeze

No Search ranking/weights/result semantics, Related retrieval/judge
semantics, reference admission/exact-version semantics, Save Idea behavior,
evolution/continuation semantics, lifecycle/archive/restore/delete
semantics, storage schema, or domain version changed; no Harness-core, PAH,
Memory, or Knowledge changes; no new features. `generate:typert` produced
**zero diff** (no schema drift).

### 15.3 T9R2 evidence

- **Offline gates** at `T9R2_TESTED_SHA`: `generate:typert` (no drift),
  `typecheck` (clean), `build` + `build:client` (clean), `git diff --check`
  (clean), full test suite **516 passed** (17 new tests in
  `tests/client-t9r2.spec.tsx` plus R6 label fallout updates in the
  continue/evolution/lifecycle suites that preserve the frozen dialog copy).
- **Isolated Playwright UI acceptance** (light theme, isolated `DSH_HOME`
  with two seeded idea records and one deterministic model turn to
  materialize an assistant message; real Harness shell at the read-only SHA;
  24/24 records PASS, zero console/page errors, zero failed requests):
  - R1: action svg has exactly the shared glass+base paths, no circle/sun
    glyph.
  - R2: Ideas nav row svg tagged `bulb`, same glass geometry, `width=16`.
  - R3: idle border computed `1px solid rgba(0, 0, 0, 0.12)` (non-
    transparent); focus deepens.
  - R4: hover card computed `background rgb(255, 255, 255)`, border
    `rgba(0, 0, 0, 0.1)`; title `rgb(15, 17, 21)` and core `rgb(97, 102,
    107)` — dark-on-light by luminance, readable; card dismisses on unhover.
  - R5: back button 86px wide inside a 564px library, left offset 0px.
  - R6: action buttons read `编辑 | 讨论 | 归档 | 删除`; no `继续讨论` /
    `永久删除` on any action button.
  - R8: exactly six field cards in canonical order, all seeded field strings
    render, and the preview card never uses the detail card class.
  - R7: after switching to 模型 and back, Ideas lands on the list (2 rows),
    previous detail gone; in-page list → detail → back still works.
  - Zero console/page errors; zero failed requests.
- **Runtime cleanup**: acceptance server killed by PID, port 3080 confirmed
  closed, zero `bin.ts` nodes, zero `ms-playwright` chromium processes; the
  token-bearing log/url files and the whole isolated home were deleted.

### 15.4 Disclosure (R4-same-class observation)

The composer's Idea search card (`.dsh-idea-search`, opened from the
composer command menu) still uses a fixed dark surface (`#2C2C2E`) that does
not adapt to the light theme — computed `background rgb(44, 44, 46)` under
the light theme in the same acceptance run. This is the same defect class R4
fixes for the hover preview card, but the composer search card is T9 Search
surface whose styling was not listed in the R1–R8 scope, so T9R2 leaves it
untouched under the scope freeze and discloses it here for architecture
review.

### 15.5 Verdict (T9R2)

T9R2 is `READY_FOR_REVIEW` at `T9R2_TESTED_SHA`
(`25db48c954bcc87b58b665a6ac5dbb0224f8beee`). This round does **not**
re-freeze T9 and does not constitute a T10 start; T9's acceptance status
remains as recorded in §14 pending architecture review of this report.

## 16. T9R3 repair round — composer search card theme readability (accepted)

Per `DSH_IDEA_T9R3_SEARCH_CARD_THEME_READABILITY_REPAIR`, the T9R3 round
repairs exactly the defect disclosed in §15.4: the composer Idea search card
(`.dsh-idea-search`) kept a fixed `#2C2C2E` surface while its title/input/
result text uses the current theme's label tokens — in the light theme those
tokens are dark, producing a real dark-on-dark readability defect. This is
**not** a new feature phase and **not** T10. This section supersedes §15:
the accepted executable candidate for the T9 scope is no longer
`T9R2_TESTED_SHA` but `T9R3_TESTED_SHA` (`4645121`). T9/T9R/T9R2 history and
evidence above are preserved unchanged; every §1–§15 record remains a true
statement about its own SHA. The round ends `READY_FOR_REVIEW` and waits for
architecture review — the final re-freeze is not declared executor-side.

| Item | Value |
| --- | --- |
| `T9R3_BASELINE_SHA` | `1ecb643d94fe9050eaa4a170cb9c7f7290f798e8` — `origin/main` at round start (T9R2 accepted state) |
| `T9R3_TESTED_SHA` | `46451213641bf5beb6657b259f6033183ba23059` — `fix: make the idea search card follow the theme (T9R3)` |
| `T9R3_ACCEPTANCE_SHA` | the documentation-only commit that carries this section (SHA in git history and the execution report; diff `T9R3_TESTED_SHA..T9R3_ACCEPTANCE_SHA` touches only `docs/`) |
| Harness read-only SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` (unchanged) |
| Domain version | `idea/v3` (unchanged; no schema, storage, or migration change) |

### 16.1 The repair

`.dsh-idea-search` replaces its fixed `background: #2C2C2E` with the **same
theme-aware surface as the T9R2 R4 hover preview card**: light theme uses
`var(--dsw-alias-bg-layer-1, #fff)` plus a light idle border
(`1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1))`), and the dark
theme keeps its dark surface via `body[data-ds-dark-theme] .dsh-idea-search
{ border-color: transparent; background: #2C2C2E; }` — the same override
pattern §15 introduced, so the token source is shared and deterministic.
No size, search flow, Add behavior, ranking, result semantics, or
product-semantic change; the card is not redesigned.

### 16.2 T9R3 scope freeze

No Search ranking/weights/result-limit semantics, Search request semantics,
Add/reference semantics, Related, Save, lifecycle, exact-version reference,
storage/schema/domain, or the accepted R1–R8 logic changed; no Harness-core,
PAH, Memory, or Knowledge changes; no new features. `generate:typert`
produced **zero diff** (no schema drift).

### 16.3 T9R3 evidence

- **Offline gates** at `T9R3_TESTED_SHA`: `generate:typert` (no drift),
  `typecheck` (clean), `build` + `build:client` (clean), `git diff --check`
  (clean), full test suite **521 passed / 36 files** (5 new source-level
  stylesheet tests in `tests/client-t9r3.spec.tsx`: light surface is the
  theme alias and not fixed dark, light idle border from the l2 alias, dark
  override keeps `#2C2C2E` with a transparent border, token source identical
  to the R4 hover card with exactly the two `body[data-ds-dark-theme]`
  rules, and geometry/behavior-bearing properties unchanged).
- **Isolated Playwright UI acceptance** (isolated `DSH_HOME`, two seeded
  idea records, zero model calls; real Harness shell at the read-only SHA;
  **22/22 records PASS**, zero console/page errors, zero failed requests).
  The dark leg is switched through the **real Settings 外观 深色 control**
  (not a synthetic attribute write), and the preference is restored to 浅色
  at the end:
  - Light: card `background rgb(255, 255, 255)` (no longer fixed dark),
    border `1px solid rgba(0, 0, 0, 0.1)`; title/input/result
    `rgb(15, 17, 21)` and core `rgb(97, 102, 107)` — dark-on-light by
    luminance, readable; empty state `rgb(129, 133, 140)` readable.
  - Light behavior: search input filters to the matching seeded idea
    (1 row); row click selects, 添加 appends the reference chip
    (`span[data-composer-chip="idea"]`, composer text `@T9R3A 搜索卡片
    主题`) and closes the card — Add semantics unchanged.
  - Dark: card keeps `background rgb(44, 44, 46)` = `#2C2C2E` with a
    transparent border (no light ring); title/input/result
    `rgb(249, 250, 251)` and core `rgb(207, 211, 214)` — light-on-dark,
    readable; empty state `rgb(173, 178, 184)` readable; search input still
    filters; the card closes via the close button.
  - Zero console/page errors; zero failed requests.
  - Playwright MCP (user-scope, connected in this session) was used for
    auxiliary visual inspection only; all formal evidence comes from the
    repeatable rig. No repository dependency was changed for MCP.
- **Runtime cleanup**: acceptance server killed by PID, port 3080 confirmed
  closed, zero `bin.ts` nodes, zero `ms-playwright` chromium processes; the
  token-bearing log/url files and the whole isolated home were deleted, and
  the MCP probe artifacts (screenshot, snapshot dir) were removed from the
  repository root.

### 16.4 Verdict (T9R3) — `DSH_IDEA_T9R3_ACCEPTED` / `DSH_IDEA_T9_REFROZEN`

The §15.4 disclosure is resolved: the composer Idea search card now follows
the theme in both palettes with readable text. T9R3 passed architecture
review, and this finalization converges the round's `READY_FOR_REVIEW`
status into the accepted/refrozen verdict below. This finalization is
documentation-only: it modifies no executable file, re-runs no acceptance,
re-interprets no test result, and leaves every §1–§16.3 record above
unchanged as the historical evidence of its own SHA.

| Item | Value |
| --- | --- |
| Final status | `DSH_IDEA_T9R3_ACCEPTED` / `DSH_IDEA_T9_REFROZEN` |
| `T9_ACCEPTED_EXECUTABLE_SHA` | `46451213641bf5beb6657b259f6033183ba23059` — `fix: make the idea search card follow the theme (T9R3)` (supersedes `T9R2_TESTED_SHA` `25db48c` as the accepted executable; every earlier §1–§15 record remains a true statement about its own SHA) |
| `T9R3_EXECUTION_ACCEPTANCE_SHA` | `e725eb29a06512113209aa9eb588802517bac690` — `docs: record dsh-idea t9r3 acceptance` (the docs-only commit that recorded the T9R3 round) |
| `FINAL_ACCEPTANCE_SHA` | this documentation-only finalization commit (SHA in git history and the execution report; the diff `T9_ACCEPTED_EXECUTABLE_SHA..HEAD` touches only `docs/`) |
| `HARNESS_SHA` | `c291e7961a515f6d7af9304e7fd1d257929aef26` (unchanged) |
| `DOMAIN` | `idea/v3` |
| `POST_TESTED_EXECUTABLE_DRIFT` | `NONE` (every commit after the accepted executable SHA is docs-only) |
| `T9R4_REQUIRED` | `NO` |

T9 is re-frozen at the accepted executable SHA above; no further repair
round is required, and T10 is not started here.
