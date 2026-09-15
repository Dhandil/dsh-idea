# DSH Idea V1 --- T5.2 Continue Discussion Implementation Instructions

## Task identity

Repository:

``` text
D:\Harness\harness-plugin\dsh-idea
```

Base checkpoint:

``` text
91ecfdc
```

Harness reference:

``` text
c291e7961a515f6d7af9304e7fd1d257929aef26
```

`D:\Harness\deepseek-harness` is read-only.

Do not modify Harness core.

------------------------------------------------------------------------

# 1. Objective

Implement Continue Discussion.

Goal:

Turn an existing Idea into a new Agent conversation entry point.

Current:

``` text
Conversation
    |
    v
Idea v1
    |
    v
Version history
```

Target:

``` text
Idea

    |
    v

Continue Discussion

    |
    v

New Conversation

    |
    v

Idea Context injected

    |
    v

Future Evolution -> v2
```

Core principle:

> Continue Discussion creates a new focused conversation from an Idea.
> It does not reopen or replay the original conversation.

------------------------------------------------------------------------

# 2. Research conclusions frozen

Follow these decisions:

## Do not restore old chat

Forbidden:

``` text
load original transcript
copy all messages
```

Reason:

-   excessive context
-   historical noise
-   irrelevant exploration

------------------------------------------------------------------------

## Use Idea as context seed

The new conversation receives:

-   current Idea version
-   important history summary
-   unresolved questions
-   evolution metadata

------------------------------------------------------------------------

## Human remains owner

Continue Discussion can generate new understanding.

It cannot directly modify Idea.

Future modification happens in T5.3.

------------------------------------------------------------------------

# 3. Scope

Implement:

-   IdeaDiscussion domain model
-   persistence
-   continue discussion Remote API
-   conversation creation integration
-   Idea context injection
-   Idea detail UI button
-   offline tests

Do not implement:

-   Idea v2 creation
-   LLM evolution commit
-   automatic updates
-   memory promotion
-   knowledge graph
-   embeddings
-   vector search

------------------------------------------------------------------------

# 4. Domain model

Add:

``` ts
interface IdeaDiscussion {
  id: IdeaDiscussionId

  ideaId: IdeaId

  conversationId: ConversationId

  baseVersionId: IdeaVersionId

  status: "active" | "completed"

  createdAt: number
}
```

Meaning:

A discussion is a workspace created from a specific Idea version.

------------------------------------------------------------------------

# 5. Discussion lifecycle

Flow:

``` text
Idea v1

    |
    |
create discussion

    |

Discussion(active)

    |

Conversation

    |

User interaction

    |

completed
```

Do not mutate Idea during this flow.

------------------------------------------------------------------------

# 6. Remote API

Add:

``` text
idea.continueDiscussion(id)
```

Return:

``` ts
interface ContinueDiscussionResult {
  discussionId: IdeaDiscussionId

  conversationId: ConversationId

  baseVersionId: IdeaVersionId
}
```

Rules:

-   unknown Idea -\> idea/not-found
-   no Idea write
-   one click should not create duplicate discussions

------------------------------------------------------------------------

# 7. Idempotency

Prevent repeated clicks.

Same:

``` text
ideaId + currentVersionId
```

should not create unlimited discussions.

Recommended:

reuse active discussion.

Example:

``` text
Idea v3

click Continue Discussion

creates:

Discussion A


click again

returns:

Discussion A
```

------------------------------------------------------------------------

# 8. Conversation Context

New conversation receives an Idea context object.

Example:

``` json
{
  "type": "idea-continuation",

  "idea": {
    "id": "...",
    "title": "...",
    "currentVersion": "...",
    "openQuestions": []
  }
}
```

Include:

-   current version draft
-   version history summary
-   open questions

Do not include:

-   full old messages
-   unrelated conversations

------------------------------------------------------------------------

# 9. UI

Idea Detail page adds:

``` text
继续讨论
```

Behavior:

click:

``` text
Idea Detail

↓

continueDiscussion()

↓

open conversation
```

States:

-   loading
-   success
-   failure

No silent retry.

------------------------------------------------------------------------

# 10. Tests

Host:

-   create discussion
-   reuse active discussion
-   unknown Idea error
-   correct baseVersionId
-   no Idea mutation

Conversation:

-   new conversation created
-   Idea context attached
-   original transcript not copied

Client:

-   button visible
-   loading state
-   success navigation
-   failure handling
-   duplicate click prevention

------------------------------------------------------------------------

# 11. Quality gates

Run:

``` text
focused tests PASS

typecheck PASS

build PASS

git diff --check PASS
```

No full Harness suite.

No provider/network calls.

------------------------------------------------------------------------

# 12. Git

Commit:

``` text
feat: add idea continue discussion
```

Push:

``` powershell
git push origin main
```

Verify:

``` powershell
git rev-parse HEAD
git ls-remote origin refs/heads/main
git status
```

------------------------------------------------------------------------

# Acceptance principle

> An Idea is a conversation seed, not a transcript archive.

> Continue Discussion creates a new focused workspace and preserves Idea
> ownership boundaries.

> T5.2 prepares the path for T5.3 Evolution Commit.
