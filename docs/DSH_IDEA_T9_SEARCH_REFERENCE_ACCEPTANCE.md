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
| `T9_REPORT_SHA` | this documentation-only commit (recorded below; the only commit after `T9_TESTED_SHA`) |
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
  current at read time. Pins to missing ideas/versions degrade to a marked
  unavailable note, never to a silent substitution.
- **Search/Related shared reference behavior (§13)**: the composer search
  card's 添加 and the Related overlay's 添加 both go through the same
  reference-append seam (`src/client/reference-append.ts`) and produce the
  same canonical chip from the same `ideaReferenceDescriptor` — one reference
  protocol everywhere; neither path sends a prompt by itself.
- **Projection tests** (`tests/reference-projection.spec.ts`,
  `tests/reference-uri.spec.ts`, `tests/reference-service.spec.ts`) pin the
  codec round-trip, label escaping, pre-step boundaries (non-user messages
  ignored), exact-version recall, and degradation marking.

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
`T9_TESTED_SHA` are documentation-only (this report and the pending
instruction documents), proven by the diff between the two SHAs touching only
`docs/`.

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
