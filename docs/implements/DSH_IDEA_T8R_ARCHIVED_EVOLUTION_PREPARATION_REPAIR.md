# DSH Idea — T8R Archived Evolution Preparation Boundary Repair

## 0. Status and scope

Current status:

```text
T8_ACCEPTANCE_REOPENED_FOR_ARCHIVED_EVOLUTION_PREPARATION_REPAIR
```

Repository:

```text
D:\Harness\harness-plugin\dsh-idea
```

Start from current `main`:

```text
5300e1293ab2d40c3f3f76862f0ed235390d959d
```

Superseded T8 executable candidate:

```text
4389b0d7b76aaac39fbe13d55863039f51871ca3
```

Harness checkout remains read-only:

```text
D:\Harness\deepseek-harness
```

Expected Harness SHA:

```text
c291e7961a515f6d7af9304e7fd1d257929aef26
```

This is a focused T8 repair only. Do not enter V2, PAH, Memory, Knowledge, embeddings, proactive resurfacing, Idea Graph, or any unrelated refactor.

## 1. Remote review finding

The accepted T8 UI correctly hides Evolution Proposal from archived Ideas, and `IdeaService.evolve()` correctly rejects an archived Idea.

However the Host evolution preparation path still permits an archived Idea to call:

```text
idea.prepareEvolution
→ IdeaEvolutionService.prepare(...)
→ read continuation Session
→ resolve model route
→ real LLM extraction
→ register proposal
```

Current `IdeaEvolutionService.prepare()` resolves the discussion and Idea aggregate but does not reject `aggregate.idea.status === 'archived'` before reading the Session and invoking the model.

That violates the T8 product boundary:

```text
Archived Idea
→ read-only except Restore / Permanent Delete
→ no Edit
→ no Continue Discussion
→ no Generate Evolution Proposal
```

UI hiding is not sufficient. A crafted Remote caller can currently spend a model call and create an ephemeral proposal for an archived Idea, even though commit later fails.

## 2. Required repair

In the Host evolution preparation path, reject an archived Idea before any Session read, route resolution, provider/model call, or proposal registration.

The minimal acceptable implementation is in:

```text
packages/dsh-idea/src/evolution/service.ts
```

After resolving the Idea aggregate and before expensive preparation work:

```ts
if (aggregate.idea.status === 'archived') {
  throw new IdeaError(
    'archived',
    `idea '${aggregate.idea.ideaId}' is archived; restore it before preparing evolution`,
  )
}
```

Equivalent structure is acceptable if it keeps the same semantics.

Preferred ordering:

```text
resolve discussion
→ resolve Idea
→ archived check
→ base-version/stale check
→ validate frozen continuation context
→ Session read
→ route resolution
→ LLM
→ proposal registry
```

Retain the stable Remote mapping:

```text
IdeaError('archived')
→ idea/archived
```

Do not add a new wire error unless genuinely necessary.

## 3. No other lifecycle redesign

Keep unchanged:

- domain `idea/v3`;
- manual edit semantics;
- archive/restore semantics;
- permanent delete semantics;
- Current/Archived tabs;
- hover card fallback;
- Related Ideas lifecycle filtering;
- Host-authoritative continuation;
- immutable version history;
- no Deleted list;
- no Harness-conversation deletion.

No migration. No Harness core change.

## 4. Focused tests

### A. Evolution service / Host preparation test

Create:

```text
Idea
→ Continue Discussion
→ Archive Idea
→ call prepare evolution
```

Expected:

```text
idea/archived (or domain archived before Remote mapping)
0 Session surface reads after archived decision
0 model-route resolution
0 llm.stream calls
0 proposal registration
0 Idea writes
```

Use spies/fakes that fail the test if any model/session preparation seam is touched.

### B. Remote contract test

Call:

```text
idea.prepareEvolution({ discussionId })
```

for an archived Idea.

Expected:

```text
RemoteError code = idea/archived
```

and prove zero model/provider/network call.

### C. Restore regression

After:

```text
Archive
→ Restore
```

the same valid continuation path may prepare evolution again, subject to the existing stale-base rules.

This proves the repair is an archive lifecycle gate, not a permanent poison of the discussion.

### D. Existing archived lifecycle regression

Keep proving:

```text
archived manualEdit    → rejected
archived continue      → rejected
archived evolve commit → rejected
reads/history          → allowed
restore/delete         → allowed
```

## 5. Acceptance-proof gap: permanent-delete failure

The T8 implementation awaits every discussion delete and the final aggregate delete, so an exception naturally prevents a success return.

However the T8 required test matrix explicitly requested:

```text
delete failure never reports success
```

and remote review did not find a deterministic failure-injection proof in the lifecycle tests.

Add one focused test if the existing test harness can safely inject a storage delete failure without redesigning production code.

Required proof:

```text
forced discussion-delete or aggregate-delete failure
→ deleteIdea rejects
→ never returns success
→ deleting guard releases in finally
→ retry is possible
```

Do not introduce production abstractions solely to make this test possible. If the current test harness cannot inject this cleanly, document the limitation rather than broadening architecture.

This proof gap is secondary; the archived prepare boundary is the blocking repair.

## 6. Gates

Run focused tests first.

Then run the complete plugin gates:

```powershell
pnpm generate:typert
pnpm typecheck
pnpm build
pnpm build:client
git diff --check
pnpm test
```

Automated suite must perform:

```text
0 real provider/network/model calls
```

Do not run the full Harness monorepo suite.

## 7. New executable checkpoint

After deterministic gates pass, commit executable changes.

Preferred subject:

```text
fix: block archived idea evolution preparation
```

Push `main`.

Record:

```text
T8R_TESTED_SHA
```

The previous:

```text
4389b0d7b76aaac39fbe13d55863039f51871ca3
```

is superseded as the accepted T8 executable candidate. Keep history; do not rewrite it.

## 8. Runtime acceptance

Because this is an executable semantic change after the prior T8 Playwright run, acceptance evidence must be bound to the new `T8R_TESTED_SHA`.

### Zero-provider smoke

Re-run the clean providerless runtime smoke:

- plugin boots;
- Ideas section renders;
- Current/Archived tabs render;
- no provider/model requests;
- clean console/page/network;
- clean shutdown.

### Real Playwright A–G

Re-run the established T8 A–G product acceptance against the new executable SHA:

```text
A Save baseline Idea
B Hover preview
C Manual Edit
D Archive
E Restore
F Continue regression
G Permanent Delete
```

Use clean isolated acceptance storage.

Provider calls should remain minimal.

In Scenario D additionally verify visually:

```text
Archived detail exposes Restore / Permanent Delete only
no Edit
no Continue Discussion
no Generate Evolution Proposal
```

The crafted-Remote archived-prepare proof remains an automated Host test; do not add unnecessary browser hacks merely to call hidden Remote methods.

## 9. Runtime hygiene

Keep the established cleanup gate:

- close obsolete test tabs/windows when no longer needed;
- stop obsolete Harness servers;
- terminate obsolete Playwright/Chromium children;
- release test ports;
- remove token-bearing temporary logs;
- do not touch unrelated user browser windows/processes.

Final report must record cleanup status.

## 10. Acceptance report update

Update:

```text
docs/DSH_IDEA_T8_LIBRARY_LIFECYCLE_ACCEPTANCE.md
```

The report must explicitly state:

- old `4389b0d...` acceptance candidate is superseded;
- new `T8R_TESTED_SHA`;
- archived `prepareEvolution` now fails before Session/model/proposal work;
- focused test evidence;
- final test count/files;
- fresh zero-provider smoke;
- fresh A–G Playwright on the new SHA;
- Harness unchanged;
- runtime cleanup complete.

After runtime acceptance, create a docs-only commit.

Preferred subject:

```text
docs: update dsh-idea t8 acceptance
```

Record:

```text
T8R_ACCEPTANCE_SHA
```

Verify:

```text
local HEAD == origin/main
working tree clean
Harness SHA unchanged
```

## 11. Final outcome

Only if every gate passes:

```text
DSH_IDEA_T8_ACCEPTED
```

with the new identities:

```text
T8_TESTED_SHA=<new T8R executable SHA>
T8_ACCEPTANCE_SHA=<new docs-only SHA>
HARNESS_SHA=c291e7961a515f6d7af9304e7fd1d257929aef26
DOMAIN=idea/v3
ARCHIVED_PREPARE_EVOLUTION=BLOCKED_BEFORE_MODEL
TESTS=<count>/<files>
ZERO_PROVIDER_SMOKE=PASS
PLAYWRIGHT_A_G=PASS
RUNTIME_CLEANUP=PASS
HARNESS_UNCHANGED=true
ORIGIN_VERIFIED=true
TREE=CLEAN
```

Do not enter V2 / PAH / Memory / Knowledge.
