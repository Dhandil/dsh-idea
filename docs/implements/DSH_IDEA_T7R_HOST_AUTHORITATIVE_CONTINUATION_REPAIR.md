# DSH Idea V1 — T7R Host-Authoritative Continuation Repair & Re-Acceptance

## 0. Task identity

Task:

T7R — Host-Authoritative Continuation Workspace Repair & V1 Re-Acceptance

Repository:

D:\Harness\harness-plugin\dsh-idea

Current main / prior acceptance commit:

e086a95b97c9dca897e7ef234b6a4ee7792854b5

Prior executable candidate:

abebbd8d933acd2b5115ca38b3787901bfa1c562

Harness reference, read-only:

D:\Harness\deepseek-harness

Expected Harness SHA:

c291e7961a515f6d7af9304e7fd1d257929aef26

Do not modify Harness core.

The prior real E2E correctly exposed and repaired a workspace-binding defect, but remote review of that repair found one remaining Host trust-boundary issue. This repair supersedes the previous final acceptance SHA; do not rewrite history.

---

## 1. Blocking issue

The current continuation repair lets the browser submit:

```ts
IdeaContinueDiscussionRequest {
  id: string
  conversationId?: string
}
```

and the Host adopts that `conversationId` when no other IdeaDiscussion already uses it.

Current Host logic does not prove that the client-provided Session:

- was created for this continuation;
- is blank;
- belongs to a Workspace;
- even exists before adoption;
- is not an unrelated existing conversation.

A buggy or crafted client can therefore bind an IdeaDiscussion to an arbitrary Session id, causing the continuation seed to be injected into an unrelated conversation on its next accepted user turn.

This violates the established boundary:

> The browser may request an operation, but the Host must own and validate canonical execution identity.

The real E2E fix solved the Web composer problem but made Session identity browser-authoritative. T7R must move workspace selection across the wire, not Session identity.

---

## 2. Frozen repair decision

Replace the client-prepared Session contract with a Host-created workspace-bound Session.

New flow:

```text
Client determines target Workspace
        |
        v
idea.continueDiscussion({ id, workspaceId? })
        |
        v
Host sessionController.create({ workspaceId })
        |
        v
Harness validates Workspace
Harness creates canonical Session
Harness attaches Session to Workspace
        |
        v
IdeaService stores resulting conversationId
```

The client must NOT create a Session first and must NOT send `conversationId`.

The Host must be the sole creator/owner of the continuation conversation identity.

---

## 3. Remote request shape

Change:

```ts
interface IdeaContinueDiscussionRequest {
  id: string
  conversationId?: string
}
```

to:

```ts
interface IdeaContinueDiscussionRequest {
  id: string
  workspaceId?: string
}
```

Remove `conversationId` from this request surface entirely.

Regenerate Typert.

No compatibility shim for client-supplied `conversationId` is required for this private V1 plugin wire contract. Do not keep both fields.

---

## 4. Client behavior

The current client helper calls:

```text
uiWorkspace.connectWorkspace(workspaceId)
```

which creates/reuses a blank Session and returns its id.

Stop doing that for Idea Continue.

Instead, resolve only the target Workspace id.

Keep the current target-selection policy:

```text
current Session's Workspace
else most recently updated Workspace
else undefined
```

Return:

```text
workspaceId | undefined
```

to the Idea read surface.

Then call:

```ts
remote.continueDiscussion(
  workspaceId === undefined
    ? { id }
    : { id, workspaceId }
)
```

Do not call `connectWorkspace()` before the Remote request.

Do not create an orphan blank Session on the client.

---

## 5. Host behavior

Change the continuation conversation seam to something equivalent to:

```ts
private async createConversation(workspaceId?: string): Promise<string>
```

Resolve `sessionController` lazily as today.

If `workspaceId` is present, delegate to the canonical Harness API:

```ts
sessions.create({ workspaceId: ... })
```

using the correct pinned Harness type/brand.

If absent:

```ts
sessions.create({})
```

remains the deployment fallback.

The Host must use Harness's own Session Controller to:

- validate the Workspace id;
- choose the canonical Workspace path;
- create the Session;
- attach it to that Workspace.

Do not independently reproduce Workspace membership rules.

Do not accept a browser-supplied Session id.

Do not patch Harness core.

---

## 6. Error semantics

If Host Session creation / Workspace validation fails:

- create no IdeaDiscussion;
- create no partial continuation binding;
- surface a stable existing continuation/conversation error, or a narrowly defined new Idea wire error if required by the current error architecture.

Do not silently fall back from an explicitly supplied invalid workspace to an unbound default Session.

Fallback to `sessions.create({})` is only for:

```text
workspaceId absent
```

not for:

```text
workspaceId present but invalid/failing
```

---

## 7. Domain idempotency remains unchanged

Keep the existing domain rule:

```text
same ideaId + same currentVersionId + active discussion
→ reuse existing IdeaDiscussion
→ conversation creator callback is not invoked
```

Therefore repeated Continue Discussion for the same current version must not create another Session even if the client supplies a Workspace id again.

Do not change Discussion durability or lifecycle semantics.

---

## 8. Required focused tests — Remote / Host

Prove:

### A. Workspace-bound create

Request:

```ts
{ id, workspaceId: "workspace-a" }
```

causes exactly one Host call equivalent to:

```ts
sessionController.create({ workspaceId: "workspace-a" })
```

and stores the returned canonical Session id in the IdeaDiscussion.

### B. No client Session adoption surface

The request type/wire codec no longer accepts or exposes `conversationId`.

### C. Invalid workspace

If Session Controller rejects the workspace:

```text
no IdeaDiscussion write
no Idea mutation
visible Remote failure
no fallback sessions.create({})
```

### D. No workspace supplied

Request:

```ts
{ id }
```

uses:

```ts
sessionController.create({})
```

as the deployment fallback.

### E. Idempotent reuse

Once the active same-version discussion exists, another Continue request:

```text
does not call sessionController.create again
returns the existing conversationId
```

### F. No unrelated-session hijack

Add a regression proving there is no code path where a caller-supplied Session id can become `IdeaDiscussion.conversationId`.

---

## 9. Required focused tests — Client

Prove:

- client resolves current Workspace id when available;
- otherwise selects most recent Workspace id;
- otherwise sends `{ id }`;
- client no longer calls `uiWorkspace.connectWorkspace()` for Idea Continue;
- Remote request carries `workspaceId`, never `conversationId`;
- success opens the Host-returned conversation id;
- failed Remote call preserves the visible Continue error state;
- existing evolution re-arming/idempotency behavior remains intact.

---

## 10. Continuation context regression

Re-run continuation focused tests proving:

```text
workspace-bound Host-created Session
→ IdeaDiscussion.conversationId
→ first real accepted prompt
→ exactly one frozen Idea seed
→ model-visible before current user prompt
```

Keep:

- durable exactly-once detection;
- restart/resume no duplicate seed;
- no transcript replay;
- no provider call during Continue creation.

---

## 11. Full automated gates

After focused repair tests:

```text
pnpm generate:typert
pnpm typecheck
pnpm build
pnpm build:client
git diff --check
pnpm test
```

Use the project's normal accepted order if `verify` already expresses all required gates, but explicitly record each result.

All automated tests:

```text
0 real provider/network/model calls
```

Do not run the entire Harness monorepo Full.

---

## 12. New executable checkpoint

Because this is executable drift after the prior V1 acceptance, the old:

```text
V1_TESTED_SHA = abebbd8...
```

is superseded.

Commit the repair.

Preferred subject:

```text
fix: make continuation workspace host-authoritative
```

Push `main`.

Record the new full SHA as:

```text
V1_TESTED_SHA
```

All runtime and E2E evidence below must use that exact SHA.

---

## 13. Real zero-provider smoke

Repeat the real zero-provider Web boot on the new tested SHA.

Verify:

- app ready/listening;
- Ideas UI loads;
- no plugin/Remote/client errors;
- 0 model calls;
- clean termination.

---

## 14. Real Playwright product E2E

Because the continuation wire/runtime changed, rerun the full A–E product E2E from clean isolated acceptance storage for one unambiguous final baseline.

Use:

```text
Playwright
real Chromium
real Harness Web
real configured Harness provider/model
```

Required:

```text
A Save Idea PASS
B Persistence PASS
C Continue seed PASS
D Evolution PASS
E Related Ideas positive path PASS
```

For Scenario C specifically verify:

1. Continue Discussion opens a Session already belonging to the selected Workspace;
2. composer is immediately usable;
3. current user prompt does not contain the unique marker;
4. model returns the marker from frozen Idea context;
5. no unrelated pre-existing Session was adopted.

Capture clean console/page/failed-request evidence again.

---

## 15. Acceptance-report consistency correction

The current acceptance report contains a wording contradiction:

Section 5 says:

```text
the user's real ~/.dsh ... were not modified
```

while Section 9 correctly records that:

```text
~/.dsh/settings.yaml baseURL was corrected
```

The final report must distinguish:

```text
the isolated E2E home/profile did not use or mutate the normal profile during A–E
```

from:

```text
earlier T7 environment diagnosis did modify ~/.dsh/settings.yaml, with backup retained
```

Do not state globally that `~/.dsh` was unmodified.

This is documentation correction only.

---

## 16. Update final acceptance report

After the new executable SHA passes all gates and E2E, update:

```text
docs/DSH_IDEA_V1_ACCEPTANCE_REPORT.md
```

Replace the old tested SHA with the new one.

Update:

- continuation implementation description;
- wire contract (`workspaceId`, not `conversationId`);
- automated test count;
- runtime smoke evidence;
- E2E evidence;
- environment wording;
- any affected limitations.

The accepted limitation should no longer say that Web continuation depends on client-created workspace-bound conversations. Instead describe the actual V1 behavior:

```text
Web client chooses a Workspace;
Host Session Controller creates and attaches the continuation Session.
Deployments with no Workspace selection fall back to the Host default Session.
```

Do not claim behavior not tested.

---

## 17. Docs-only re-acceptance commit

After successful E2E:

No executable changes are allowed.

Commit only the updated acceptance documentation.

Preferred subject:

```text
docs: update dsh-idea v1 acceptance
```

Record:

```text
V1_TESTED_SHA = new executable repair SHA
V1_ACCEPTANCE_SHA = new docs-only acceptance SHA
```

Push `main`.

Verify:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/main
git status
```

Working tree clean.

Harness tracked SHA unchanged.

---

## 18. Final accepted outcome

Only then report:

```text
DSH_IDEA_V1_ACCEPTED
```

with:

```text
V1_TESTED_SHA
V1_ACCEPTANCE_SHA
Harness SHA
domain version 3
test count
Host-authoritative workspace continuation PASS
zero-provider runtime PASS
Playwright A/B/C/D/E PASS
console/page/failed requests clean
Harness core unchanged
origin/main verified
working tree clean
```

Do not enter V2 / PAH / Memory / Knowledge.

---

## 19. Final principle

> The browser may select a Workspace, but it must never nominate the canonical Session that receives an Idea seed.

> Session identity and Workspace attachment are Host-owned through the Harness Session Controller.

> A continuation seed must never be attachable to an arbitrary pre-existing conversation through a client-controlled id.
