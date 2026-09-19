# DSH Idea — T8R2 Per-Idea Mutation Serialization Repair

## 0. Task identity

Status:

```text
T8_ACCEPTANCE_REOPENED_FOR_MUTATION_SERIALIZATION_REPAIR
```

Repository:

```text
D:\Harness\harness-plugin\dsh-idea
```

Start from current `main`:

```text
c8fdd409adee0f551085d16cd13d33c347758351
```

Superseded executable acceptance candidate:

```text
547cfc8816e9dba3b8d73c1eb7136dc1248bed74
```

Harness is read-only:

```text
D:\Harness\deepseek-harness
```

Pinned Harness SHA:

```text
c291e7961a515f6d7af9304e7fd1d257929aef26
```

This is a focused T8 concurrency/correctness repair. Do not enter V2, PAH, Memory, Knowledge, embeddings, proactive resurfacing, Idea Graph, or unrelated UI work.

## 1. Remote review finding

T8R correctly fixed archived `prepareEvolution`.

A second correctness issue remains in the T8 permanent-delete design: the current process-local `deleting` Set only rejects mutations that begin **after** Delete has already acquired the guard. It does not serialize Delete against mutations that were admitted immediately before Delete and are still in flight.

This matters because an Idea lifecycle operation spans more than one storage job:

```text
read lifecycle state
→ sometimes await external I/O
→ one or more storage writes
```

The pinned Harness storage domain has one per-domain write chain, but that chain serializes only `put/delete/update` jobs. It does not serialize the service-level reads and external awaits surrounding those writes.

Therefore the current T8 service is not fully serializable at the Idea lifecycle boundary.

## 2. Concrete race A — Continue Discussion can recreate an orphan binding after successful Delete

Current `continueDiscussion`:

```text
get Idea
→ archived/deleting check
→ inspect existing discussions
→ await createConversation()
→ put IdeaDiscussion
```

Current `deleteIdea`:

```text
set deleting guard
→ get Idea + expected-version check
→ snapshot discussion bindings
→ delete bindings
→ delete Idea aggregate
→ clear guard
```

Bad interleaving:

```text
C1 Continue starts first
C2 Continue passes deleting check
C3 Continue awaits Host createConversation()

D1 Delete starts
D2 Delete acquires deleting guard
D3 Delete sees no new binding yet
D4 Delete deletes Idea aggregate
D5 Delete returns SUCCESS and clears guard

C4 createConversation resolves
C5 Continue writes IdeaDiscussion from its stale pre-delete snapshot
C6 Continue returns SUCCESS
```

Final state:

```text
Idea aggregate     absent
IdeaDiscussion     present
```

This violates the frozen invariant:

> A successful permanent Delete must never leave an orphan IdeaDiscussion capable of resurfacing deleted Idea context.

The T8 test only covered the opposite order:

```text
Delete starts first
→ later mutations see deleting
```

It did not cover a mutation admitted immediately before Delete.

## 3. Concrete race B — stale Delete can erase a newly committed version

Current version-changing operations (`manualEdit`, `evolve`) check the deleting Set, then enqueue an atomic storage-domain `update`.

Bad interleaving:

```text
M1 manualEdit starts first
M2 manualEdit passes deleting guard
M3 records.update(v1 → v2) is queued but not durable yet

D1 Delete starts
D2 Delete reads in-memory v1 before queued update lands
D3 expectedCurrentVersionId=v1 passes
D4 Delete queues records.delete behind the already queued update

storage chain:
  update v1→v2
  delete current record

M4 manualEdit returns SUCCESS(v2)
D5 Delete returns SUCCESS
```

Both operations succeed.

That result is not serializable:

- if Edit linearized first, Delete with expected v1 must conflict;
- if Delete linearized first, Edit must fail not-found.

Therefore optimistic version protection is not actually preserved across the complete service operation.

## 4. Root cause

Pinned Harness storage-domain behavior:

```text
one per-domain write chain
put/delete/update serialize at their chain slots
synchronous get()/entries() are current in-memory snapshots
```

This is correct storage behavior.

The bug is in dsh-idea's service-level lifecycle: the operation's authority check and all of its asynchronous work are not enclosed in one per-Idea serialization boundary.

Do not modify Harness storage-domain.

## 5. Required architecture repair

Introduce a **per-Idea service-level mutation queue / serialization tail** in `IdeaService`.

The queue must serialize the entire lifecycle of all Idea mutations, not only their final storage call.

At minimum serialize:

```text
manualEdit
archive
restore
evolve
continueDiscussion
deleteIdea
```

`create` does not need this queue because the Idea id does not exist before creation.

Reads remain synchronous/read-only.

The implementation may use:

```ts
Map<IdeaId, Promise<void>>
```

or an equivalent small per-Idea queue.

Do not add a new dependency.
Do not redesign the storage schema.

## 6. Admission semantics

Preserve the existing product meaning of `idea/deleting`.

### Mutation admitted before Delete

If an ordinary mutation was admitted before Delete:

```text
ordinary mutation
→ completes/fails in its per-Idea queue slot
→ Delete runs after it
```

Delete must re-evaluate canonical state at its own queue turn.

Consequences:

- prior `manualEdit/evolve` changed currentVersion → stale Delete gets `version-conflict`, zero destructive work;
- prior `continueDiscussion` completed a binding → Delete sees and removes that binding before aggregate deletion;
- prior archive/restore changed only status → Delete may still proceed if expected version remains current.

### Delete admitted first

When Delete is admitted:

```text
deleting.add(ideaId)
```

must happen synchronously at Delete admission.

Any later ordinary mutation while that Delete is queued/running must fail immediately with:

```text
IdeaError('deleting')
→ idea/deleting
```

Do not silently queue new work behind a pending Delete.

### Prior admitted work must not be poisoned

An operation that was already admitted before Delete must be allowed to finish its queue slot.

Do not make that earlier operation fail merely because Delete set `deleting` after it was admitted.

This means the deleting check belongs at **admission**, not as a late check inside a previously admitted operation.

## 7. Suggested queue shape

Equivalent designs are acceptable. The intended semantics are:

```ts
private readonly mutationTails = new Map<IdeaId, Promise<void>>()
private readonly deleting = new Set<IdeaId>()

private enqueueIdeaMutation<T>(
  ideaId: IdeaId,
  operation: () => Promise<T>,
): Promise<T> {
  // ordinary admission: reject if Delete already admitted
  // append to per-Idea tail
}

private enqueueDelete<T>(
  ideaId: IdeaId,
  operation: () => Promise<T>,
): Promise<T> {
  // reject second Delete
  // synchronously mark deleting
  // enqueue behind work already admitted for this Idea
  // clear deleting in finally
}
```

Queue tails must settle after failures so one rejected mutation never poisons later operations.

Remove idle map entries when safe to avoid unbounded tail retention.

Do not rely on the storage-domain write chain alone.

## 8. Move lifecycle reads/checks inside the serialized operation

For correctness, the queue slot must enclose the authoritative reads and checks, not merely wrap the last write.

Manual Edit:

```text
admit per-Idea mutation
  ↓
inside queue turn:
  get canonical Idea
  archived check
  expected version / no-op semantics
  atomic mutate
```

Delete:

```text
synchronously mark deleting at admission
  ↓
wait for already-admitted per-Idea operations
  ↓
inside Delete queue turn:
  get canonical Idea
  expectedCurrentVersionId check
  enumerate current IdeaDiscussion bindings
  delete bindings
  delete aggregate
  return success
  ↓
finally clear deleting
```

Continue Discussion:

```text
admit per-Idea mutation
  ↓
inside queue turn:
  get current Idea
  archived check
  reusable-discussion check
  await Host createConversation
  put binding
  return
```

Holding the per-Idea queue slot across `createConversation()` is intentional: it is part of the lifecycle transaction even though Harness Session creation is not owned by the Idea domain.

## 9. Continue / Delete semantics after repair

Required deterministic outcome when Continue was admitted first:

```text
Continue starts
→ awaits Host Session creation

Delete called while Continue is in flight
→ Delete marks deleting
→ Delete waits behind Continue

Continue completes binding successfully

Delete reaches its turn
→ sees same expected Idea version
→ sees newly created binding
→ deletes binding
→ deletes Idea
→ returns success
```

Final plugin-owned state:

```text
Idea absent
IdeaDiscussion absent
```

Harness continuation Session remains, because dsh-idea never deletes Harness conversations.

No successful Delete may finish before the earlier admitted Continue's binding has been accounted for.

## 10. Version-changing mutation / Delete semantics after repair

Required deterministic outcome when Manual Edit was admitted first:

```text
Manual Edit(expected v1)
→ commits v2
→ returns success

Delete(expected v1)
→ runs next
→ reads canonical v2
→ rejects version-conflict
→ zero discussion delete
→ zero aggregate delete
```

Idea v2 remains.

## 11. Do not broaden to cross-process guarantees

This repair is process-local, matching the current dsh-idea service model.

Do not claim cross-process linearizability.
Do not introduce database transactions or locks outside the existing process.

The acceptance claim is:

```text
same Idea, same Host process:
service-level mutations are serialized in admission order
```

## 12. Focused deterministic race tests

Use Promise gates/spies; do not rely on timing sleeps.

### R1 — Continue admitted before Delete

Arrange `createConversation()` behind a controllable Promise.

Sequence:

```text
start Continue
prove it reached createConversation wait
start Delete(expected current version)
prove Delete has not completed
release createConversation
await both
```

Expected:

```text
Continue = success
Delete = success
Idea absent
new IdeaDiscussion absent
no orphan binding by conversation id
```

Also prove a third mutation started after Delete admission receives `deleting`.

### R2 — Manual Edit admitted before stale Delete

Start Manual Edit and Delete without awaiting Edit completion; use a gate if necessary to force overlap.

Expected:

```text
Manual Edit = success, currentVersion v2
Delete(expected v1) = version-conflict
Idea remains at v2
no destructive discussion cleanup
```

This test must fail on the old T8 implementation and pass on the repaired serialization.

### R3 — Delete admitted first

Retain/strengthen:

```text
Delete in flight
later manualEdit/archive/restore/evolve/continue
→ all idea/deleting
```

### R4 — queue survives failure

Force one admitted mutation to reject.

Then a later non-delete mutation for the same Idea must still execute.

### R5 — failed Delete releases admission

Keep:

```text
Delete fails
→ no false success
→ deleting clears
→ retry admitted
```

### R6 — different Ideas remain independent

A slow mutation on Idea A must not block an operation on Idea B.

This proves the queue is per-Idea, not global.

## 13. Regression tests

Keep all existing T8/T8R behavior:

- archived `prepareEvolution` blocked before Session/model/proposal work;
- Manual Edit immutable vNext;
- no-op edit zero-write;
- Archive/Restore idempotency;
- archived mutation boundaries;
- permanent delete ownership;
- Related lifecycle filtering;
- Host-authoritative continuation;
- UI tabs/hover/delete confirmation;
- existing Harness conversations survive Idea deletion.

Automated tests: zero real provider/network/model calls.

## 14. Gate order

Run focused race tests first.

Then:

```powershell
pnpm generate:typert
pnpm typecheck
pnpm build
pnpm build:client
git diff --check
pnpm test
```

Do not run the full Harness monorepo suite.

## 15. Executable checkpoint

Preferred commit:

```text
fix: serialize idea lifecycle mutations
```

Push `main`.

Record:

```text
T8R2_TESTED_SHA
```

The previous executable:

```text
547cfc8816e9dba3b8d73c1eb7136dc1248bed74
```

is superseded as the T8 accepted executable candidate, but remains in history.

## 16. Runtime acceptance

Because executable lifecycle semantics changed, rebind acceptance evidence to the new SHA.

### Zero-provider smoke

Re-run clean providerless Harness Web smoke:

```text
Ideas loads
Current/Archived tabs load
0 model requests
0 console/page/failed-request errors
clean shutdown
```

### Real Playwright A–G

Re-run the established T8 A–G suite on clean isolated acceptance storage:

```text
A Save baseline Idea
B Hover Preview
C Manual Edit
D Archive
E Restore
F Continue regression
G Permanent Delete
```

The concurrency race itself is proved by deterministic service tests; no need to manufacture it through browser UI.

Keep provider use minimal.

## 17. Runtime hygiene

During/after browser testing:

- close obsolete test tabs/windows;
- stop obsolete Harness servers;
- terminate obsolete Playwright/Chromium children;
- release test ports;
- delete token-bearing temporary logs;
- do not touch unrelated user browser windows/processes.

Final report must record cleanup.

## 18. Acceptance report

Update:

```text
docs/DSH_IDEA_T8_LIBRARY_LIFECYCLE_ACCEPTANCE.md
```

Record explicitly:

- `547cfc8...` superseded;
- new `T8R2_TESTED_SHA`;
- per-Idea service-level mutation serialization;
- Continue-before-Delete race proof;
- ManualEdit-before-stale-Delete race proof;
- Delete-first `deleting` proof;
- queue failure recovery;
- cross-Idea independence;
- final test count/files;
- fresh zero-provider smoke;
- fresh A–G Playwright;
- Harness unchanged;
- cleanup complete.

Then make a docs-only commit.

Preferred subject:

```text
docs: update dsh-idea t8 acceptance
```

Record:

```text
T8R2_ACCEPTANCE_SHA
```

Verify:

```text
local HEAD == origin/main
working tree clean
Harness SHA unchanged
```

## 19. Final outcome

Only after all acceptance passes:

```text
DSH_IDEA_T8_ACCEPTED
```

with:

```text
T8_TESTED_SHA=<new T8R2 executable SHA>
T8_ACCEPTANCE_SHA=<new docs-only SHA>
HARNESS_SHA=c291e7961a515f6d7af9304e7fd1d257929aef26
DOMAIN=idea/v3
ARCHIVED_PREPARE_EVOLUTION=BLOCKED_BEFORE_MODEL
PER_IDEA_MUTATION_SERIALIZATION=PASS
CONTINUE_BEFORE_DELETE_NO_ORPHAN=PASS
STALE_DELETE_AFTER_PRIOR_EDIT=VERSION_CONFLICT
DELETE_FIRST_LATER_MUTATIONS=DELETING
QUEUE_FAILURE_RECOVERY=PASS
TESTS=<count>/<files>
ZERO_PROVIDER_SMOKE=PASS
PLAYWRIGHT_A_G=PASS
RUNTIME_CLEANUP=PASS
HARNESS_UNCHANGED=true
ORIGIN_VERIFIED=true
TREE=CLEAN
```

Do not enter V2 / PAH / Memory / Knowledge.
