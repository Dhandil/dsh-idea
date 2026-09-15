# DSH Idea V1 — T5.1 Version Model Implementation Instructions

## Task identity

Repository:

D:\Harness\harness-plugin\dsh-idea

Base checkpoint:

41da92c

Harness reference:

c291e7961a515f6d7af9304e7fd1d257929aef26

`deepseek-harness` is read-only. Do not modify Harness core.

---

## 1. Objective

Upgrade Idea from a single saved asset into an append-only versioned asset.

Current:

Idea -> current content

Target:

Idea
- Version 1
- Version 2
- Version 3
- currentVersion

Core rule:

Idea versions are immutable. Evolution creates new versions instead of overwriting history.

---

## 2. Scope

Implement:

- IdeaVersion lifecycle enhancement
- Version reason metadata
- Evolution Event model
- append-only version creation
- optimistic concurrency control
- version query API
- minimal version history UI
- migrations
- offline tests

Do not implement:

- Continue Discussion
- LLM evolution
- Memory Layer
- Knowledge
- Embedding
- Vector Search
- Recommendation
- Related Ideas

---

## 3. Domain Model

Idea remains aggregate root.

```ts
interface Idea {
  id: IdeaId
  currentVersionId: IdeaVersionId
  status: IdeaStatus
  createdAt: number
  updatedAt: number
}
```

Do not store mutable content directly on Idea.

IdeaVersion:

```ts
interface IdeaVersion {
  id: IdeaVersionId
  ideaId: IdeaId
  ordinal: number
  draft: IdeaDraft
  reason: IdeaVersionReason
  sourceDiscussionId?: SourceDiscussionId
  createdAt: number
}
```

Reason:

```ts
type IdeaVersionReason =
  | "initial-save"
  | "manual-edit"
  | "continued-discussion"
```

Existing T3 save becomes:

v1 + initial-save.

---

## 4. Evolution Event

Add:

```ts
interface IdeaEvolutionEvent {
  id: EvolutionEventId
  ideaId: IdeaId
  fromVersionId?: IdeaVersionId
  toVersionId: IdeaVersionId
  reason: IdeaVersionReason
  createdAt: number
}
```

Version answers:

What is the Idea now?

Event answers:

Why did it become this?

---

## 5. Storage Rules

Keep append-only.

Never overwrite versions.

Flow:

validate
-> check expectedCurrentVersionId
-> create new version
-> update currentVersionId
-> create evolution event

---

## 6. Concurrency

Use optimistic concurrency.

Request carries:

expectedCurrentVersionId

If current version changed:

return:

version-conflict

No partial write.

---

## 7. Remote API

Add:

idea.getVersions(id)

idea.getVersion(id, versionId)

Read only.

Do not expose storage objects.

---

## 8. UI

Minimal version history.

Example:

Current Version

v3

History:

v1 初次保存
v2 手动修改
v3 继续讨论

Do not implement:

- diff
- rollback
- merge

---

## 9. Tests

Required:

- create Idea creates v1
- ordinal starts at 1
- initial-save reason
- append v2
- preserve v1
- ordinal increases
- evolution event created
- stale version conflict
- no partial write
- immutable history
- remote version query

---

## 10. Quality Gates

Run:

focused tests PASS

typecheck PASS

build PASS

git diff --check PASS

---

## 11. Git

Commit:

feat: add idea version model

Push:

git push origin main

Verify:

git rev-parse HEAD

git ls-remote origin refs/heads/main

git status

---

## Acceptance Principle

Idea evolution is append-only history, not destructive update.

T5.1 only builds the version foundation. Continue Discussion and LLM-driven evolution come later.
