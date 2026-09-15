# DSH Idea V1 --- T5.3 Evolution Commit Implementation Instructions

## Task identity

Repository:

D:`\Harness`{=tex}`\harness`{=tex}-plugin`\dsh`{=tex}-idea

Base checkpoint:

eb578cd

Harness reference:

c291e7961a515f6d7af9304e7fd1d257929aef26

deepseek-harness is read-only. Do not modify Harness core.

------------------------------------------------------------------------

## 1. Objective

Implement Idea Evolution Commit.

T5.2 created:

Idea -\> Continue Discussion -\> Conversation

T5.3 completes:

Idea v1 \| Discussion \| Evolution Proposal \| Human Approval \| Idea v2

Core principle:

LLM proposes. Human approves. Domain commits.

The model must never silently update an Idea.

------------------------------------------------------------------------

## 2. Scope

Implement:

-   evolution preparation flow
-   Idea evolution proposal model
-   evolution Remote API
-   preview/approval UI
-   append new IdeaVersion
-   EvolutionEvent creation
-   optimistic concurrency
-   offline tests

Do not implement:

-   automatic evolution
-   background agent updates
-   memory promotion
-   knowledge graph
-   embeddings
-   vector search
-   recommendation

------------------------------------------------------------------------

## 3. Evolution flow

Idea Detail \| Continue Discussion \| Conversation \| User discusses \|
Prepare Evolution \| Draft IdeaVersion \| User reviews \| Commit Version
N+1

------------------------------------------------------------------------

## 4. Evolution Proposal Model

Add proposal layer.

Example:

``` ts
interface IdeaEvolutionProposal {
  proposalId: EvolutionProposalId
  ideaId: IdeaId
  baseVersionId: IdeaVersionId
  draft: IdeaDraft
  reason: IdeaVersionReason
  createdAt: number
}
```

Proposal is temporary.

Version is durable.

------------------------------------------------------------------------

## 5. Preparation boundary

Preparation must:

-   load current Idea version
-   collect discussion context
-   call LLM through existing gateway seams
-   validate output with IdeaDraft schema

Result is Proposal, not IdeaVersion.

------------------------------------------------------------------------

## 6. Human approval

Required.

Preview:

Current Version

↓

Proposed Version

↓

Approve / Cancel

Cancel:

-   zero Idea writes

------------------------------------------------------------------------

## 7. Commit semantics

Commit creates:

1.  new IdeaVersion
2.  EvolutionEvent
3.  update currentVersionId

Transaction:

validate proposal

↓

check expectedCurrentVersionId

↓

append version

↓

append event

↓

update current version

------------------------------------------------------------------------

## 8. Concurrency

Reuse T5.1 optimistic concurrency.

Stale proposal:

version-conflict

No partial write.

------------------------------------------------------------------------

## 9. Remote API

Suggested:

idea.prepareEvolution(discussionId)

idea.commitEvolution(proposalId, expectedCurrentVersionId, draft)

Rules:

-   prepare does not write Idea
-   commit is only durable mutation
-   invalid proposal rejected
-   expired proposal rejected

------------------------------------------------------------------------

## 10. UI

Add evolution preview.

Show:

Current: v1

Proposal: v2 draft

Buttons:

取消

保存为新版本

No direct overwrite.

------------------------------------------------------------------------

## 11. Tests

Host:

-   prepare creates proposal
-   prepare does not modify Idea
-   commit creates next version
-   event created
-   stale proposal rejected
-   invalid draft rejected
-   duplicate commit does not create duplicate version

Client:

-   preview
-   edit fields
-   cancel no write
-   approve commits
-   failure keeps draft

Remote:

-   serialization
-   error mapping
-   zero write prepare

------------------------------------------------------------------------

## 12. Quality gates

Run:

focused tests PASS

typecheck PASS

build PASS

git diff --check PASS

No real provider/network calls.

------------------------------------------------------------------------

## 13. Git

Commit:

feat: add idea evolution commit

Push:

git push origin main

Verify:

git rev-parse HEAD

git ls-remote origin refs/heads/main

git status

------------------------------------------------------------------------

## Acceptance principle

Discussion creates understanding.

Approval creates history.

Idea versions are append-only. No silent mutation.
