# DSH Idea V1 — T1 Domain & Persistence Implementation Instructions

## 0. Task identity

Task: **DSH Idea V1 — T1 Domain + Persistence**

Target plugin directory:

```text
D:\Harness\harness-plugin\dsh-idea
```

Compatibility target / authoritative Harness checkout:

```text
D:\Harness\deepseek-harness
```

Expected Harness baseline:

```text
c291e7961a515f6d7af9304e7fd1d257929aef26
```

The Idea feature is an **independent external Harness plugin**. Do not implement it inside the DeepSeek Harness monorepo.

## 1. Non-negotiable repository boundary

May modify only:

```text
D:\Harness\harness-plugin\dsh-idea
```

Read-only references:

```text
D:\Harness\deepseek-harness
D:\Harness\harness-plugin\dsh-super-injector
```

Forbidden:

- Do not modify `D:\Harness\deepseek-harness`.
- Do not modify `C:\Users\EDY\.dsh\profiles\web`.
- Do not re-enable, edit, or depend on `dsh-memory-evolve`, `dsh-super-injector`, or Aqua.
- Do not add compatibility shims for deprecated `@deepseek-ai/dsh-client-runtime`.

## 2. Frozen product boundary

Idea is a long-term user-owned possibility / hypothesis / direction / opportunity that evolves over time.

V1 core loop:

```text
Conversation
  -> explicit Save Idea
  -> Idea v1
  -> dormant/active
  -> explicit Related Ideas
  -> Continue Discussion
  -> explicit Save Again
  -> Idea v2
```

Critical V1 rule:

> All Idea operations are user-triggered. No automatic detection, background monitoring, automatic resurfacing, or hidden prompt injection.

T1 does not implement conversation/UI/LLM behavior.

## 3. T1 scope

Implement only:

1. Standalone plugin/package scaffold.
2. Typed Idea domain model.
3. Schema-validated storage domain.
4. Durable create/get/list/archive/evolve.
5. Immutable linear version history.
6. Source discussion snapshot persistence.
7. Optimistic conflict protection for evolve/archive.
8. Persistence/reopen test.
9. Focused tests + typecheck/build.

Do NOT implement:

- Web UI
- `💡 Idea` button
- Preview dialog
- Typert Remote API
- LLM extraction
- Related Ideas
- Continue Discussion
- Session context capture
- model selection
- embeddings/vector DB
- PAH integration
- automatic hooks

## 4. Architecture decision already made

Current Harness `storage-domain` provides:

- one serialized write chain per domain;
- backend durability before in-memory mutation;
- atomic single-record `update`;
- **no cross-table transactions**.

Therefore, do not split one Idea commit across multiple tables.

Use one canonical aggregate record per Idea:

```text
domain: idea
table: ideas
key: ideaId
value: IdeaAggregate
```

A Save/Evolve operation must be representable as one record `put` or `update`.

## 5. Frozen domain model

```ts
type IdeaStatus = 'active' | 'dormant' | 'archived'

interface Idea {
  ideaId: IdeaId
  currentVersionId: IdeaVersionId
  status: IdeaStatus
  createdAt: number
  updatedAt: number
}

interface IdeaVersion {
  versionId: IdeaVersionId
  ideaId: IdeaId
  ordinal: number
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
  sourceDiscussionIds: readonly SourceDiscussionId[]
  createdAt: number
}

interface CapturedMessage {
  role: 'user' | 'assistant'
  text: string
}

interface SourceDiscussion {
  sourceDiscussionId: SourceDiscussionId
  ideaId: IdeaId
  sessionId: string
  anchorMessageId?: string
  startSeq?: number
  endSeq?: number
  capturedContext: readonly CapturedMessage[]
  capturedAt: number
}

interface IdeaAggregate {
  idea: Idea
  versions: readonly IdeaVersion[]
  sourceDiscussions: readonly SourceDiscussion[]
}
```

Invariants:

1. aggregate key matches `idea.ideaId`;
2. at least one version exists;
3. ordinals are `1..N`, unique, strictly increasing;
4. every version belongs to this Idea;
5. `currentVersionId` points to latest committed version;
6. every SourceDiscussion belongs to this Idea;
7. every `sourceDiscussionId` referenced by a version exists;
8. archived means retrieval filtering, not deletion.

## 6. Draft/input types

T1 accepts already prepared semantic data. No model calls.

```ts
interface IdeaDraft {
  title: string
  core: string
  motivation: string
  currentConclusion: string
  possibleValue: string
  useWhen: readonly string[]
  openQuestions: readonly string[]
}

interface SourceDiscussionDraft {
  sessionId: string
  anchorMessageId?: string
  startSeq?: number
  endSeq?: number
  capturedContext: readonly CapturedMessage[]
}
```

Validation:

- `title`, `core`, `motivation`: trimmed non-empty;
- remaining string fields normalized;
- arrays bounded and non-empty strings only;
- reject invalid input before persistence;
- bound source snapshots and document limits.

Do not persist hidden system prompts, raw tool bodies, credentials, environment secrets, binary attachments, or unbounded session history.

## 7. Domain service behavior

Required in-process Host operations:

```ts
create(...)
get(ideaId)
list(...)
archive(ideaId, expectedCurrentVersionId)
evolve(ideaId, draft, source, expectedCurrentVersionId)
```

### create

- generate Idea/version/source IDs;
- ordinal = 1;
- status = `active`;
- currentVersionId = v1;
- one durable aggregate write.

### get

- return IdeaAggregate or a clear domain not-found result/error.

### list

- current Idea/current version view;
- archived excluded by default;
- explicit option may include archived;
- historical versions are not separate Ideas.

### archive

- atomic record `update`;
- compare `expectedCurrentVersionId`;
- stale => conflict, zero write;
- versions unchanged.

### evolve

- atomic record `update`;
- compare `expectedCurrentVersionId`;
- stale => conflict, zero write;
- append one SourceDiscussion;
- append one IdeaVersion;
- ordinal = previous + 1;
- advance currentVersionId;
- preserve all prior versions unchanged.

No branching or merge graph.

## 8. IDs and clocks

Prefer current Harness/ecosystem utilities when stable, but keep tests deterministic.
Do not add a large framework only for IDs/clocks.

## 9. Plugin/package scaffold

Create a real external plugin package compatible with the official profile mechanism.

Target future install semantics:

```powershell
cd D:\Harness\harness-plugin\dsh-idea
pnpm dsh plugin --profile web add .
```

or:

```powershell
cd D:\Harness\deepseek-harness
pnpm dsh plugin --profile web add D:\Harness\harness-plugin\dsh-idea
```

Before finalizing package metadata, inspect current Harness CLI/plugin docs and current manifests for:

- package manifest
- Cordis loader entry
- `dsh.bundle.patch`
- `cordis.patch.yml`
- dependency placement
- build output shape

For T1, Host-only is acceptable. Do not prematurely add browser code.

Suggested package identity:

```text
@dsh-external/dsh-idea
```

Suggested loader id:

```text
dsh-idea
```

Use supported services, especially `storageDomain`. Do not import storage backend implementations directly from business/domain code.

## 10. Harness references to inspect

Use local checkout as source of truth:

```text
packages/storage/storage-domain/
packages/workspace/workspace/
packages/session/session-projection-cache/
docs/subsystems/storage.md
apps/cli/reference/README.md
```

## 11. Test requirements

Domain/schema:
- rejects empty title/core/motivation;
- rejects malformed aggregate;
- rejects dangling sourceDiscussion reference.

Create:
- v1, ordinal 1, active, currentVersionId=v1, source stored.

Read/list:
- one Idea, not one row per version;
- archived excluded by default;
- optional inclusion works.

Evolve:
- v2 appended;
- v1 preserved unchanged;
- ordinal increments;
- currentVersionId moves to v2;
- stale expectedCurrentVersionId rejects;
- conflict produces zero write.

Archive:
- history retained;
- stale expected version rejects.

Persistence:
- prove data survives domain/service/backend reopen using the most canonical current Harness storage test pattern available to an external package.

Persistence/reopen test is mandatory.

## 12. Quality gates

Required:

```text
tests PASS
typecheck PASS
build PASS
git diff --check PASS
```

If lint/format is configured, run it too.

Do not run the full Harness monorepo suite for T1.
Do not modify Harness to make plugin tests pass.

## 13. Git + public GitHub repository governance

The plugin must be managed as its own Git repository and pushed to a **public GitHub repository**.

Target local repository:

```text
D:\Harness\harness-plugin\dsh-idea
```

Preferred remote repository name:

```text
dsh-idea
```

Use the currently authenticated GitHub account. Do not hard-code usernames, tokens, credentials, or secrets in source files.

### Repository setup

If the local directory is not already a Git repository:

1. create the directory;
2. initialize Git with `main` as the primary branch;
3. create an appropriate `.gitignore`;
4. create a concise `README.md`;
5. create the plugin scaffold;
6. make clean, meaningful commits.

Before creating the remote, verify GitHub CLI authentication:

```powershell
gh auth status
```

If authenticated and the matching remote repository does not already exist, create a **public** repository from the local checkout:

```powershell
gh repo create dsh-idea --public --source . --remote origin
```

Do not use `--private`.

If the repository already exists, verify/add `origin` instead of creating a duplicate.

### Commit discipline

Use small, meaningful commits. T1 must finish with a checkpoint commit whose subject is:

```text
feat: add idea domain persistence foundation
```

Do not commit:

- secrets or API keys;
- credential-bearing `.env` files;
- `node_modules`;
- local Harness build artifacts;
- local DSH profile/runtime state;
- machine-specific generated files.

### Push and verification

After all T1 gates pass:

```powershell
git push -u origin main
```

Then verify:

```powershell
git status
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Local HEAD and remote `main` must match.

### Required completion report additions

Include:

```text
Local repository path
Public GitHub repository URL
Branch
Checkpoint commit SHA
Remote main SHA
Working tree status
```

If GitHub authentication or remote creation requires interactive user authorization, stop only at that authorization boundary and report the exact command the user must run. Never ask for or print a personal access token.

## 14. Completion report

Report only:

```text
Outcome
Plugin path
Harness reference SHA
Changed paths
Domain/storage design
Tests
Typecheck/build/static gates
Checkpoint commit
Known limitations
Next task
```

Do not start T2 automatically.

Next task after acceptance:

```text
T2 — Save Idea preparation
```

## 15. Stop conditions

Stop with `ARCHITECTURE_DECISION_REQUIRED` only if:

1. external plugin cannot use `storageDomain` through a supported Host boundary;
2. aggregate cannot be durably persisted without modifying Harness core;
3. official profile/plugin mounting requires invasive Harness changes.

Do not stop for ordinary implementation issues.

## 16. Core implementation principle

> **One Idea is one canonical aggregate record; one evolve operation is one serialized single-record update.**

This is intentional because current Harness storage-domain does not provide cross-table transactions.
