# DSH Idea V1 — T3 Save Idea UI + Remote Commit Implementation Instructions

## 0. Task identity

Task: **DSH Idea V1 — T3 Save Idea UI + Remote Commit**

Plugin repository:

```text
D:\Harness\harness-plugin\dsh-idea
```

Public remote:

```text
https://github.com/Dhandil/dsh-idea
```

Accepted T2 checkpoint:

```text
9678ff4d
```

Authoritative Harness checkout, read-only:

```text
D:\Harness\deepseek-harness
```

Expected Harness baseline:

```text
c291e7961a515f6d7af9304e7fd1d257929aef26
```

Before editing: sync plugin `main`, verify clean tree, verify T2 checkpoint in history, verify Harness HEAD, and do not modify Harness core.

## 1. Research-derived design constraints

This task is designed after reviewing current product and plugin patterns.

External-product conclusions:
- NotebookLM / Gemini Notebook places “Save to Note” directly on chat responses, validating response-level capture as a low-friction entry point.
- NotebookLM saved response notes are immutable; Idea intentionally differs because it is a semantic long-lived asset whose extracted fields should be reviewed before commit.
- Open WebUI Actions use message-toolbar actions for explicit post-hoc operations such as pin/save-to-knowledge, supporting an explicit message-scoped Idea action instead of auto-detection.
- Critical persistence must be backend-owned, not only frontend-local state.

Harness-native conclusions:
- use `conversation.chat.assistant-actions` for the assistant-message entry;
- use `conversation.input.overlay` + `Modal` / `Toast` for preview and feedback;
- `ui-message-feedback` is the primary UI/lifecycle reference;
- Host Remote uses `TypertRemoteService` + `@Remote`;
- an external plugin does not need to edit `@deepseek-ai/dsh-api-remotes`; its client entry may import its own generated `./remote` contribution and mount it with `ctx.remote.$mount(contribution)`;
- keep this plugin external and do not patch Harness source.

## 2. T3 objective

Implement the complete explicit Save Idea path:

```text
finalized assistant message
  -> 💡 Idea action
  -> loading
  -> Remote: idea.prepareFromMessage(...)
  -> editable preview modal
  -> user Save
  -> Remote: idea.create(...)
  -> Host resolves preparationId
  -> Host validates edited draft
  -> IdeaService.create(draft, Host-owned source)
  -> durable Idea v1
  -> success toast
```

Critical authority rule:

> The browser may edit the semantic `IdeaDraft`, but it may never submit or replace canonical source provenance.

The persisted source must come from the Host-owned T2 preparation registry.

## 3. T3 scope

Implement:
1. external-plugin Typert Remote contribution;
2. external-plugin Web client bundle;
3. `idea` Remote namespace;
4. `prepareFromMessage` Remote adapter over T2;
5. `create` Remote commit path;
6. same-preparation idempotency / double-submit protection;
7. assistant-message `💡 Idea` action;
8. loading/error states;
9. mandatory editable preview modal;
10. Save / Cancel;
11. success/failure toast;
12. offline Host + Client tests;
13. generated Typert artifacts and package tests;
14. install/update local plugin into `web` profile only after focused gates pass;
15. startup/mount smoke with zero real provider calls;
16. Git checkpoint + push.

Do NOT implement Idea Library, Related Ideas, Continue Discussion, evolve UI, auto-detection, background resurfacing, embeddings/vector DB, PAH integration, or Harness-core changes.

## 4. T3.0 external-plugin delivery preflight

This is mandatory because T3 is the first task combining external Host plugin + generated Typert Remote + external Web client.

### 4.1 Typert generation

Inspect current:

```text
packages/typert/generator/
docs/cookbook/adding-a-remote-api.md
docs/api-gateway.md
```

The plugin must generate and ship its own:

```text
lib/typert.host.js
lib/typert.host.d.ts
lib/typert.remote-client.js
lib/typert.remote-client.d.ts
```

Expose exact current `./typert` and `./remote` package exports.

Prefer current `@deepseek-ai/dsh-typert-generator/tsdown` in package mode if compatible with the standalone workspace. Add only minimal standalone build/tsconfig wiring required by the generator.

Do not hand-write weak Remote codecs or duplicate the wire schema manually.

### 4.2 External client mounting

The client entry must import its own generated Remote contribution and mount it through public Client Remote APIs, conceptually:

```ts
import ideaRemote from '@dsh-external/dsh-idea/remote'

const disposeRemote = await ctx.remote.$mount(ideaRemote)
```

Use exact current types/signatures after inspection.

Do not edit `packages/api/remotes`.

### 4.3 Client bundle

Add a supported external Web entry:

```text
exports["./client"]
dsh.client.platform = "web"
dsh.client.inject = [...]
```

Use a current external plugin such as `dsh-better-sidebar` plus first-party UI packages as packaging references.

Do not use deprecated `@deepseek-ai/dsh-client-runtime`.

### 4.4 Shared package peers

Declare the host-shared runtime packages actually used by the plugin as peer dependencies with ranges compatible with the Harness baseline. Preserve single-instance host ownership.

For local development, continue using the plugin's `setup-dev` junction/link strategy where registry publication is unavailable.

Do not install duplicate nested Cordis / Typert / DSH service copies.

### 4.5 Stop condition

If strict standalone Typert generation cannot work without modifying Harness core, stop with:

```text
ARCHITECTURE_DECISION_REQUIRED
```

and report the exact blocker.

## 5. Remote namespace and methods

Use one namespace:

```text
idea
```

The Host controller extends `TypertRemoteService`.

Required methods:

```ts
prepareFromMessage(
  sessionId: string,
  messageId: string,
  signal: AbortSignal
): Promise<IdeaPreparationPreview>

create(
  preparationId: IdeaPreparationId,
  draft: IdeaDraft,
  signal: AbortSignal
): Promise<IdeaCreateResult>
```

If current Typert conventions prefer request objects, use them consistently while preserving these semantics.

Suggested create result:

```ts
interface IdeaCreateResult {
  ideaId: IdeaId
  currentVersionId: IdeaVersionId
  status: 'active'
  title: string
  createdAt: number
}
```

Do not expose `SourceDiscussionDraft` over the wire.

## 6. Remote failure vocabulary

Declare plugin-owned codes:

```text
idea/source-not-found
idea/source-unavailable
idea/model-unavailable
idea/model-failed
idea/invalid-model-output
idea/preparation-not-found
idea/invalid-draft
idea/storage-failed
```

Cancellation uses Harness carrier semantics:

```text
gateway/cancelled
```

Map T2 local failures deliberately. Unexpected defects remain `gateway/internal`; do not classify everything.

Do not expose secrets or raw credential values.

## 7. Commit semantics: one preparation must not create duplicates

UI disabling is insufficient. The Host must guarantee repeated `create()` for the same preparationId does not create duplicate Ideas during that preparation lifetime.

Implement Host-side single-flight/idempotent state:

```text
prepared
  -> committing
  -> committed(result)
```

Rules:
1. validate edited draft first;
2. resolve canonical source from T2 registry;
3. transition to `committing` before awaiting durable create;
4. concurrent duplicate calls join/await the same in-flight operation or return the same eventual result;
5. after success retain `committed(result)` until preparation expiry;
6. repeated calls after success return the same result with zero extra writes;
7. invalid draft never begins commit;
8. durable failure clears in-flight state back to retryable prepared state;
9. do not cache failed writes as success;
10. restart losing the preparation is acceptable V1 behavior.

Add tests proving one durable Idea under concurrent/repeated create calls.

## 8. Edited draft authority

The model proposal is not final. Browser submits only edited `IdeaDraft` + `preparationId`.

Host must:
1. validate with `ideaDraftSchema`;
2. reject invalid edit before write;
3. resolve source only from preparationId;
4. call `IdeaService.create(validatedDraft, prepared.source)`.

Browser cannot alter:

```text
sessionId
anchorMessageId
startSeq
endSeq
capturedContext
```

No source fields belong in the create request.

## 9. Assistant-message action

Register in:

```text
conversation.chat.assistant-actions
```

Suggested identity:

```text
id: idea
order: 20
```

Do not replace/reorder core actions unnecessarily.

Visual requirement: `💡` with accessible label / tooltip `保存为 Idea`.

If primitives have no bulb icon, use the glyph inside the normal action button rather than modifying core icons.

Do not modify `MessageIconActions.tsx`.

## 10. Action loading behavior

Clicking `💡`:
1. starts exactly one prepare call for that message;
2. shows local loading/disabled state for that action;
3. repeated clicks while pending do not start another call;
4. success opens preview modal;
5. failure clears loading and shows safe toast;
6. cancellation from session unmount/navigation should not show a scary failure toast.

Keep state per Session. Do not block the whole chat.

## 11. Preview modal

Use Harness-native primitives and `conversation.input.overlay`, following `ui-message-feedback` lifecycle style.

Title:

```text
保存 Idea
```

Preview is mandatory; no direct durable save.

Editable fields:

```text
标题 *                 single-line input
核心想法 *             textarea
为什么值得保留 *       textarea
当前结论               textarea
可能价值               textarea
适用场景               multiline, one item per line
待解决问题             multiline, one item per line
```

Required fields: `title`, `core`, `motivation`.

Arrays use newline-separated editor text:
- trim each line;
- drop empty lines;
- preserve order.

Do not build a complex tag editor in V1.

Show a small read-only source summary, e.g.:

```text
来源：当前对话 · 4 条消息
```

Do not dump full captured source by default. Model route need not be prominent.

Footer:

```text
取消
保存
```

Cancel closes modal with zero durable Idea writes. It is acceptable for the ephemeral preparation to remain until TTL eviction.

Save disabled while submitting and when required fields are blank after trim.

Escape/close behaves like Cancel when not committing.

## 12. Save behavior

Save calls:

```text
remote.idea.create(preparationId, editedDraft)
```

Success:
- close modal;
- clear local preview state;
- show `Idea 已保存` toast;
- no automatic navigation in T3.

Durable failure:
- keep modal open;
- preserve edited draft;
- re-enable Save;
- show failure feedback;
- allow retry.

Expired preparation:
- keep edited draft visible;
- show `预览已过期，请关闭后重新点击 💡 生成`;
- do not silently rerun model and overwrite edits.

## 13. Client Remote handling

Unary calls return `RemoteResult<T>`.

Branch on:

```ts
if (!result.ok) { ... }
```

by stable error code. Do not add defensive catch around normal Remote calls.

Client lifecycle:
1. mount own generated Remote contribution;
2. register UI only after mount is ready;
3. dispose UI then Remote contribution in reverse lifecycle order.

Avoid static injection of `remote.idea` before the namespace has been mounted if current Cordis lifecycle makes it unavailable.

## 14. Client state architecture

Use one per-Session surface/controller, similar in spirit to feedback.

Suggested state:

```ts
interface IdeaSaveState {
  preparingMessageId: MessageId | null
  modal: null | {
    preparationId: IdeaPreparationId
    draft: EditableIdeaDraft
    sourceInfo: IdeaPreparationSourceInfo
  }
  submitting: boolean
  failure: null | IdeaUiFailure
  toastSeq: number
}
```

Exact representation may differ.

Requirements:
- no canonical Idea persistence in browser state;
- local state is interaction state only;
- session unmount disposes pending abort controllers;
- reconnect does not invent a new preparation;
- preparation refs may expire.

## 15. Localization

Provide at least `zh` and `en` in plugin-owned locale namespace.

Include action, modal fields, source summary, Save/Cancel, preparing/saving, success, meaningful failures, and expiry copy.

Do not scatter hard-coded user-visible strings through components.

## 16. Host tests

All offline; no real provider/network calls.

Required:
- Remote prepare delegates to T2;
- T2 failures map to expected `idea/*` codes;
- carrier cancellation remains cancellation;
- create validates edited draft;
- create never accepts browser source provenance;
- create resolves canonical T2 source;
- successful create persists exactly one Idea;
- repeated same prep returns same result;
- concurrent same prep performs one `IdeaService.create`;
- failed durable write remains retryable;
- unknown/expired prep -> `idea/preparation-not-found`;
- storage failure -> `idea/storage-failed`;
- generated Remote contribution loads/mounts under test where supported.

## 17. Client tests

Use current client test runtime / slot patterns.

Cover:
- plugin mounts its own Remote contribution;
- `💡` action appears in assistant-actions;
- click invokes prepare with correct sessionId + messageId;
- duplicate click while preparing => one call;
- loading state;
- prepare success opens modal;
- all seven fields populated;
- editing fields updates local draft;
- newline arrays normalize correctly;
- Cancel => no create;
- Save sends only preparationId + edited draft;
- Save double-click => one create request;
- success closes + toast;
- storage failure keeps modal + draft;
- expired preparation shows explicit copy;
- session unmount cancels pending prepare;
- narrow viewport usable;
- feedback and Idea action coexist.

No live Host/provider in focused client tests.

## 18. Build/package tests

Built package must contain:

```text
Host runtime
preparation runtime
generated typert host artifact
generated remote client artifact
client.js
types
cordis.patch.yml
```

Run isolated/consumer resolution smoke for:

```text
@dsh-external/dsh-idea
@dsh-external/dsh-idea/preparation
@dsh-external/dsh-idea/remote
@dsh-external/dsh-idea/client
```

No source-only runtime accident.

## 19. Local web-profile install and smoke

Only after focused tests + typecheck + build + diff-check pass, install/update the local package through the official plugin mechanism.

Use exact current CLI-supported local spec; prefer documented `file:` form if required.

Target profile: `web`.

Do not manually edit Harness source.

Preserve unrelated plugin state, including `dsh-better-sidebar`.

Then:
1. start `pnpm dsh web`;
2. verify Host boots without loader/peer/Remote/client-bundle errors;
3. verify Idea client module mounts;
4. verify no duplicate Remote namespace;
5. verify normal chat loads.

Automated startup smoke must perform **0 real LLM/provider model calls**.

Do not click the action in automated smoke if that would invoke a real provider.

## 20. Quality gates

Required order:

```text
Implementation
-> Host focused tests
-> Client focused tests
-> Remote/codegen/package tests
-> typecheck
-> build
-> lint/format if configured
-> git diff --check
-> local web-profile install/update
-> zero-provider startup/mount smoke
```

Do not run full Harness monorepo suite.

## 21. Git governance

Repository: `D:\Harness\harness-plugin\dsh-idea`

Branch: `main`

Do not rewrite accepted T1/T2 history.

Suggested checkpoint:

```text
feat: add save idea remote and preview UI
```

Push and verify:

```powershell
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
git status
```

Local HEAD and remote `main` must match.

## 22. Completion report

Return only:

```text
Outcome
Base / Harness reference
Research/preflight result
Changed paths
Remote/codegen design
Commit idempotency design
UI flow
Client bundle/install design
Tests
Typecheck/build/static gates
Web-profile startup smoke
Real provider/network call count
Checkpoint commit
Remote verification
Known limitations
Next task
```

Expected next task:

```text
T4 — Idea read/list surface
```

Do not start T4 automatically.

## 23. Stop conditions

Stop with `ARCHITECTURE_DECISION_REQUIRED` if:
1. strict Typert Remote generation cannot be supported from the standalone plugin without core changes;
2. external client cannot mount its own generated Remote contribution through public APIs;
3. current Web plugin loader cannot serve the client bundle without modifying Harness;
4. official profile plugin mechanism cannot install/mount the built package without replacing unrelated profile state.

Do not bypass these with private core edits or handwritten weak RPC.

## 24. T3 acceptance principle

> **The user explicitly chooses the assistant message, the model proposes, the user edits, and only Save commits.**

> **The browser owns interaction state; the Host owns source provenance and durable write authority.**

> **One preparationId produces at most one durable Idea within its lifetime, even under duplicate client requests.**
