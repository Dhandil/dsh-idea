# DSH Idea T8 — Library UX and Lifecycle Acceptance Report

Final acceptance record for the `dsh-idea` external Harness plugin, T8 scope
(library lifecycle UX: tabs, hover preview, manual edit, archive / restore /
permanent delete, related-ideas lifecycle filtering).

## 1. Frozen identities

| Item | Value |
| --- | --- |
| `T8_TESTED_SHA` | `4389b0d7b76aaac39fbe13d55863039f51871ca3` — `fix: lift the idea hover card above the settings modal mask` |
| Preceding feature commit | `7da8da81c4803953022f087d5450c00e0e4cf010` — `feat: refine idea library lifecycle` |
| Harness read-only baseline SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| Repository | `Dhandil/dsh-idea` (public), branch `main` |
| Domain name | `idea` (`packages/dsh-idea/src/spec.ts`) |
| Domain version | **3** (unchanged by T8; no schema change) |
| Storage layout | `per-record`; tables `ideas`, `discussions` |

`T8_TESTED_SHA` is the executable candidate that produced every result below.
No executable file changed after the E2E run recorded here; the only commit that
follows it is this documentation-only report.

## 2. What T8 shipped

- **Library rows (§2)**: rows carry only title + one-line core + updated time;
  `[当前]` / `[已归档]` tabs as Harness `Pill`s (current = active + dormant,
  archived = archived only); no deleted view; switching is read-only.
- **Hover preview (§3)**: bounded projection card (title, core, current
  conclusion when non-empty, up to three use-when entries, open-question
  count, updated time) with a genuinely clickable `[编辑]` quick action and no
  Permanent Delete. See §6: real testing forced the §3 fallback to a
  feature-owned anchored card; Harness itself was never patched.
- **Manual edit (§5–8)**: exactly the seven IdeaDraft fields; Cancel is
  zero-write; Save appends one version (`reason=manual-edit`,
  `sourceDiscussionIds=[]`, one evolution event from→to, `updatedAt` = commit
  time); a normalized no-op is 0 writes / 0 versions / 0 events with
  `updatedAt` unchanged (client disables Save **and** the domain defends
  independently); concurrency via `expectedCurrentVersionId` (conflict → zero
  writes, edits stay visible); archived rejects.
- **Archive / restore (§9–11)**: status + `updatedAt` only — no version, no
  event; idempotent at the expected version; dormant semantics untouched.
- **Permanent delete (§12–16)**: removes aggregate + versions + snapshots +
  events + discussion bindings; no deleted state, tombstone or trash; Harness
  conversations are never erased; exact `RiskConfirmation` copy
  (永久删除 Idea？…已有 Harness 对话不会被删除。此操作无法恢复。+ acknowledgement
  checkbox gating 永久删除); detail-only; ordering guard → verify → delete
  discussions first → aggregate last → guard released in `finally`; a
  process-local guard rejects competing mutations with `deleting`.
- **Remote API (§17–18)**: `IdeaListRequest {view}` partitioning,
  `IdeaManualEditRequest` with canonical `IdeaManualEditResult` (`committed`
  flag), `IdeaArchiveRequest` / `IdeaRestoreRequest` / `IdeaDeleteRequest`,
  minimum-field list rows, dedicated stable `idea/*` wire errors
  (`idea/archived`, `idea/version-conflict`, `idea/not-found`,
  `idea/invalid-draft`).
- **Related ideas (§19)**: lifecycle filtering only — archived ideas no longer
  surface as related; verified by tests.
- **Client state (§20–22)**: per-view load states, edit/delete state machines,
  stale async never cross-applies, archive/restore never optimistic, failures
  keep the visible surface (error copy stays; retry keeps the still-valid
  expected version).

## 3. Automated tests, static and build gates

Run in `packages/dsh-idea` at `T8_TESTED_SHA`:

| Gate | Command | Result |
| --- | --- | --- |
| Typert generation | `pnpm generate:typert` | pass (host + remote client regenerated) |
| Type check | `pnpm typecheck` | pass (`tsc --noEmit`) |
| Server build | `pnpm build` | pass |
| Client build | `pnpm build:client` | pass (before the test gate) |
| Whitespace | `git diff --check` | pass |
| Unit/integration suite | `pnpm test` | **382 tests / 27 files passed** |

The suite is fully offline: no real provider, network or model call. T8 added
three spec files — `tests/lifecycle.spec.ts` (domain lifecycle), 
`tests/remote-lifecycle.spec.ts` (wire lifecycle), `tests/client-lifecycle.spec.tsx`
(tabs, hover preview, editor, archive/restore, delete) — and grew the read /
package suites for the new descriptors and `status`-carrying projections. New
coverage includes byte-level zero-write proofs (`storedBytes`), the no-op
manual edit, idempotent archive/restore, stale-expectation zero-destructive-work
checks, the synchronous `deleting`-guard rejection of five competing mutations,
and wire-projection leakage checks.

## 4. Real zero-provider runtime smoke

Run at `T8_TESTED_SHA` in a separate isolated home/profile containing **no
credentials, no API key and no provider** (profile `dsh-idea-v1-offline`,
bundle list `dsh-base + dsh-web-app + dsh-idea` only):

- boot: ready marker present; browser opened 设置 → Ideas;
- the two lifecycle tabs rendered (`当前` / `已归档`), no `已删除` tab exists;
- both views showed their empty state (`还没有保存的 Idea…` / `暂无已归档的
  Idea…`), 0 rows each; switching back to 当前 did not refetch the ready view;
- observed activity: `0` model requests, `0` console errors, `0` page errors,
  `0` failed requests; server-side log checked — no model/provider activity.

Result: `ZERO_PROVIDER_SMOKE_PASS`.

## 5. Real-browser / real-model product E2E (§29 A–G)

| Item | Value |
| --- | --- |
| Driver | Claude Code → Playwright → Chromium (headless) |
| Target | real Harness `localhost` web app |
| Real E2E profile | `dsh-idea-v1-acceptance` in an isolated `DSH_HOME` |
| Model route | `deepseek-official` / `deepseek-v4-flash` (asserted in-UI) |
| Marker | `DSH_IDEA_T8_E2E_2026A1` |
| Storage | fresh isolated acceptance storage reset before the run (server stopped, then sessions / idea storages / workspace store wiped and reseeded) |

Isolation: the E2E used only its isolated home and did **not** use or modify the
user's normal profile; the unrelated plugins (`dsh-better-sidebar`,
`dsh-memory-evolve`, `dsh-super-injector`) were not touched. Temporary E2E
files, browser profiles and auth state live outside the repository and are
**not** committed.

### Scenario results

| # | Scenario | Result |
| --- | --- | --- |
| A | Baseline idea: real conversation → finalized answer → 💡 → extraction → save; library row shows only title / one-line core / 更新于 (no 创建于 / 来源 / conclusion — §2 minimum fields) | **PASS** |
| B | Hover preview: bounded card (title, core, use-when entries ≤ 3, 待解决问题 count, 更新于), no Permanent Delete in the card, and the card's 编辑 quick action opens the editor without row navigation; after the manual edit the card's conclusion line updates | **PASS** |
| C | Manual edit: ≥ 2 fields (title + current conclusion); Save disabled before any edit; v1 kept (初次保存, original title) + v2 appended (手动修改, edited title) shown as 当前版本 v2; content persisted across a full reload | **PASS** |
| D | Archive: detail flips to 已归档 with only 恢复 / 永久删除 (no 编辑 / 继续讨论 / 归档 / 生成演化提案); the row leaves 当前 (empty state) and appears under 已归档 | **PASS** |
| E | Restore: archived detail offers no Edit/Continue; 恢复 returns the idea to 当前; 已归档 becomes empty | **PASS** |
| F | Continue-discussion regression (host-authoritative): the Host created exactly **one** new workspace-attached session (`session-3c52dcf6-…`, verified against the workspace store and the opened URL); the real model answered the frozen-seed marker `DSH_IDEA_T8_E2E_2026A1` | **PASS** |
| G | Permanent delete: exact dialog copy (将永久删除该 Idea、所有版本… 已有 Harness 对话不会被删除。此操作无法恢复。); 永久删除 disabled before the acknowledgement checkbox; 取消 = zero mutation (idea still present); after confirmation the idea is absent from both views, and **both** Harness conversations (original + continuation) survive — workspace store keeps both session ids and both conversations still render their content | **PASS** |

### Browser console / network

`consoleErrors: []`, `pageErrors: []`, `failedRequests: []` — an entirely clean
final run across all scenarios.

### Execution notes (§31: one product repair, driver-only repeats disclosed)

1. **Run 1** (at `7da8da8`) — scenario B failed: the hover card's 编辑 button
   could not be clicked. **Real product defect** (see §6), repaired in
   `4389b0d`; all gates and tests re-run; the final runs executed at
   `4389b0d`.
2. **Run 2** — driver only: `openLibrary()` pressed the 设置 trigger while the
   settings dialog was already open (its own mask blocks the trigger). Driver
   made idempotent.
3. **Run 3** — environment only: the acceptance storage had been reset while
   the server was still running, so the server's in-memory state re-persisted
   the previous run's idea and the archive check saw a stale row. Correct
   order enforced (stop server → reset → boot).
4. **Run 4** — driver only: an incorrect expectation that an archived row
   carries a status pill; the lifecycle status lives on the tab `Pill`, rows
   keep their minimum fields. Assertion corrected.
5. **Run 5** — driver only: after 取消 the delete dialog lands back on the
   open detail, not the list; the driver now returns to the list before
   asserting zero mutation.
6. **Run 6** — **every scenario passed**; all results above are from that run.

### Real provider call disclosure

The E2E exercised the real `deepseek-official` route for: conversation replies,
Save-Idea extraction, and the continuation seed answer. The key was read from
the user's existing local credentials file into the process environment for the
acceptance boot only. It was **never** printed, echoed, logged, written to a
file, or committed; boot-log output was redacted (`token=REDACTED`) before any
artifact was stored, and the token-bearing boot logs were deleted at cleanup.

## 6. Defect found and repaired during acceptance

**Hover preview unreachable inside the settings modal (`4389b0d`).** The T8
hover card used the Harness `HoverCard` primitive, whose portaled card sits at
`z-index: 100`. The Ideas library lives inside the settings dialog, whose Modal
layer is `z-index: 1000` with a full-viewport mask — so the card rendered
beneath the mask and its quick action could never receive a press (found by the
real-browser run; a human user would hit the same wall). Per the T8 instruction
the Harness checkout was **not** patched; the §3-sanctioned fallback shipped:
a feature-owned anchored hover card (`src/client/hover-card.tsx`) that keeps
the primitive's interaction contract (dwell → open, pointer grace → close,
fixed placement at the anchor's right edge with a bottom clamp, press-on-card
keeps it mounted) but rides at `z-index: 1001`, above the modal mask. Covered
by two new unit tests (portal + clickable quick action; grace close); all
gates, the suite, the zero-provider smoke and every E2E scenario were re-run at
the repaired SHA.

## 7. Harness core unchanged

`git -C <harness-checkout> rev-parse HEAD` =
`c291e7961a515f6d7af9304e7fd1d257929aef26`, identical before and after
acceptance. No tracked file in the Harness checkout was modified; the only
untracked entries are pre-existing T0 investigation scratch files.

## 8. Runtime cleanup record (§30)

- Acceptance and smoke servers stopped; the listening child on `:3080` was
  force-killed and the port verified released (`PORT_3080_RELEASED`).
- The E2E browser is closed by the driver's `finally` block; no headless
  Playwright/Chromium process remains (verified via command-line inspection).
  Unrelated user browser windows were **not** touched.
- Token-bearing temporary boot logs were deleted; redacted evidence
  (snapshots, screenshots, result JSONs) remains outside the repository and is
  not committed.

## 9. Non-goals respected

No PAH / Memory / Knowledge integration, no cross-sync or auto-detection, no
proactive resurfacing, no embeddings, no Idea Graph, no merge/split, no tags or
folders, no collaboration, no deleted list, no auto Project creation, no auto
editing. The dormant status semantics were not redesigned.
