# DSH Idea V1 — T7 Hardening, Compatibility Repair & Product Acceptance (Playwright Edition)

## 0. Task identity

Task:

```text
T7 — V1 Hardening / Compatibility Repair / Final Product Acceptance
```

Repository:

```text
D:\Harness\harness-plugin\dsh-idea
```

Accepted implementation base:

```text
85f0a404c7cd33a96c5350e137f46bc59c555611
```

Harness reference, read-only:

```text
D:\Harness\deepseek-harness
```

Expected Harness SHA:

```text
c291e7961a515f6d7af9304e7fd1d257929aef26
```

Do not modify Harness core.

This revised T7 instruction assumes:

```text
Claude Code is authenticated by API
Claude in Chrome is unavailable
Claude Desktop Computer Use is unavailable
```

Therefore the required real browser E2E path is:

```text
Claude Code
+ Playwright
+ real Chromium
+ real Harness Web
+ real configured Harness model/provider
```

Claude Code's own API authentication and Harness's model/provider authentication are independent.

---

# 1. Current V1 capability baseline

Entering T7:

```text
Save Idea                         ✅
Editable Save Preview             ✅
Idea Library / Detail             ✅
Immutable Version History         ✅
Continue Discussion               ✅
Frozen Idea seed -> Agent         ✅
Evolution Proposal                ✅
Human-approved Evolution Commit   ✅
Related Ideas                     ✅
Related Ideas priority repair     ✅
Real zero-provider web boot       ✅
```

T7 must produce a compatibility-safe, runtime-tested V1 release baseline.

---

# 2. Continuous T7 workflow

Run without pausing for confirmation unless a genuine blocker requires user action:

```text
Preflight
↓
Compatibility / architecture audit
↓
Mandatory provenance repair
↓
Structured-output hardening
↓
Focused tests
↓
Pre-Full static/build gates
↓
Full plugin regression
↓
Commit exact executable candidate
↓
Real zero-provider runtime smoke
↓
Playwright real-browser + real-model Product E2E
↓
No executable drift
↓
Acceptance report
↓
Docs-only acceptance commit
↓
Remote verification
```

Do not enter V2 / PAH / Memory / Knowledge.

---

# 3. Mandatory provenance compatibility repair

Current v2 uses:

```ts
sourceDiscussionId?: SourceDiscussionId
```

while the older v1 model allowed:

```ts
sourceDiscussionIds: readonly SourceDiscussionId[]
```

The current v1 -> v2 migration can collapse a valid array to one element.

V1 final acceptance must not retain a migration that silently loses valid durable provenance.

Upgrade the Idea storage domain to:

```text
version: 3
compatibleVersions: [1, 2]
```

Canonical v3 `IdeaVersion`:

```ts
sourceDiscussionIds: readonly SourceDiscussionId[]
```

Keep the rest of the currently adopted model:

- nested `draft`;
- `reason`;
- `evolutionEvents`;
- linear immutable versions;
- `IdeaDiscussion`.

Do not redesign these in T7.

---

# 4. v1 -> v3 migration

For a legacy v1 version:

```text
flat IdeaDraft fields
sourceDiscussionIds: [...]
no reason
no evolutionEvents
```

migrate by:

1. wrapping semantic fields in `draft`;
2. preserving the full `sourceDiscussionIds` array in order;
3. assigning the compatibility `reason` rule already used by the current migration;
4. synthesizing deterministic evolution events;
5. preserving all valid source snapshots and references.

Forbidden:

```text
array -> first element
array -> last element
drop valid distinct source ids
```

Migration must be non-lossy for valid provenance.

---

# 5. v2 -> v3 migration

Convert:

```ts
sourceDiscussionId?: SourceDiscussionId
```

to:

```ts
sourceDiscussionIds:
  sourceDiscussionId === undefined
    ? []
    : [sourceDiscussionId]
```

Keep nested draft, reason, and evolutionEvents intact.

---

# 6. New v3 writes

`IdeaService.create()` writes:

```ts
sourceDiscussionIds: [sourceDiscussionId]
```

`IdeaService.evolve()` writes:

```ts
sourceDiscussionIds: [sourceDiscussionId]
```

Do not introduce automatic multi-source aggregation.

Plural provenance exists to preserve compatibility and avoid data loss.

---

# 7. v3 provenance invariants

Validate:

- every cited source id belongs to the same Idea;
- every cited source id resolves to a stored `SourceDiscussion`;
- citation order is durable;
- public reads return detached arrays;
- old versions remain immutable;
- currentVersionId still points to the latest version;
- migration never drops valid citations.

Keep source snapshots in the same aggregate.

---

# 8. Existing UI compatibility

Do not make T7 a multi-source UI feature.

The current wire/UI may continue to display one primary source:

```text
sourceDiscussionIds[0]
```

Additional citations remain durable but are not yet rendered.

Document this as a V1 limitation.

---

# 9. Required migration tests

Create durable fixtures for all supported versions.

## v1 multi-source fixture

At least one v1 version:

```text
sourceDiscussionIds = [srcA, srcB]
```

with both snapshots present.

Prove:

```text
open as v3
→ [srcA, srcB] preserved in order
→ both snapshots preserved
→ read operations zero-write
→ next legitimate write persists canonical v3
→ reopen
→ historical provenance still intact
```

## v2 fixture

Prove:

```text
sourceDiscussionId = srcA
→ [srcA]
```

and:

```text
sourceDiscussionId absent
→ []
```

Then write + reopen and verify preservation.

## corrupt fixture

A cited source id missing from `sourceDiscussions` must fail domain open loudly.

No silent repair.

---

# 10. Structured model-output hardening

All model-generated structured outputs must reject unknown structural keys.

## Save / Evolution IdeaDraft model output

Exact top-level keys:

```text
title
core
motivation
currentConclusion
possibleValue
useWhen
openQuestions
```

Extra model keys => `invalid-model-output`.

## Related Ideas model output

Root exact key:

```text
matches
```

Each match exact keys:

```text
ideaId
whyUsefulNow
```

Extra model keys such as:

```text
title
core
score
confidence
```

=> `invalid-model-output`.

Do not change user-editable draft semantics.

---

# 11. Parser tests

Add:

```text
Save output + unknown key -> invalid-model-output
Evolution output + unknown key -> invalid-model-output
Related root + unknown key -> invalid-model-output
Related match + unknown key -> invalid-model-output
```

Preserve:

- raw JSON / accepted single json fence convention;
- no prose around JSON;
- no retry;
- zero durable writes on malformed output.

---

# 12. Full V1 invariant audit

Review before full regression.

## Human agency

```text
Save Idea           explicit only
Related Ideas       explicit only
Continue Discussion explicit only
Evolution commit    explicit human approval only
```

No background Idea detection.
No proactive resurfacing.
No silent evolution.

## Persistence

```text
versions immutable
currentVersionId latest
provenance retained
archived != deleted
Related query zero-write
prepare zero Idea-write
Continue Discussion zero Idea-write
```

## LLM authority

```text
LLM proposes/judges
Host validates
Human approves durable semantic writes
Domain commits
```

## Context

```text
Save capture bounded
Related capture bounded
Continue seed transcript-free
Continue seed exactly-once durable delivery
system/tool/reasoning/plugin context filtered where required
```

## Concurrency

```text
Save preparation commit idempotent
Evolution optimistic concurrency
stale discussion rejected
duplicate proposal commit cannot duplicate version
Continue Discussion reuses active same idea+version workspace
```

## Trust

User-owned discussion / Idea content is framed as data.

## Core boundary

Harness tracked files unchanged.

---

# 13. Focused test order

Run:

```text
migration/schema/domain
Save parser
Evolution parser
Related parser
Continue context
Evolution stale-base
Related retrieval
Remote
Client
```

Repair any failures before proceeding.

---

# 14. Pre-Full gates

Run before the full plugin suite:

```powershell
pnpm typecheck
pnpm build
pnpm build:client
git diff --check
```

Run:

```powershell
pnpm generate:typert
```

only if Remote/wire contracts changed.

Unexpected generated drift must be investigated.

---

# 15. Full plugin regression

Then run one clean full plugin regression:

```powershell
pnpm test
```

Record:

```text
test count
test files
exit code
```

All automated tests:

```text
0 real provider/network calls
```

Do not run the entire Harness monorepo full suite.

---

# 16. Freeze executable candidate

After all executable/static/plugin gates pass:

```powershell
git status --short
git diff --check
```

Commit:

```text
fix: harden idea v1 compatibility
```

Push to `origin/main`.

Record full SHA as:

```text
V1_TESTED_SHA
```

All later runtime and browser E2E acceptance must test this exact SHA.

If executable code changes afterward, the affected acceptance evidence is invalid and must be rerun.

---

# 17. Real zero-provider runtime smoke

First optional config preflight:

```powershell
pnpm dsh web --dump-config
```

This is not a boot test.

Then real boot:

```powershell
pnpm dsh web
```

Verify:

- ready/listening URL;
- process stable;
- no loader/import errors;
- no Remote mount errors;
- no client bundle errors;
- 0 provider/model calls;
- clean termination.

Do not send chat input during this smoke.

---

# 18. Real Product E2E execution method

Do NOT depend on:

- Claude in Chrome;
- Claude Desktop Computer Use;
- Anthropic account login.

Use Playwright from Claude Code.

Required stack:

```text
Claude Code (API-authenticated)
        ↓
Playwright
        ↓
real Chromium browser process
        ↓
real Harness localhost Web app
        ↓
real Harness configured provider/model
```

The Claude Code API is only the implementation/test controller.

The model calls exercised by Save / Evolution / Related Ideas must come from Harness's own configured provider route.

---

# 19. Playwright availability preflight

Before modifying anything, inspect whether Playwright already exists:

```powershell
pnpm exec playwright --version
```

and inspect workspace dependencies.

Preferred order:

1. reuse an already-available Playwright installation;
2. otherwise create a temporary E2E workspace outside the tracked plugin repository;
3. install Playwright only in that temporary workspace if needed.

Recommended temp location:

```text
%TEMP%\dsh-idea-v1-e2e
```

or another untracked temporary directory.

Do NOT add Playwright to runtime dependencies.

Do NOT modify `packages/dsh-idea/package.json` merely to run final acceptance.

If browser binaries are missing, install only the required Chromium binary in the temporary E2E environment.

Any temporary E2E files must be deleted after evidence is captured unless deliberately retained outside the repository.

---

# 20. Playwright browser mode

Prefer:

```text
Chromium
headful when useful for debugging
```

Headless is acceptable for stable automation, but at least one final acceptance run should use the normal browser engine and real app UI.

Capture:

- screenshots;
- DOM assertions;
- console errors;
- page errors;
- failed `fetch` / XHR / Remote requests relevant to dsh-idea.

Never print:

- auth token;
- cookies;
- API keys;
- provider secrets.

Redact token-bearing URLs in logs/reports.

---

# 21. E2E isolation profile

Prefer an isolated acceptance profile:

```text
dsh-idea-v1-acceptance
```

Use the official Harness profile/plugin mechanisms.

Do not hand-edit profile manifests.

Confirm exact CLI syntax against the pinned Harness baseline before executing.

Install the plugin through the official mechanism using the local link package.

Config preflight must prove the Idea bundle rows are present.

If provider/model configuration is available through environment variables, reuse them without printing secrets.

If provider settings must be copied from local supported configuration, copy only what is needed and never commit secrets.

If an isolated profile cannot obtain a working real model route safely, report:

```text
REAL_E2E_BLOCKED_PROVIDER_CONFIGURATION
```

Do not fake real E2E success.

Do not silently switch to the user's normal profile unless explicitly necessary and safe.

---

# 22. E2E runtime startup

Start the isolated Harness web profile as a managed background process.

Capture stdout/stderr to a temporary log.

Wait for the real ready line, e.g.:

```text
http://127.0.0.1:<port>/?token=...
```

Extract the URL in-memory.

Do not echo the raw token into the final report.

Playwright should navigate to the authenticated ready URL once, allowing Harness to establish its normal browser auth state.

After auth is established, subsequent navigation may use the normal localhost URL/cookie flow if supported.

---

# 23. Unique test marker

Generate:

```text
DSH_IDEA_V1_E2E_<unique>
```

Use it in all acceptance test content.

A related Idea uses:

```text
DSH_IDEA_V1_E2E_<unique>_RELATED
```

Do not reuse an old marker.

---

# 24. Scenario A — Save Idea

In a fresh real chat, enter a concrete Idea containing the unique marker.

Suggested theme:

```text
Design a local-first Agent incident review checklist.
Unique marker: DSH_IDEA_V1_E2E_...
```

Wait for a finalized assistant response.

Then via Playwright:

1. click `💡 Save Idea`;
2. wait for preparation loading to finish;
3. assert editable preview appears;
4. assert required fields are populated;
5. make one harmless visible edit;
6. click Save;
7. assert success;
8. open Ideas library;
9. assert saved title/core reflect approved draft.

Capture a screenshot of the Preview and Library.

---

# 25. Scenario B — Persistence

Reload the browser page or restart Harness Web.

Return to Ideas library.

Assert:

- the saved Idea still exists;
- approved content remains unchanged.

This proves real durable persistence.

---

# 26. Scenario C — Continue Discussion seed delivery

Open the saved Idea and click Continue Discussion.

In the new continuation conversation, send:

```text
只回答：你当前收到的 Idea 背景中那个唯一测试标记是什么？
```

Do NOT repeat the marker in this prompt.

Wait for the real model response.

Assert the response contains the exact:

```text
DSH_IDEA_V1_E2E_<unique>
```

Then ask one brief question about the saved Idea core and assert the response is coherent with that saved content.

Capture screenshot evidence.

This is the real product proof that the frozen Idea seed reached the model.

---

# 27. Scenario D — Evolution

In the continuation conversation:

1. discuss one meaningful refinement;
2. return to Idea detail;
3. trigger Evolution Proposal;
4. wait for real proposal generation;
5. assert preview appears;
6. verify proposal is based on current version;
7. edit one visible field;
8. approve/save as new version;
9. assert version history shows v1 and v2;
10. open v1 and confirm it remains unchanged;
11. confirm v2 contains the approved refinement.

Capture screenshot evidence of version history.

---

# 28. Scenario E — Related Ideas positive path

Create and save a second real Idea in another normal conversation.

Use:

```text
DSH_IDEA_V1_E2E_<unique>_RELATED
```

Make its core/useWhen obviously useful to a third conversation.

Then in a third ordinary conversation:

1. create context that clearly needs the second Idea;
2. wait for finalized assistant message;
3. click `关联 Idea`;
4. assert loading;
5. wait for Related overlay;
6. expect at least one known saved Idea;
7. assert canonical title/core;
8. assert `为什么现在有用` / `whyUsefulNow`;
9. assert visible rows <= 3;
10. close overlay;
11. assert the normal conversation was not automatically modified/injected.

Because zero results are valid, one additional **explicit UI click** is permitted if the first real judgment returns zero.

No hidden service retry may be added.

If two explicit attempts both return zero:

```text
REAL_E2E_RELATED_POSITIVE_PATH_INCONCLUSIVE
```

Do not claim full V1 acceptance.

Capture screenshot evidence of the Related overlay.

---

# 29. Optional Scenario F — valid zero-match

If convenient without unnecessary provider usage:

- use an obviously unrelated discussion;
- click Related Ideas;
- verify zero matches render as the valid empty state rather than error.

This is optional because automated tests already cover the branch.

---

# 30. Playwright assertion guidance

Prefer resilient user-facing locators:

```text
getByRole
getByText
getByLabel
data attributes already present in app
```

Avoid brittle generated class names.

Wait on actual state changes instead of arbitrary long sleeps.

Use bounded explicit timeouts for real LLM operations.

Capture final failure diagnostics:

- screenshot;
- visible DOM text;
- console errors;
- failed requests;
- current URL with auth token redacted.

---

# 31. Real provider policy

Real E2E is allowed to make only the minimum provider/model calls needed.

Expected real calls include:

- normal chat responses;
- Save Idea extraction;
- Continue Discussion chat;
- Evolution proposal;
- Related Ideas usefulness judge.

Do not load/stress test.

Record approximate call count/purpose and provider/model identity when non-sensitive.

Never print API keys.

---

# 32. E2E failure policy

If real E2E exposes a defect:

1. stop acceptance;
2. reproduce;
3. fix executable code;
4. rerun focused tests;
5. rerun Pre-Full gates;
6. rerun full plugin regression;
7. commit a new executable SHA;
8. rerun real runtime smoke;
9. rerun every E2E scenario whose evidence the fix could invalidate.

Never change executable code after E2E and keep old evidence.

---

# 33. No executable drift after successful E2E

After all required E2E scenarios pass:

```text
V1_TESTED_SHA
```

is frozen.

Only non-executable files may change:

- acceptance report;
- release notes;
- checkpoint metadata;
- documentation.

No TypeScript/JavaScript/schema/package/runtime dependency change without rerunning relevant acceptance.

---

# 34. Acceptance evidence

Store screenshots and temporary Playwright artifacts outside the repository by default.

Do not commit:

- auth state;
- cookies;
- traces containing secrets;
- provider keys;
- raw token-bearing URLs.

If small redacted screenshots are intentionally committed for documentation, verify manually/automatically that no token or secret is visible.

The required durable repository artifact is the Markdown acceptance report, not the raw browser auth state.

---

# 35. Final acceptance report

Create:

```text
docs/DSH_IDEA_V1_ACCEPTANCE_REPORT.md
```

Include:

```text
V1_TESTED_SHA
Harness SHA
domain version = 3
supported durable versions = 1 / 2 / 3
migration evidence
automated test count
static/build gates
real zero-provider runtime smoke
Playwright version / Chromium mode
real E2E profile
Save result
Persistence result
Continue seed result
Evolution result
Related Ideas result
browser console/network result
real provider call disclosure
Harness core unchanged verification
known limitations
```

Accepted V1 limitations:

- no proactive resurfacing;
- no embeddings/vector DB;
- no Idea Graph;
- no learned recommendation feedback;
- lexical Top-12 first stage may miss synonym-only candidates when corpus >12;
- V1 UI displays only primary provenance source while v3 durability preserves all source ids;
- no collaboration/cross-user sync;
- no PAH integration.

---

# 36. Docs-only acceptance commit

After successful E2E and no executable drift:

Commit the report only:

```text
docs: record dsh-idea v1 acceptance
```

Record:

```text
V1_TESTED_SHA
V1_ACCEPTANCE_SHA
```

Push `main`.

Verify:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/main
git status
```

Local HEAD and remote main must match.

Working tree clean.

---

# 37. Final success outcome

Only when every required stage passes:

```text
DSH_IDEA_V1_ACCEPTED
```

Report:

```text
V1_TESTED_SHA
V1_ACCEPTANCE_SHA
Harness SHA
domain version 3
plugin test count
real runtime smoke PASS
Playwright real browser E2E PASS
real Save PASS
real persistence PASS
real Continue seed PASS
real Evolution PASS
real Related Ideas positive path PASS
Harness core unchanged
origin/main verified
working tree clean
```

If browser automation itself is blocked:

```text
DSH_IDEA_V1_AUTOMATED_ACCEPTANCE_COMPLETE_REAL_E2E_BLOCKED
```

with the exact blocker.

If only provider configuration is blocked:

```text
REAL_E2E_BLOCKED_PROVIDER_CONFIGURATION
```

Do not claim full acceptance.

---

# 38. Final principles

> An Idea is a durable user-owned evolving asset, not a transcript and not a task.

> Creation, retrieval, continuation, evolution, and Related Ideas remain explicitly user-triggered.

> Historical provenance must never be silently discarded by migration.

> LLM output is proposal/judgment data, not authority over canonical identity or durable state.

> Human approval remains the durable semantic-write boundary.

> Final V1 acceptance requires deterministic automated evidence plus one real Playwright-driven browser flow through the actual Harness UI and configured model.
