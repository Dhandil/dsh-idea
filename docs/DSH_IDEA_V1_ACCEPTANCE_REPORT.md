# DSH Idea V1 — Product Acceptance Report

Final acceptance record for the `dsh-idea` external Harness plugin, V1 scope.

## 1. Frozen identities

| Item | Value |
| --- | --- |
| `V1_TESTED_SHA` | `abebbd8d933acd2b5115ca38b3787901bfa1c562` — `fix: bind continuation conversation to workspace` |
| Harness read-only baseline SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| Repository | `Dhandil/dsh-idea` (public), branch `main` |
| Domain name | `idea` (`packages/dsh-idea/src/spec.ts`) |
| Domain version | **3** |
| Supported durable versions | **1 / 2 / 3** (`compatibleVersions: [1, 2]`) |
| Storage layout | `per-record`; tables `ideas`, `discussions` |

`V1_TESTED_SHA` is the executable candidate that produced every result below. No
executable file changed after the E2E run recorded here; the only commit that
follows it is this documentation-only report.

## 2. Durability and migration evidence

Version 3 restored the plural `sourceDiscussionIds` citation array. Version 2 had
folded provenance into a single singular field, which silently dropped valid
citations; version 1 stored flat, un-versioned content. Both remain readable and
are migrated non-lossily by the record schema.

Migration is covered by tests in `packages/dsh-idea/tests/schema.spec.ts`:

- legacy flat aggregate → current nested shape;
- legacy multi-version history → per-version reasons plus a linked event chain;
- legacy document violating model invariants is still rejected (migration never
  launders invalid data);
- singular v2 citation → one-element array; absent v2 citation → empty array;
- v2 draft, reason and events preserved intact through migration;
- a dangling v2 citation fails the domain open **loudly** rather than being
  skipped.

Real durable evidence produced by this acceptance run (`<acceptance-home>/storages/idea/`):

```text
idea_67aa00f2-…json   envelope version 3
  v1  reason=initial-save          sourceDiscussionIds=['idea_src_62d9857f-…']
  v2  reason=continued-discussion  sourceDiscussionIds=['idea_src_be37ed82-…']
idea_595d583f-…json   envelope version 3
  v1  reason=initial-save          sourceDiscussionIds=['idea_src_17bd2567-…']
```

Each version keeps its **own** citation across an evolution, which is the
behaviour v3 exists to guarantee. The user-edited field edited in the UI
(`possibleValue`) survived both the durable round-trip and the v1→v2 evolution,
and is stored with the run's unique marker.

## 3. Automated tests, static and build gates

Run in `packages/dsh-idea` at `V1_TESTED_SHA` (`pnpm verify`):

| Gate | Command | Result |
| --- | --- | --- |
| Typert generation | `pnpm generate:typert` | pass (host + remote client regenerated) |
| Type check | `pnpm typecheck` | pass (`tsc --noEmit`) |
| Unit/integration suite | `pnpm test` | **326 tests / 24 files passed** |
| Server build | `pnpm build` | pass |
| Client build | `pnpm build:client` | pass (`lib/client.js`, 217.20 kB) |

The suite is fully offline: no real provider, network or model call.

## 4. Real zero-provider runtime smoke

A separate isolated home/profile was used, containing **no credentials, no API
key and no provider in `settings.yaml`**:

- home: `<DSH_HOME>` (fresh, providerless); profile: `dsh-idea-v1-offline`;
- boot log: ready marker present, **zero** errors/warnings during composition;
- browser: opened 设置 → Ideas and asserted the read-only library rendered its
  empty state (`还没有保存的 Idea。…`), 0 rows;
- observed activity: `0` model requests, `0` console errors, `0` page errors,
  `0` failed requests.

Result: `ZERO_PROVIDER_SMOKE_PASS`. The plugin boots and its full read path
(storage → remote → UI) works with no provider configured and no model call.

## 5. Real-browser / real-model product E2E

| Item | Value |
| --- | --- |
| Driver | Claude Code → Playwright → Chromium (no browser extension, no account) |
| Playwright | `1.63.0` |
| Chromium | `153.0.8010.12`, headless |
| Target | real Harness `localhost` web app |
| Real E2E profile | `dsh-idea-v1-acceptance` in an isolated `DSH_HOME` |
| Model route | `deepseek-official` / `deepseek-v4-flash` (asserted in-UI as `DeepSeek-V4-Flash，推理等级 High`) |

Isolation: the acceptance home owns its own `settings.yaml`, profile, workspace
store, sessions and Idea storage. The user's real `~/.dsh` and the unrelated
plugins (`dsh-better-sidebar`, `dsh-memory-evolve`, `dsh-super-injector`) were
not modified. Temporary E2E files, browser profiles and auth state live outside
the repository and are **not** committed.

### Scenario results

| # | Scenario | Result |
| --- | --- | --- |
| A | Save Idea: real conversation → finalized answer → 💡 → extraction → preview → field check → small edit → save → library | **PASS** |
| B | Persistence across a full page reload (idea present, content unchanged) | **PASS** |
| C | Continue seed: the seed question was asked **without** the marker; the real model answered `DSH_IDEA_V1_E2E_T7A916`, and a follow-up core question answered consistently | **PASS** (seed + coherence) |
| D | Evolution: refinement discussion → proposal → preview → field edit → save as new version (v1 untouched, v2 `continued-discussion`) | **PASS** |
| E | Related Ideas: second related idea, third relevant conversation, 关联 Idea → overlay → known idea matched with canonical title/core and a real `为什么现在有用`, within the card cap, close, no auto-injection | **PASS — positive path** |

Supporting assertions from the same run: `relatedPositivePath: true`,
`noAutoInjection: PASS` (the conversation was unchanged after closing the
overlay), `coreAnswerCoherence: PASS`.

### Browser console / network

`consoleErrors: []`, `pageErrors: []`, `failedRequests: []` — an entirely clean
run across all five scenarios.

### Real provider call disclosure

The E2E exercised the real `deepseek-official` route for: conversation replies,
Save-Idea extraction, the continuation seed answer, the evolution proposal, and
the Related-Ideas judgment. The key was read from the user's existing local
credentials file into the process environment for the acceptance boot only. It
was **never** printed, echoed, logged, written to a file, or committed; boot-log
output was redacted (`token=REDACTED`) before being stored.

## 6. Defect found and repaired during acceptance

The first real-browser pass failed at Scenario C: the real model replied "I
received no Idea background". Root cause: Continue Discussion created its
conversation through the Host default (`sessions.create({})`, no workspace), and
in the web UI a conversation without a workspace has a **disabled composer** —
selecting a workspace mid-view spawns a *different* session, so the discussion
binding (and therefore the seed) never reached the model.

Repair (`abebbd8`): the client now prepares the continuation conversation through
the shared workspace navigation (current workspace, else most recent) and the
Host adopts that id unless another discussion already carries it; otherwise it
falls back to the Host-created default. Covered by four new tests (two Remote,
two client). All gates were rerun, the runtime smoke was rerun, and every E2E
scenario was rerun from a clean storage state.

## 7. Harness core unchanged

`git -C <harness-checkout> rev-parse HEAD` = `c291e7961a515f6d7af9304e7fd1d257929aef26`,
identical before and after acceptance. No tracked file in the Harness checkout
was modified; the only untracked entries are pre-existing T0 investigation
scratch files dated 2026-09-15.

## 8. Accepted V1 limitations

- no proactive resurfacing;
- no embeddings / vector DB;
- no Idea Graph;
- no learned recommendation feedback;
- the lexical Top-12 first stage can miss synonym-only candidates once the
  corpus exceeds 12 ideas;
- the V1 UI displays only the primary provenance source, while v3 durability
  preserves every source id;
- no collaboration / cross-user sync;
- no PAH integration.

Additional behaviour observed during acceptance, recorded for transparency
(not regressions):

- the **evolution entry is session-scoped**: reopening an Idea's detail clears
  the discussion binding, and 继续讨论 re-arms it. The Host is idempotent per
  idea + current version, so re-arming reuses the active discussion and creates
  no second conversation.
- the workspace-bound continuation depends on the client workspace navigation;
  a deployment without that domain falls back to the Host default conversation,
  which in the web UI leaves the composer requiring a workspace.
- the composer's accessible label differs between the empty state and an open
  conversation; UI automation must not key on a single variant.

## 9. Environment notes (outside the repository)

- The user's `~/.dsh/settings.yaml` `baseURL` was corrected to the API root
  (`https://openrouter.ai/api/v1`) after diagnosis; the original file was kept
  as a timestamped backup. The earlier value duplicated the `/chat/completions`
  path and produced 404s.
- The OpenRouter route itself was unusable for acceptance because of an
  account-credit limit (402: the request size exceeded the remaining balance).
  This is a user-account condition, not a plugin defect, and was the reason the
  acceptance ran on the isolated `deepseek-official` home instead.
