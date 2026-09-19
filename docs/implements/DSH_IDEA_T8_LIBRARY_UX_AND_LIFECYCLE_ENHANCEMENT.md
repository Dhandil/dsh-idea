# DSH Idea — T8 Harness-Only Library UX & Lifecycle Enhancement

## 0. Task identity

Task: `T8 — Library UX & Lifecycle Enhancement`

Repository: `D:\Harness\harness-plugin\dsh-idea`

Start from accepted main: `0b186ff533700a0f89cf8bcfaa2394c9df34445a`

Accepted executable baseline: `048a66bfc2e50ed769f3796fa867e3ee590b734b`

Harness reference, read-only: `D:\Harness\deepseek-harness`

Expected Harness SHA: `c291e7961a515f6d7af9304e7fd1d257929aef26`

Do not modify Harness core. Do not implement PAH integration, PAH adapters/storage, Mission/WorkItem linkage, cross-system sync, Memory/Knowledge integration, proactive resurfacing, embeddings, Idea Graph, or recommendation learning.

This task is a Harness-only product refinement over the accepted V1.

---

## 1. Product goal

The Idea Library should behave like a lightweight index of long-term ideas rather than a wall of expanded notes.

Final product model:

```text
Current Ideas
  ↓
lightweight list
  ↓ hover
preview card
  ↓ click
full detail

Archived Ideas
  ↓
separate archived list
  ↓
read-only preview/detail
  ↓
Restore or permanently Delete
```

Also:

```text
Edit
→ direct user-authored semantic change
→ explicit Save as New Version
→ reason = manual-edit

Archive
→ keep as a long-term asset
→ leave current list / Related Ideas
→ visible in Archived list
→ restorable

Delete
→ permanently remove from dsh-idea storage
→ no Deleted status/list/recycle bin
```

---

## 2. Frozen Library UX

### Level 1 — list

Each row shows only:

```text
Title
one-line Core
Updated time
```

Do not render motivation, current conclusion, possible value, useWhen, openQuestions, source session, provenance, or version history in the ordinary row.

The row remains clickable to open full detail. Historical versions never become separate rows.

### Current / Archived tabs

Add:

```text
[当前] [已归档]
```

Prefer Harness `Pill` or the established equivalent.

Semantics:

```text
Current = active + dormant
Archived = status === archived only
```

No Deleted tab exists. Switching tabs is a read-only operation.

---

## 3. Hover Preview Card

For pointer-capable desktop UI, hovering an Idea row shows a preview card.

Prefer the pinned Harness shared primitive:

```text
@deepseek-ai/dsh-client-ui-primitives / HoverCard
```

Do not modify Harness core.

Show:

```text
Title
Core
Current Conclusion (when non-empty)
Use When (max 3 visible entries)
Open Questions count
Updated time
```

For a non-archived Idea include `[编辑]`.

For an archived Idea do not show Edit. A compact Restore quick action is acceptable, but full detail must also expose Restore.

Do not put Permanent Delete in the HoverCard.

Hover must remain optional: touch/coarse-pointer and keyboard users can click the row and access all required actions in full detail.

The Edit action inside the card must be genuinely clickable without triggering row navigation.

If shared HoverCard proves unsuitable for interactive children after real testing, use a feature-owned anchored card built from existing Harness overlay/position primitives. Do not patch Harness for this task.

---

## 4. Full detail actions

### Non-archived Idea

Expose:

```text
Edit
Continue Discussion
Archive
Permanent Delete
```

Existing Evolution Proposal remains available only after Continue Discussion as today.

### Archived Idea

Read-only except lifecycle actions:

```text
Restore
Permanent Delete
```

Do not expose Edit, Continue Discussion, or Generate Evolution Proposal while archived.

The Host/domain must enforce this; UI hiding is not enough.

---

## 5. Manual Edit semantics

Editable fields are exactly the current seven `IdeaDraft` fields:

```text
title
core
motivation
currentConclusion
possibleValue
useWhen
openQuestions
```

Do not expose system metadata:

```text
ideaId
versionId
ordinal
createdAt
updatedAt
status
sourceDiscussionIds
source snapshots
evolutionEvents
reason
```

Actions:

```text
Cancel
Save as New Version
```

Manual Edit is deterministic/user-authored and must not call an LLM.

Prefer refactoring/reusing the existing draft-editor presentation rather than creating a divergent second seven-field form.

---

## 6. Manual Edit version semantics

Manual Edit never rewrites history.

```text
v2
↓ Edit
v3 reason=manual-edit
```

Committed manual edit appends:

```text
IdeaVersion
  ordinal = previous + 1
  reason = manual-edit
  sourceDiscussionIds = []

IdeaEvolutionEvent
  fromVersionId = previous currentVersionId
  toVersionId = new version
  reason = manual-edit

Idea.currentVersionId = new version
Idea.updatedAt = commit time
```

Manual Edit does not fabricate a SourceDiscussion. Prior versions retain their own provenance.

Domain remains `idea / v3`; no migration is required.

Recommended dedicated domain API:

```ts
manualEdit(ideaId, draft, expectedCurrentVersionId): Promise<IdeaAggregate>
```

Do not force Manual Edit through the existing discussion-source path.

---

## 7. No-op Edit rule

Opening Edit and saving unchanged normalized content must produce:

```text
0 durable writes
0 new versions
0 evolution events
updatedAt unchanged
```

The client should disable Save when normalized content equals the base current version.

The domain must independently defend the same invariant so a crafted client cannot create no-op versions.

Use existing `IdeaDraft` normalization/admission semantics.

---

## 8. Manual Edit concurrency

The request must carry `expectedCurrentVersionId`.

If the Idea changed after the editor opened:

```text
version-conflict
→ zero writes
→ keep user's edits visible
→ show clear stale/conflict copy
```

Never silently rebase or overwrite the newer current version.

Archived Ideas must reject Manual Edit.

---

## 9. Archive semantics

Archive means: keep the Idea as a historical asset, but remove it from ordinary current use.

The existing durable status `archived` is sufficient. Do not change schema/domain version.

Archive preserves:

- every version;
- every sourceDiscussion;
- every evolutionEvent;
- discussion records;
- Idea id.

Archive changes only status/updatedAt and creates no version/event.

Use `expectedCurrentVersionId`.

Already archived + same expected version should be idempotent/no-write.

---

## 10. Archived behavior

Archived Ideas:

- appear in Archived list;
- remain fully readable;
- retain history/provenance;
- are absent from Current list;
- are excluded from Related Ideas candidates;
- cannot Manual Edit;
- cannot start new Continue Discussion;
- cannot commit Evolution Proposal;
- may Restore;
- may permanently Delete.

If a continuation Harness Session existed before Archive, do not delete or rewrite it. Any new Idea-domain evolution commit must still reject while archived.

---

## 11. Restore semantics

Add explicit Restore:

```text
archived → active
```

Restore does not create a version/event. It changes only status/updatedAt.

Use `expectedCurrentVersionId`.

After Restore:

- Current list contains it;
- Archived list no longer contains it;
- Related Ideas eligibility returns;
- Edit / Continue are available again.

Already non-archived + same version should be idempotent/no-write rather than timestamp churn.

Do not redesign dormant in T8.

---

## 12. Permanent Delete semantics

Delete means the user explicitly does not want this Idea retained by `dsh-idea` anymore.

No deleted lifecycle state exists.

Successful Delete removes:

```text
Idea aggregate
all immutable versions (inside aggregate)
all Idea-owned source snapshots (inside aggregate)
all evolution events (inside aggregate)
all IdeaDiscussion bindings for this Idea
```

After success:

```text
Current list = absent
Archived list = absent
Related Ideas = absent
get(id) = not found
```

Do not add `deleted`, `deletedAt`, Trash, recycle bin, or Deleted list.

---

## 13. Delete does NOT erase Harness conversations

Permanent Delete is scoped to dsh-idea-owned data.

It must not delete/rewrite/truncate:

- original Harness source conversation;
- continuation Harness Sessions;
- ordinary Session history.

If an Idea seed was already delivered into a continuation Session, that Session history remains Harness-owned.

Confirmation copy must say so accurately.

---

## 14. Delete confirmation UX

Use an explicit irreversible confirmation. Prefer Harness `RiskConfirmation`.

Suggested copy:

```text
永久删除 Idea？

将永久删除该 Idea、所有版本、Idea 保存的来源快照和讨论绑定。
已有 Harness 对话不会被删除。
此操作无法恢复。

[ ] 我知道此操作无法恢复

[取消] [永久删除]
```

Do not require typing the title unless a strong existing Harness convention requires it.

Permanent Delete is detail-only, never a HoverCard quick action.

---

## 15. Delete ordering under current storage architecture

Current storage has:

```text
ideas table
discussions table
```

and no cross-table transaction. Do not redesign storage in T8.

Use conservative order:

```text
1. establish per-Idea deleting guard
2. verify Idea exists and expectedCurrentVersionId matches
3. find all IdeaDiscussion records for this Idea
4. delete those discussion bindings first
5. delete Idea aggregate last
6. only then return success
7. release deleting guard in finally
```

Reason: successful Delete must never leave an orphan `IdeaDiscussion` able to resurface deleted Idea context.

If any step fails, do not report success. Operation remains retryable.

A process-local `deletingIdeaIds` guard (or equivalent) must reject/block competing mutations for that Idea while deletion runs, at minimum:

- manual edit;
- archive;
- restore;
- evolve;
- Continue Discussion.

Reads may continue until final aggregate removal; after success they return not found.

A crash after discussion cleanup but before aggregate deletion may leave the canonical Idea present with fewer/no continuation bindings. This is accepted under the current non-transactional V1 storage posture because success was never reported, the canonical Idea remains, retry can finish, and successful deletion never leaves a plugin binding to deleted context.

Do not add a durable product-visible deletion tombstone merely to hide this limitation.

---

## 16. Delete concurrency

Permanent Delete request carries `expectedCurrentVersionId`.

A stale request must fail before destructive work starts:

```text
version-conflict → zero delete work
```

Once deletion begins under the guard, competing new mutations must not be admitted.

After successful delete:

- repeated delete = Idea not found;
- stale proposal commit fails;
- UI refreshes out of detail.

---

## 17. Remote API

Add/adjust typed Remote contracts, equivalent to:

```ts
interface IdeaListRequest {
  view: 'current' | 'archived'
}

interface IdeaManualEditRequest {
  id: string
  expectedCurrentVersionId: string
  draft: IdeaDraft
}

interface IdeaArchiveRequest {
  id: string
  expectedCurrentVersionId: string
}

interface IdeaRestoreRequest {
  id: string
  expectedCurrentVersionId: string
}

interface IdeaDeleteRequest {
  id: string
  expectedCurrentVersionId: string
}
```

Manual-edit result must expose canonical new currentVersionId/ordinal/title and whether a semantic change was actually committed.

Lifecycle results may follow existing conventions but must provide enough canonical state for safe refresh.

Regenerate Typert.

Never expose storage aggregates on the wire.

---

## 18. Preview-card read projection

List wire may be expanded with the minimum projection needed for HoverCard.

At minimum:

```text
id
status
currentVersionId
title
core
currentConclusion
useWhen
openQuestionsCount
updatedAt
```

Do not ship full history or captured source bodies in every list row.

If cleaner, split list and detail projection types rather than further overloading the current summary type.

---

## 19. Related Ideas invariants

Do not redesign Related Ideas in T8.

Keep:

```text
Related != Similar
```

The model decision remains: would surfacing this saved Idea materially help the current discussion now?

Lifecycle effect only:

```text
non-archived → eligible
archived     → ineligible
restored     → eligible again
deleted      → absent
```

No proactive/background checks.

---

## 20. Client state design

Refactor the library state cleanly rather than stacking unrelated booleans.

Represent explicitly:

```text
selected list view
current-list load state
archived-list load state
open detail
manual edit lifecycle
archive lifecycle
restore lifecycle
delete confirmation/deleting lifecycle
existing continuation/evolution lifecycle
```

Suggested Manual Edit states:

```text
idle / loading / reviewing / committing / error / conflict
```

Suggested Delete states:

```text
closed / confirming / deleting / error
```

Tab/detail switches and disposal must not allow stale async results to apply to another Idea.

---

## 21. Manual Edit UI

The editor may be an in-section view or Modal, but must fit the existing Settings flow and shared Harness controls.

Requirements:

- all seven fields editable;
- existing required-field rules;
- Cancel = zero writes;
- normalized no-change disables Save;
- commit failure keeps edits visible;
- conflict keeps edits visible;
- success refetches detail/history;
- history immediately shows `manual-edit`.

No LLM call.

---

## 22. Archive / Restore UI

Current detail exposes Archive. Archived detail exposes Restore.

After confirmed Archive:

```text
absent Current
present Archived
```

After confirmed Restore:

```text
absent Archived
present Current
```

Do not claim success optimistically before Host confirmation.

Archived HoverCard may offer Restore, but full detail must also offer it.

---

## 23. Required domain tests

### Manual Edit

- exactly one new version;
- `reason=manual-edit`;
- ordinal increments once;
- prior version unchanged;
- new `sourceDiscussionIds=[]`;
- no new SourceDiscussion;
- one evolutionEvent;
- stale version = zero write;
- normalized no-op = zero write and updatedAt unchanged;
- archived rejects edit;
- reopen persistence preserves history/provenance.

### Archive

- active → archived;
- versions/sources/events unchanged;
- no new version/event;
- absent current list / present archived query;
- repeat archive no-write;
- stale expected version no-write.

### Restore

- archived → active;
- no version/event;
- current list returns;
- Related eligibility returns;
- repeat restore no-write;
- stale expected version no-write.

### Archived behavior

- Continue rejected;
- evolution commit rejected;
- Manual Edit rejected;
- reads/history remain available.

### Delete

- deletes active Idea;
- deletes archived Idea;
- removes aggregate;
- removes every IdeaDiscussion binding for that Idea;
- does not remove another Idea's discussions;
- get/current/archived/Related no longer expose it;
- stale version prevents cleanup;
- repeated delete = not found;
- delete failure never reports success;
- deleting guard prevents competing mutation admission.

Automated tests: zero real network/provider/model calls.

---

## 24. Required Remote tests

Prove:

- current list request returns non-archived only;
- archived list request returns archived only;
- list queries are zero-write;
- manualEdit success/no-op/conflict/archived/invalid draft;
- archive success/idempotency/conflict;
- restore success/idempotency/conflict;
- delete success/not-found/conflict/failure;
- no raw storage object crosses wire;
- generated Typert matches exact request shapes.

Add a dedicated stable `idea/*` product-state error for archived/unavailable mutation if needed; do not classify expected lifecycle state as generic gateway/internal.

---

## 25. Required Client tests

### List

- Current tab default;
- current row renders only title + one-line core + updated time;
- Archived tab switches data;
- no Deleted tab;
- switch is zero-write.

### Hover Preview

- pointer hover after bounded delay shows card;
- expected preview fields;
- max 3 useWhen entries;
- open-question count correct;
- row click opens detail;
- Edit quick action does not trigger row navigation;
- archived card has no Edit;
- hover is not required for keyboard/touch access.

### Manual Edit

- Edit from hover works;
- Edit from detail works;
- all seven values load;
- Cancel zero-write;
- no-change Save disabled;
- changed Save carries expectedCurrentVersionId + draft;
- success shows manual-edit history;
- conflict preserves form;
- archived detail has no Edit.

### Archive / Restore

- archive removes from Current after Host success;
- appears Archived;
- archived detail has Restore;
- restore returns Current.

### Delete

- detail-only;
- RiskConfirmation acknowledgement required;
- cancel zero-write;
- confirm carries expectedCurrentVersionId;
- success exits detail/removes item;
- no Deleted view;
- copy states existing Harness conversations remain.

### Regression

- Continue works for non-archived Ideas;
- evolution flow unchanged;
- Related UI unchanged.

---

## 26. Gate order

Use existing governance:

```text
implementation
→ focused tests
→ architecture/contract/scope audit
→ pre-full static/build gates
→ clean full plugin regression
→ executable checkpoint
→ real runtime/product E2E
→ docs-only acceptance
```

Required gates include:

```powershell
pnpm generate:typert
pnpm typecheck
pnpm build
pnpm build:client
git diff --check
pnpm test
```

If `pnpm verify` is canonical, it may wrap them, but record individual outcomes.

Do not run whole Harness monorepo Full.

Automated suite: `0 real provider/network/model calls`.

---

## 27. Executable checkpoint

After deterministic gates pass, commit executable changes.

Preferred subject:

```text
feat: refine idea library lifecycle
```

Push main and record:

```text
T8_TESTED_SHA
```

All runtime/browser acceptance must test that exact SHA.

Executable drift after E2E invalidates affected evidence.

---

## 28. Real zero-provider smoke

On `T8_TESTED_SHA`, boot a clean providerless Harness Web profile.

Verify:

- plugin loads;
- Ideas Settings loads;
- Current/Archived tabs render;
- empty states render;
- zero model calls;
- no console/page/failed-request errors;
- clean shutdown.

`--dump-config` is preflight only.

---

## 29. Real Playwright product acceptance

Use established:

```text
Claude Code → Playwright → real Chromium → real Harness localhost
```

Use fresh isolated acceptance storage.

Marker:

```text
DSH_IDEA_T8_E2E_<unique>
```

### A — Create baseline Idea

Real chat + Save Idea. Verify the Library row is lightweight.

### B — Hover Preview

Verify card, preview fields, max-3 useWhen, open-question count, Edit button. Capture screenshot.

### C — Manual Edit

Edit at least two fields and Save.

Verify:

```text
v1 unchanged
v2 reason=manual-edit
v2 sourceDiscussionIds=[]
edited content persisted
reload preserves v2
```

### D — Archive

Verify:

```text
absent Current
present Archived
archived detail readable
Edit absent
Continue absent
```

### E — Restore

Verify:

```text
absent Archived
present Current
Edit available
Continue available
```

### F — Continue regression

Continue once after Restore. Verify Host-authoritative workspace behavior, usable composer, frozen seed reaches real model, no duplicate conversation on re-arm.

Keep provider usage minimal.

### G — Permanent Delete

From detail:

- open Permanent Delete;
- confirm disabled before acknowledgement;
- test Cancel once with zero mutation;
- reopen, acknowledge, delete;
- absent Current;
- absent Archived;
- get/detail no longer resolves;
- no Deleted tab/list;
- original Harness conversation still exists;
- continuation Harness conversation still exists.

### H — Related lifecycle regression

Automated domain/Remote tests are authoritative for archive/delete eligibility. Real Related LLM pass is optional unless Related implementation itself changed beyond lifecycle filtering.

---

## 30. Runtime hygiene / cleanup gate

During testing:

- close browser tabs/windows once evidence is no longer needed;
- do not accumulate obsolete Harness windows;
- terminate obsolete Playwright/Chromium children between restarted attempts;
- stop obsolete Harness test servers;
- release test ports;
- remove temporary E2E workspaces/browser state when no longer needed;
- never close or mutate unrelated user windows/processes.

Final verification:

```text
test browser windows closed
Playwright/Chromium children exited
Harness test process exited
test ports released
temporary E2E assets cleaned
```

Record cleanup result.

---

## 31. Real-test failure policy

If real testing finds an executable defect:

```text
stop acceptance
→ reproduce
→ repair
→ focused tests
→ gates
→ full plugin regression
→ new T8_TESTED_SHA
→ rerun affected runtime/E2E
```

Do not reuse evidence from a superseded executable SHA.

Driver-only fixes outside repository are allowed but must be disclosed if repeated attempts were required.

---

## 32. Acceptance report

After successful E2E and no executable drift create:

```text
docs/DSH_IDEA_T8_LIBRARY_LIFECYCLE_ACCEPTANCE.md
```

Record:

- base SHA;
- T8_TESTED_SHA;
- Harness SHA;
- domain remains v3 / no migration;
- test count/files;
- static/build gates;
- Manual Edit invariants;
- Archive/Restore behavior;
- Delete behavior;
- HoverCard/list behavior;
- zero-provider smoke;
- Playwright A–G;
- provider disclosure;
- Related lifecycle regression;
- runtime cleanup;
- Harness unchanged;
- known limitations.

---

## 33. Docs-only acceptance commit

After executable acceptance is complete, commit only documentation.

Preferred subject:

```text
docs: record dsh-idea t8 acceptance
```

Record:

```text
T8_TESTED_SHA
T8_ACCEPTANCE_SHA
```

Push and verify:

```text
local HEAD == origin/main
working tree clean
Harness SHA unchanged
```

---

## 34. T8 success outcome

Only when all required acceptance passes:

```text
DSH_IDEA_T8_ACCEPTED
```

Report:

```text
T8_TESTED_SHA
T8_ACCEPTANCE_SHA
HARNESS_SHA
DOMAIN=idea/v3
TESTS=<count>/<files>
MANUAL_EDIT=PASS
ARCHIVE=PASS
ARCHIVED_LIST=PASS
RESTORE=PASS
PERMANENT_DELETE=PASS
HOVER_PREVIEW=PASS
ZERO_PROVIDER_SMOKE=PASS
PLAYWRIGHT_A_G=PASS
CONTINUE_REGRESSION=PASS
RUNTIME_CLEANUP=PASS
HARNESS_UNCHANGED=true
ORIGIN_VERIFIED=true
TREE=CLEAN
```

---

## 35. Explicit non-goals

Do not implement:

- PAH integration/API/adapter/database mapping;
- cross-Harness/PAH synchronization;
- automatic Idea detection;
- proactive resurfacing;
- embeddings/vector DB;
- semantic retrieval redesign;
- Idea Graph;
- merge/split;
- tags/folders;
- collaboration;
- Deleted list/recycle bin;
- automatic Project creation;
- automatic editing/evolution.

---

## 36. Product principles

> The Library is an index first, detail surface second.

> Hover is a convenience, never the only way to access an action.

> Manual Edit creates a new immutable version; it never rewrites history.

> Archive preserves the Idea and removes it from current use.

> Delete is permanent and leaves no dsh-idea Deleted collection.

> Existing Harness conversations are not owned by dsh-idea and are never erased by Idea deletion.

> Related Ideas continues to optimize for useful-now, not mere similarity.

> This entire task stays inside Harness. PAH integration remains intentionally deferred.
