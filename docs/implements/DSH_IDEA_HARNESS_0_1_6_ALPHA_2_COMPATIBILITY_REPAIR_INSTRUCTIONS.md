# DSH Idea — Harness 0.1.6-alpha.2 Compatibility Repair Instructions

**Status:** Frozen repair instructions  
**Task:** Harness upgrade compatibility repair  
**Repository:** `D:\Harness\harness-plugin\dsh-idea`  
**Remote:** `Dhandil/dsh-idea`  
**This is NOT T11.**

## 0. Frozen Baselines

```text
DSH_IDEA_BASELINE=559e11df663628674c0435f7bda525f7c2b5b9c1
T10_TESTED_EXECUTABLE_SHA=507d1228d412eb12a7268efec9d7dfe5849abe71
HARNESS_BASELINE=ddefc45fbc7f8e46dd73185e68295696d1297887
HARNESS_VERSION=0.1.6-alpha.2
IDEA_DOMAIN=idea/v3
```

Before any executable change, verify:

```text
dsh-idea:
HEAD == origin/main == 559e11df663628674c0435f7bda525f7c2b5b9c1
working tree clean

deepseek-harness:
HEAD == ddefc45fbc7f8e46dd73185e68295696d1297887
```

Harness is read-only.

If any frozen baseline differs:

```text
STOP
DSH_IDEA_HARNESS_UPGRADE_BASELINE_DRIFT
```

Do not reset, rebase, merge, cherry-pick, or otherwise hide drift.

---

## 1. Repair Goal

Repair only the compatibility breaks introduced by moving the runtime/development baseline to:

```text
deepseek-harness 0.1.6-alpha.2
ddefc45fbc7f8e46dd73185e68295696d1297887
```

Preflight result:

```text
COMPATIBILITY_REVIEW=REPAIR_REQUIRED
```

Confirmed breaks:

1. Existing `@deepseek-ai/dsh-*` peer ranges do not admit `0.1.6-alpha.2`.
2. Harness removed `ISessions.open()`.
3. Harness removed `SessionListState.current`.
4. Session navigation moved to `ctx.uiWorkspace`.
5. Local development setup lacks the `ui-workspace` link.

Confirmed non-breaks:

- Typert lazy schema factory needs no code repair.
- `pnpm generate:typert` already succeeds with zero generated drift.
- `SessionBinding.eventSource` remains available.
- `InputState.draftRev` and `occurrences` remain available.
- Reference insertion seams remain available.
- `conversation.input.dock`, `conversation.chat.assistant-actions`, and `settings.section` remain available.
- `agent/pre-step` remains available.
- Remote cancellation `{ parameter: 'signal' }` remains available.
- T9/T10 fake-seam behavior remains compatible.
- `idea/v3` remains unchanged.

---

## 2. Minimal Repair Scope

Expected repair files:

```text
packages/dsh-idea/package.json
packages/dsh-idea/scripts/setup-dev.mjs
packages/dsh-idea/src/client/index.ts
client test harness/test files strictly required for the new uiWorkspace seam
```

Do not widen the scope.

---

## 3. Peer Dependency Repair

Do NOT use an old/new OR-union.

The repaired package will depend on the new `uiWorkspace` capability, so it must not advertise compatibility with older Harness releases lacking that seam.

Update all existing DSH peer ranges to:

```text
^0.1.6-alpha.2
```

for:

```text
@deepseek-ai/dsh-agent
@deepseek-ai/dsh-agent-default-model
@deepseek-ai/dsh-invariants
@deepseek-ai/dsh-llm
@deepseek-ai/dsh-session
@deepseek-ai/dsh-session-query
@deepseek-ai/dsh-storage
@deepseek-ai/dsh-storage-domain
@deepseek-ai/dsh-storage-json
@deepseek-ai/dsh-typert-protocol
```

Add:

```text
@deepseek-ai/dsh-client-ui-workspace: ^0.1.6-alpha.2
```

Do not loosen non-DSH peers without evidence.

---

## 4. Client Plugin Dependency Metadata

In `package.json` under `dsh.client.inject`, add:

```text
@deepseek-ai/dsh-client-ui-workspace
```

Do not remove existing injection metadata unless strictly required.

---

## 5. Local Development Link

In:

```text
packages/dsh-idea/scripts/setup-dev.mjs
```

add:

```text
['@deepseek-ai/dsh-client-ui-workspace', 'packages/client/ui-workspace']
```

using the existing link pattern.

---

## 6. Client Navigation Repair

Update only the removed Harness seams in:

```text
packages/dsh-idea/src/client/index.ts
```

### 6.1 Type merge

Add the type-only client contract import:

```text
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
```

Use the repository's normal type-merge style.

### 6.2 Runtime Cordis injection

Add:

```text
uiWorkspace
```

to the runtime `inject` array.

Accessing `ctx.uiWorkspace` without declaring the service dependency is not allowed.

### 6.3 Open created Continue Discussion session

Replace:

```text
sessions.open(SessionId(conversationId))
```

with:

```text
ctx.uiWorkspace.openSession(SessionId(conversationId))
```

Preserve:

```text
Continue Discussion
→ sessions.refresh()
→ open created conversation
```

Do not emulate navigation through localStorage, layout internals, or private Harness state.

---

## 7. Removed Current-Session Selection

Old code used:

```text
sessions.list.getSnapshot().current
```

The new Harness no longer exposes the current main Session through `ISessions`.

The selection is private to `UiWorkspaceService`.

Do NOT:

- read `dsh.sessions.current` directly;
- access `UiWorkspaceService` private members;
- infer current selection from `retainedBy`;
- duplicate Harness navigation state;
- maintain a shadow current Session.

For this repair, use:

```text
selectContinuationWorkspace(workspaceItems, undefined)
```

or the exact equivalent.

Accepted UX degradation:

```text
OLD:
current Session's Workspace
→ most recent Workspace
→ none

NEW:
most recent Workspace
→ none
```

This affects only preferred Workspace selection for a new Continue Discussion conversation.

The final report must disclose this.

Do not widen the repair to restore the old preference through private state.

---

## 8. Typert

No Typert code change is expected.

Do not hand-edit generated Typert output.

Run:

```text
pnpm generate:typert
```

during verification.

Expected:

```text
exit 0
zero unexpected generated drift
```

If generation creates unexpected drift:

```text
STOP
```

Inspect and report it before proceeding.

---

## 9. Test Harness Repair

Client tests mounting the plugin must supply:

```text
uiWorkspace.openSession(...)
```

through the smallest compatible fake/stub.

At minimum prove:

1. the client plugin mounts with `uiWorkspace`;
2. Continue Discussion refreshes the Session list before navigation;
3. successful Continue Discussion calls:
   ```text
   uiWorkspace.openSession(createdSessionId)
   ```
4. old `sessions.open()` is no longer assumed;
5. removed `SessionListState.current` is no longer assumed;
6. T9 Reference behavior remains unchanged;
7. T10 resurfacing behavior remains unchanged.

Do not broadly rewrite client test infrastructure.

---

## 10. Frozen Semantics

This repair must not change:

```text
idea/v3
```

Nor may it change accepted semantics of:

- Save Idea;
- Idea versioning/history;
- Continue Discussion host creation and lineage;
- Search;
- Related Ideas;
- T9 Reference admission/dedupe/limits/exact-version behavior;
- T10 trigger/detector/retrieval/suppression/Judge/UI/reference behavior.

Only the Client navigation seam and compatibility metadata may change.

---

## 11. Harness Boundary

Harness stays read-only.

Final proof:

```text
HARNESS_SHA=ddefc45fbc7f8e46dd73185e68295696d1297887
HARNESS_TRACKED_DIFF=ZERO
```

Preserve all pre-existing untracked Harness files.

Do not:

```text
git clean
git reset --hard
edit Harness
patch Harness locally
vendor Harness files
```

If a Harness modification becomes necessary:

```text
STOP
DSH_IDEA_HARNESS_COMPATIBILITY_ARCHITECTURE_DECISION_REQUIRED
```

---

## 12. Verification Order

Strict order:

```text
Implementation
→ setup-dev against Harness 0.1.6-alpha.2
→ generate:typert
→ inspect generated diff
→ typecheck
→ focused client / Continue Discussion compatibility tests
→ focused T9 Reference regression
→ focused T10 resurfacing regression
→ full test suite
→ build
→ build:client
→ static/drift gates
→ Canonical Full LAST
```

A successful `build:client` does not override a failed `typecheck`.

---

## 13. Focused Acceptance

### Peer contract

Prove the repaired peer ranges admit:

```text
0.1.6-alpha.2
```

under standard semver prerelease rules.

### Continue Discussion navigation

Prove:

```text
Continue Discussion success
→ sessions.refresh()
→ uiWorkspace.openSession(createdConversationId)
```

with refresh-before-open ordering preserved.

### Workspace fallback

Prove:

```text
selectContinuationWorkspace(items, undefined)
```

still deterministically selects the most recently updated Workspace.

### Typert

Prove generation has no unexpected drift.

### T9/T10

Previously accepted behavior must remain green.

---

## 14. Static / Drift Gates

Before Canonical Full:

```text
git diff --check
typecheck clean
build clean
build:client clean
generated artifact freshness
idea/v3 schema drift = zero
Harness tracked diff = zero
only task-owned repair drift in dsh-idea
```

Run package-native lint/format gates if they exist.

---

## 15. Canonical Full

Run the complete suite as the final executable gate.

Previous total:

```text
40 files
607 tests
```

The new total may be higher if compatibility tests are added.

Record exact totals.

After Canonical Full:

```text
NO EXECUTABLE DRIFT
```

Only docs/report changes may follow.

---

## 16. Provider / Network Governance

No real model/provider call is required.

Expected:

```text
REAL_MODEL_PROVIDER_CALLS=0
```

Use fake/offline tests.

---

## 17. Commit Structure

Preferred:

### Executable repair commit

Contains only compatibility implementation and tests.

This becomes the tested executable SHA after final acceptance.

### Docs-only acceptance commit

Create:

```text
docs/DSH_IDEA_HARNESS_0_1_6_ALPHA_2_COMPATIBILITY_ACCEPTANCE.md
```

No executable changes after the tested SHA.

---

## 18. Final Report Requirements

Include:

1. dsh-idea starting SHA;
2. Harness SHA/version;
3. executable repair SHA;
4. tested executable SHA;
5. docs-only acceptance SHA;
6. exact changed files;
7. peerDependency before/after policy;
8. new `uiWorkspace` dependency declaration;
9. setup-dev junction change;
10. Continue Discussion navigation change;
11. explicit current-workspace → recent-workspace fallback disclosure;
12. Typert generation result;
13. typecheck;
14. focused compatibility tests;
15. T9 regression;
16. T10 regression;
17. Canonical Full totals;
18. build/build:client;
19. static gates;
20. real provider call count;
21. `idea/v3` schema/migration proof;
22. Harness tracked-diff-zero proof;
23. final git status;
24. preserved unrelated drift;
25. `origin/main` verification.

---

## 19. Acceptance Outcomes

Success:

```text
DSH_IDEA_HARNESS_0_1_6_ALPHA_2_COMPATIBILITY_ACCEPTED
```

Implementation complete but acceptance failure:

```text
DSH_IDEA_HARNESS_0_1_6_ALPHA_2_IMPLEMENTED_NOT_ACCEPTED
```

Architecture decision required:

```text
DSH_IDEA_HARNESS_COMPATIBILITY_ARCHITECTURE_DECISION_REQUIRED
```

Baseline mismatch:

```text
DSH_IDEA_HARNESS_UPGRADE_BASELINE_DRIFT
```

Do not enter T11.

Stop after remote verification.
