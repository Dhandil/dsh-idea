# DSH Idea V1 — Product Acceptance Report

Final acceptance record for the `dsh-idea` external Harness plugin, V1 scope.

## 1. Frozen identities

| Item | Value |
| --- | --- |
| `V1_TESTED_SHA` | `048a66bfc2e50ed769f3796fa867e3ee590b734b` — `fix: make continuation workspace host-authoritative` |
| Superseded candidate | `abebbd8d933acd2b5115ca38b3787901bfa1c562` — `fix: bind continuation conversation to workspace` (kept in history; not rewritten) |
| Harness read-only baseline SHA | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| Repository | `Dhandil/dsh-idea` (public), branch `main` |
| Domain name | `idea` (`packages/dsh-idea/src/spec.ts`) |
| Domain version | **3** |
| Supported durable versions | **1 / 2 / 3** (`compatibleVersions: [1, 2]`) |
| Storage layout | `per-record`; tables `ideas`, `discussions` |

`V1_TESTED_SHA` is the executable candidate that produced every result below.
No executable file changed after the E2E run recorded here; the only commit that
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
idea_c2993cee-…json   envelope version 3
  v1  reason=initial-save          sourceDiscussionIds=['idea_src_5321cf6f-…']
  v2  reason=continued-discussion  sourceDiscussionIds=['idea_src_37ac6ca0-…']
idea_1168b2d5-…json   envelope version 3
  v1  reason=initial-save          sourceDiscussionIds=['idea_src_150b8eba-…']
```

Each version keeps its **own** citation across an evolution, which is the
behaviour v3 exists to guarantee. The v2 citation of the first idea carries the
full captured continuation context (the seed marker Q&A and the refinement
exchange) and records the Host-created continuation session
(`session-5da4ce4c-…`) as its origin — durable proof that the frozen seed, not a
caller-named conversation, produced the evolution. The user-edited field edited
in the UI (当前结论) survived both the durable round-trip and the v1→v2
evolution, and is stored with the run's unique marker.

## 3. Automated tests, static and build gates

Run in `packages/dsh-idea` at `V1_TESTED_SHA` (`pnpm verify`):

| Gate | Command | Result |
| --- | --- | --- |
| Typert generation | `pnpm generate:typert` | pass (host + remote client regenerated) |
| Type check | `pnpm typecheck` | pass (`tsc --noEmit`) |
| Unit/integration suite | `pnpm test` | **332 tests / 24 files passed** |
| Server build | `pnpm build` | pass |
| Client build | `pnpm build:client` | pass (`lib/client.js`, 217.44 kB) |

The suite is fully offline: no real provider, network or model call. The count
grows from 326 (superseded candidate) by the six host-authoritative continuation
tests: Remote tests assert the wire carries `workspaceId` and never a
caller-supplied session id, that the Session Controller is called exactly once
with the chosen workspace (or `{}` when none is chosen), that an invalid
workspace fails loudly with **no** discussion/idea write, and that idempotent
reuse creates nothing; client tests pin the pure workspace-selection policy and
the exact request bodies; a bundle assertion proves the web client no longer
references `connectWorkspace`.

## 4. Real zero-provider runtime smoke

Re-run at `V1_TESTED_SHA`. A separate isolated home/profile was used, containing
**no credentials, no API key and no provider in `settings.yaml`**:

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

Isolation: the acceptance E2E itself used only its isolated home — its own
`settings.yaml`, profile, workspace store, sessions and Idea storage — and did
**not** use or modify the user's normal profile. The unrelated plugins
(`dsh-better-sidebar`, `dsh-memory-evolve`, `dsh-super-injector`) were not
modified. (An earlier T7 environment diagnostic had corrected the normal
`~/.dsh/settings.yaml` `baseURL`, with a timestamped backup kept — see §9.)
Temporary E2E files, browser profiles and auth state live outside the repository
and are **not** committed.

### Continuation is host-authoritative (T7R)

The continuation wire request is `{ id, workspaceId? }` — the browser names only
a Workspace, never a Session. The client resolves the workspace purely from its
own snapshot (current session's workspace → most recently updated → none); it no
longer drives `uiWorkspace.connectWorkspace()` and cannot create orphan
sessions. On the Host, `continueDiscussion` creates the conversation through the
Harness Session Controller — `sessions.create({ workspaceId })` when a workspace
was chosen, `sessions.create({})` only when none was — and writes the
Host-returned session id into the IdeaDiscussion. A provided-but-invalid
workspace fails loudly (`idea/conversation-failed`) with no discussion write, no
idea write and no silent fallback. Idempotent reuse per idea + current version,
the exactly-once frozen seed, stale-evolution rejection, domain v3 provenance
and Related Ideas behaviour are unchanged.

### Scenario results

| # | Scenario | Result |
| --- | --- | --- |
| A | Save Idea: real conversation → finalized answer → 💡 → extraction → preview → field check → small edit → save → library | **PASS** |
| B | Persistence across a full page reload (idea present, content unchanged) | **PASS** |
| C | Host-authoritative continuation: the Host created exactly one new workspace session (`session-5da4ce4c-…`, present in the selected workspace's session list); the composer was immediately usable; the seed question contained **no** marker; the real model answered `DSH_IDEA_V1_E2E_T7A916` from the frozen seed; no unrelated session was adopted | **PASS** (seed + coherence + host authority) |
| D | Evolution: refinement discussion → proposal → preview → field edit → save as new version (v1 untouched, v2 `continued-discussion`); re-arming 继续讨论 created **no** additional session (idempotent reuse) | **PASS** |
| E | Related Ideas: second related idea, third relevant conversation, 关联 Idea → overlay → known idea matched with canonical title/core and a real `为什么现在有用`, within the card cap, close, no auto-injection | **PASS — positive path** |

Supporting assertions from the same run: `relatedPositivePath: true`,
`noAutoInjection: PASS` (the conversation was unchanged after closing the
overlay), `coreAnswerCoherence: PASS`.

### Browser console / network

`consoleErrors: []`, `pageErrors: []`, `failedRequests: []` — an entirely clean
run across all five scenarios.

### Execution notes (driver-only fixes, no plugin changes)

The full A–E suite was run repeatedly from a clean isolated acceptance storage;
three earlier attempts failed on **test-driver races**, each fixed in the driver
only (the plugin executable never drifted after `V1_TESTED_SHA`):

1. Attempt 1 — scenario E: a composer re-mount swallowed a fill, so the send
   never landed. The driver now retries the send with delivery confirmation
   (the user bubble must appear).
2. Attempt 2 — scenario E: the driver captured its save-button baseline while
   the previous conversation's view was still mounted, making its completion
   predicate unreachable. The driver now waits for the settled empty-state
   conversation before counting.
3. Attempt 3 — the driver parsed its auth token from a stale boot log after a
   server restart rotated it. The driver now reads the newest boot log.

Attempt 4 passed every scenario end-to-end; all results above are from that run.

### Real provider call disclosure

The E2E exercised the real `deepseek-official` route for: conversation replies,
Save-Idea extraction, the continuation seed answer, the evolution proposal, and
the Related-Ideas judgment. The key was read from the user's existing local
credentials file into the process environment for the acceptance boot only. It
was **never** printed, echoed, logged, written to a file, or committed; boot-log
output was redacted (`token=REDACTED`) before being stored.

## 6. Defects found and repaired during acceptance

**Defect 1 (found at scenario C, repaired in `abebbd8`).** The first real-browser
pass failed at Scenario C: the real model replied "I received no Idea
background". Root cause: Continue Discussion created its conversation through
the Host default (`sessions.create({})`, no workspace), and in the web UI a
conversation without a workspace has a **disabled composer** — selecting a
workspace mid-view spawns a *different* session, so the discussion binding (and
therefore the seed) never reached the model.

**Defect 2 (T7R: trust-boundary repair, `048a66b`).** The `abebbd8` repair still
let the browser drive workspace navigation (`uiWorkspace.connectWorkspace()`)
and carry a caller-chosen `conversationId` on the wire. That made Session
identity client-authoritative: the request could name an unrelated session, the
Host adopted it, and a wrong client could bind a discussion — and its frozen
seed — to a conversation it did not own. The repair makes the boundary
explicit: the wire is `{ id, workspaceId? }`; the client only selects a
Workspace from its own snapshot; the Host alone creates the conversation via the
Session Controller and records the Host-returned id; an invalid workspace fails
loudly with no writes and no silent fallback. Covered by the six new tests in
§3; all gates, the runtime smoke and every E2E scenario were rerun from a clean
isolated storage.

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
- no PAH integration;
- continuation placement: the **Web client selects the Workspace** (current
  session's workspace → most recent → none) and the **Host Session Controller
  creates and attaches the continuation Session**; a deployment mounting no
  workspace domain falls back to the Host default Session.

Additional behaviour observed during acceptance, recorded for transparency
(not regressions):

- the **evolution entry is session-scoped**: reopening an Idea's detail clears
  the discussion binding, and 继续讨论 re-arms it. The Host is idempotent per
  idea + current version, so re-arming reuses the active discussion and creates
  no second conversation.
- the composer's accessible label differs between the empty state and an open
  conversation; UI automation must not key on a single variant.

## 9. Environment notes (outside the repository)

- The isolated A–E acceptance E2E did not use or modify the user's normal
  profile in any way. Separately, and earlier in T7, an environment diagnostic
  corrected the user's `~/.dsh/settings.yaml` `baseURL` to the API root
  (`https://openrouter.ai/api/v1`) — the original value duplicated the
  `/chat/completions` path and produced 404s — and kept the original file as a
  timestamped backup (`settings.yaml.bak-t7`).
- The OpenRouter route itself was unusable for acceptance because of an
  account-credit limit (402: the request size exceeded the remaining balance).
  This is a user-account condition, not a plugin defect, and was the reason the
  acceptance ran on the isolated `deepseek-official` home instead.
