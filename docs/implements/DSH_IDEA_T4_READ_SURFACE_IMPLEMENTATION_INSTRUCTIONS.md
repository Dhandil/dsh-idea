# DSH Idea V1 — T4 Idea Read Surface & Retrieval Foundation

## Goal

Make saved Ideas become independent readable assets.

Current:

Conversation -> Prepare -> Human Save -> Idea

T4:

Idea Storage -> Query -> Read Surface -> User revisits Idea

## Scope

Implement:

- Idea query service
- Remote read API
- Idea list surface
- Idea detail surface
- Source conversation linkage
- Read-only UI
- Offline tests

Do not implement:

- embeddings
- vector database
- automatic recall
- related ideas
- recommendation
- idea evolution
- background agents

## Query DTO

Do not expose storage records directly.

Summary:

```ts
interface IdeaSummary {
  id: string
  title: string
  core: string
  motivation: string
  createdAt: number
  updatedAt: number
  source: {
    sessionId: string
    anchorMessageId: string
  }
}
```

Detail extends summary with:

- currentConclusion
- possibleValue
- useWhen
- openQuestions
- versionId

## Remote

Namespace:

idea

Methods:

- list()
- get(id)

Read-only.

## UI

Minimal:

Idea List

- title
- core
- created time
- source indicator

Idea Detail:

- title
- core
- motivation
- conclusion
- possible value
- use cases
- open questions
- source conversation

## Tests

Host:

- list/get
- archived handling
- unknown id
- zero writes

Client:

- rendering
- detail opening
- empty/error states

Remote:

- serialization
- error mapping

## Gates

focused tests PASS

typecheck PASS

build PASS

git diff --check PASS

Commit:

feat: add idea read surface

Acceptance:

Idea becomes a durable user-owned asset independent from the original conversation.
