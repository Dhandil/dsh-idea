# DSH Idea T10 — Contextual Idea Resurfacing Implementation Instructions

**Status:** Frozen implementation instructions  
**Phase:** T10 — Contextual Idea Resurfacing  
**Repository:** `D:\Harness\harness-plugin\dsh-idea`  
**Remote:** `Dhandil/dsh-idea`

## 0. Frozen Baseline

Before making any executable change, verify all of the following:

```text
BASELINE_SHA=184a8c6309bd3c5d155578583e8aceab04f6ddc6
T9_ACCEPTED_EXECUTABLE_SHA=46451213641bf5beb6657b259f6033183ba23059
T9R3_EXECUTION_ACCEPTANCE_SHA=e725eb29a06512113209aa9eb588802517bac690
HARNESS_SHA=c291e7961a515f6d7af9304e7fd1d257929aef26
DOMAIN=idea/v3
```

The Harness repository is read-only for this task.

If `origin/main`, the local dsh-idea baseline, or the Harness SHA differs from the frozen values above:

```text
STOP
```

Report the drift precisely. Do not rebase, merge, reset, cherry-pick, or otherwise alter history to hide the mismatch.

---

## 1. Product Goal

Implement **Contextual Idea Resurfacing**.

When a newly completed live conversation turn presents a genuinely useful opportunity to recall a historical Idea, the plugin may proactively show **at most one lightweight suggestion above the composer**.

Core invariant:

```text
Resurfacing != Context Injection
```

Until the user explicitly chooses **Reference**:

- do not inject the Idea into the Agent prompt;
- do not mutate the Conversation;
- do not mutate the Idea;
- do not create a new Idea version;
- do not automatically Save;
- do not automatically Reference;
- do not automatically Continue Discussion;
- do not alter the Assistant reply that triggered the evaluation.

The default behavior is silence.

Optimization target:

```text
High Precision
Low Frequency
Low Cost
Explainable Silence
User-Controlled Context
```

---

## 2. Explicitly Out of Scope

T10 V1 must not implement or alter any of the following:

- Harness executable code;
- `idea/v3` schema migration;
- `idea/v4`;
- Embeddings;
- Vector DB;
- semantic/vector retrieval index;
- Idea Graph;
- background polling;
- timer daemon;
- automatic Save;
- automatic Reference;
- automatic Continue Discussion;
- hidden prompt injection;
- learned ranking;
- behavioral learning;
- durable cross-conversation dismiss learning;
- long-lived resurfacing inbox / notification center;
- changes to accepted T9 Search semantics;
- changes to accepted T9 Reference admission semantics;
- changes to accepted T9 Continue Discussion semantics;
- any unrelated T11 work.

Do not broaden scope opportunistically.

---

## 3. Trigger Source

T10 must not scan a reconstructed history and infer that a historical turn is “new”.

Use the existing client `SessionBinding.eventSource` incremental feed.

A resurfacing evaluation may start only when the client observes a **new live append** satisfying:

```text
change.kind === "append"
event.type === "turn/end"
event.data.reason.kind === "completed"
```

The following must not start a new proactive evaluation:

```text
replace
prepend
history replay
old conversation open
reconnect baseline
aborted turn
error turn
blocked turn
interrupted turn
max-tokens turn
```

Unless the frozen Harness contract itself proves a terminal condition is exactly equivalent to `completed`, default to no evaluation.

Opening an old Conversation must never cause a resurfacing suggestion merely because its old `turn/end` events were loaded.

---

## 4. Per-Conversation Resurfacing Controller

Implement a plugin-owned, per-Conversation/session resurfacing runtime controller.

It owns only T10 runtime behavior.

Responsibilities:

1. receive an eligible completed-turn trigger;
2. deduplicate evaluation for that trigger;
3. run cheap deterministic gates;
4. call the Host-side resurfacing evaluation;
5. maintain ephemeral pending/ready/surfaced state;
6. track composer revision at the trigger boundary;
7. run final stale/race checks;
8. drive the composer suggestion strip;
9. handle View / Reference / Dismiss;
10. expire an opportunity when context moves on.

Do not put T10 UI/runtime state inside `IdeaAggregate`.

The V1 surface budget is:

```text
maximum surfaced proactive suggestion per Conversation = 1
```

This is an initial V1 policy default, not a permanent domain invariant.

The budget is consumed when a suggestion is actually surfaced, not when it is referenced.

---

## 5. Pre-Delivery Gate

Before any expensive work, run a deterministic gate.

Minimum STOP reasons:

```text
FEATURE_DISABLED
NO_ELIGIBLE_IDEAS
CURRENT_TURN_IDEA_ACTIVE
CONVERSATION_SURFACE_BUDGET_EXHAUSTED
```

If a current turn is already explicitly operating on Ideas, do not also produce a proactive reminder.

Examples of structured evidence:

- an Idea reference is attached / admitted;
- the Conversation is a Continue Discussion descendant of an Idea relevant to the current operation;
- the current interaction is explicitly a Save Idea flow.

Do not determine “Idea already referenced” by searching durable user text for a raw `dsh-idea:` URI.

T9 rewrites canonical mentions during `agent/pre-step` and injects plugin-authored recall context:

```text
source.kind = "plugin"
plugin = "dsh-idea"
form = "recall"
```

Reuse canonical T9 identity/evidence paths where needed.

---

## 6. Opportunity Detector

The Opportunity Detector answers only:

> Is now worth checking historical Ideas?

It does **not** choose an Idea.

It must be deterministic and require zero model calls.

It may use:

- the current user turn;
- a small bounded amount of recent visible conversation context.

It must not use the Idea corpus to select candidate identity.

### 6.1 Strong atomic signals

```text
GOAL_DECLARATION
DECISION_POINT
PROBLEM_RECURRENCE
MEMORY_GAP
```

### 6.2 Strong compound signals

```text
TOPIC_REENTRY
STRATEGY_RESET
```

### 6.3 Medium atomic signals

```text
TOPIC_SHIFT
FRUSTRATION
ATTITUDE_REOPENING
STAGE_TRANSITION
PARTIAL_RECALL
```

A strong signal must satisfy the admission threshold.

When a compound signal is derived from atomic evidence, do not double-count the underlying atomic signals.

Example:

```text
TOPIC_REENTRY
derivedFrom:
  ATTITUDE_REOPENING
  PARTIAL_RECALL
```

Do not score all three independently.

### 6.4 Continuation-only examples

The following, absent stronger context, must remain silent:

```text
继续
为什么
详细一点
好的
再说说
```

### 6.5 Small recent context

The detector must be allowed to use a small recent context window.

Example:

```text
那 Mac mini 呢？
```

must not be treated as a decision point merely because of its short form.

It may become `DECISION_POINT` only when recent context deterministically establishes an active choice / alternative structure.

---

## 7. Candidate Retrieval

T10 may reuse T9 lexical primitives such as:

- normalization;
- feature extraction;
- lexical field scoring;
- deterministic ordering;
- existing projection/budget helpers.

But T10 must not silently reuse the T9 Related Ideas **product policy** unchanged.

In particular:

```text
ZERO-SCORE RECENCY FILL IS FORBIDDEN IN T10 PROACTIVE RETRIEVAL
```

T10 proactive retrieval must require positive deterministic lexical evidence.

If there is no positive candidate:

```text
NO_CANDIDATE
0 model calls
STOP
```

### 7.1 Retrieval invariant

Each Idea contributes at most:

```text
canonical Idea
+
current version
```

Historical versions must never enter as independent resurfacing candidates.

There is no `IDEA_SUPERSEDED` suppression stage. If a historical version enters independently, retrieval violated its contract.

Every candidate must carry at least:

```text
ideaId
evaluatedVersionId
```

Optionally carry the current-version hash/identity if an existing stable identity is already available.

---

## 8. Candidate Suppression

Candidate suppression is deterministic only.

It may not perform semantic reasoning.

Minimum suppression reasons:

```text
IDEA_LIFECYCLE_INACTIVE
CURRENT_DISCUSSION_DESCENDS_FROM_IDEA
EXPLICITLY_PRESENT_IN_ACTIVE_CONTEXT
CREATED_IN_CURRENT_CONVERSATION
REFERENCED_IN_CURRENT_CONVERSATION
SURFACED_IN_CURRENT_CONVERSATION
DISMISSED_IN_CURRENT_CONVERSATION
BELOW_RETRIEVAL_FLOOR
CANDIDATE_VERSION_CHANGED
```

### 8.1 Explicit presence boundary

`EXPLICITLY_PRESENT_IN_ACTIVE_CONTEXT` must rely on deterministic identity/evidence only, for example:

- explicit reference identity;
- Continue Discussion binding;
- T9 plugin recall identity;
- exact/source evidence already known to the system.

Do not treat semantic similarity as deterministic presence.

Semantic duplication belongs to the Judge:

```text
REDUNDANT_WITH_CONTEXT
```

### 8.2 Judge pool

After deterministic suppression, provide at most:

```text
3 candidates
```

to the semantic Judge.

---

## 9. Assistant Settlement Ordering

Do not run the semantic Judge before the Assistant reply for the triggering user turn is settled.

Correct flow:

```text
new completed turn observed
    ↓
Pre-Delivery Gate
    ↓
Opportunity Detector
    ↓
T10 proactive lexical retrieval
    ↓
Candidate Suppression
    ↓
Pending Evaluation
    ↓
Assistant / turn fully settled
    ↓
Revalidation
    ↓
Bounded Semantic Judge
    ↓
Final Delivery Gate
    ↓
Suggestion
```

The purpose is to allow the Judge to see whether the Assistant’s newly finalized visible reply already covered the candidate’s value.

T10 must never alter the reply that triggered its own evaluation.

---

## 10. Revalidation

Before the Judge, and again where needed before surfacing, revalidate the opportunity.

At minimum:

- the trigger turn is still the relevant current turn;
- the Conversation has not moved on;
- the composer has not been edited since the trigger;
- the candidate is still eligible;
- `evaluatedVersionId` is still the current version.

### 10.1 Composer revision

Do not compare only the final text string.

Track a composer revision.

Example:

```text
triggerComposerRevision = R17
```

Any real content edit increments the revision:

```text
R18
```

These count as edits:

- empty → non-empty;
- non-empty → changed content;
- content → empty;
- edit then restore the original string.

These do not count:

- focus change;
- cursor move;
- selection change.

If:

```text
currentComposerRevision != triggerComposerRevision
```

then:

```text
COMPOSER_CHANGED_SINCE_TRIGGER
→ EXPIRE
```

A READY/pending opportunity must never survive a newer user turn.

Do not use wall-clock TTL as the primary V1 staleness mechanism.

---

## 11. Bounded Semantic Judge

The semantic Judge is the only model-intelligence point in the proactive path.

Its question is:

> Is there exactly one historical Idea that adds information not already salient in the current context and is genuinely useful now?

It is not a generic relevance classifier.

### 11.1 Bounded input

Input may contain only bounded data:

- current user turn;
- small recent visible context;
- finalized Assistant reply;
- opportunity signal types and minimal evidence;
- up to 3 candidates with bounded canonical fields.

Candidate fields may include:

```text
ideaId
evaluatedVersionId
title
core
possibleValue
useWhen
bounded currentConclusion
```

Do not send:

- the whole Idea corpus;
- full source discussions;
- full version history;
- full evolution history;
- unbounded conversation history.

### 11.2 Output

The Judge must resolve to exactly one of:

```text
NONE
```

or:

```text
SURFACE exactly one provided ideaId
```

Positive reason vocabulary:

```text
ADDS_MISSING_OPTION
RESTORES_FORGOTTEN_DIRECTION
ADDS_DECISION_VALUE
ADDS_VALUE_TO_RECURRENT_PROBLEM
```

Negative reason vocabulary:

```text
NOT_RELEVANT
REDUNDANT_WITH_CONTEXT
INTERESTING_BUT_NOT_USEFUL_NOW
STALE_FOR_CURRENT_SITUATION
TOO_WEAKLY_CONNECTED
MULTIPLE_AMBIGUOUS_CANDIDATES
```

Contract:

```text
SURFACE → positive reason + candidate ideaId
NONE    → negative reason + null ideaId
```

If two candidates are similarly useful / ambiguous:

```text
NONE
MULTIPLE_AMBIGUOUS_CANDIDATES
```

Do not show multiple suggestions.

Do not make model-reported confidence a semantic authority. If retained for diagnostics, it is observational only and is not assumed to be a calibrated probability.

### 11.3 Fail closed

Any Judge operational failure must result in no suggestion.

Examples:

```text
provider unavailable
timeout
invalid structured output
parse failure
model failure
```

Reason examples:

```text
JUDGE_UNAVAILABLE
JUDGE_INVALID_OUTPUT
JUDGE_FAILED
```

Never fall back to:

```text
lexical score is high, therefore show it
```

---

## 12. Final Delivery Gate

After `SURFACE`, run deterministic final delivery checks.

Minimum outcomes:

```text
ALLOW
SUPPRESS
EXPIRE
```

Reasons include:

```text
TRIGGER_TURN_NO_LONGER_CURRENT
COMPOSER_CHANGED_SINCE_TRIGGER
CONVERSATION_CHANGED
CANDIDATE_BECAME_INELIGIBLE
CANDIDATE_VERSION_CHANGED
SUGGESTION_ALREADY_VISIBLE
CONVERSATION_SURFACE_BUDGET_EXHAUSTED
CANDIDATE_ALREADY_REFERENCED
CANDIDATE_ALREADY_DISMISSED
CANDIDATE_ALREADY_SURFACED
```

Any stale/race condition must result in silence.

A correct but late suggestion is invalid.

---

## 13. UI Contract

Use the Harness slot:

```text
conversation.input.dock
```

Do not use:

```text
conversation.input.overlay
```

The T10 surface is a lightweight suggestion strip above the composer.

It is not:

- an Assistant message;
- a modal;
- a notification inbox;
- a persistent banner.

V1 shows zero or one Idea.

Suggested content:

```text
💡 以前保存过一个可能相关的 Idea：
「<title>」

[查看] [引用] [忽略]
```

### 13.1 View

View is read-only.

It must not:

- attach;
- inject;
- mutate the Idea;
- mutate the Conversation.

### 13.2 Reference

Reference must reuse the accepted T9 reference path.

The sequence is:

```text
user clicks Reference
    ↓
existing T9 attachReference path
    ↓
existing T9 admission / dedupe / limit / exact-version rules
    ↓
success
    ↓
T10 marks REFERENCED
```

If T9 reference admission fails:

- do not mark `REFERENCED`;
- do not close by pretending success;
- do not bypass limits;
- do not create a privileged system reference.

### 13.3 Dismiss

Dismiss means:

> not this resurfacing opportunity, in this Conversation.

It must not mutate:

- Idea status;
- Idea version;
- Idea importance;
- learned ranking.

### 13.4 User continues

If the suggestion was already shown and the user sends the next message without acting:

```text
SURFACED
→ EXPIRED
expireReason = USER_CONTINUED
```

Because it was already displayed, the Conversation surface budget remains consumed.

Do not reinterpret this as explicit Dismiss.

---

## 14. Exact-Version Compatibility

T10 evaluation is bound to:

```text
ideaId
evaluatedVersionId
```

If the current version changes before the Judge or before surfacing:

```text
CANDIDATE_VERSION_CHANGED
→ EXPIRE / DROP
```

Do not silently rebind to the new current version.

Before Reference, revalidate version identity again.

T10 V1 must not exploit exact historical-version attachment as a workaround for a stale resurfacing opportunity.

The user should reference the version T10 actually judged only while that judged current-version identity is still valid for the opportunity.

T9 itself remains unchanged.

---

## 15. Runtime State and Persistence

Do not upgrade `idea/v3` for T10 V1.

Runtime/ephemeral state may include:

```text
evaluation in flight
trigger turn identity
trigger composer revision
candidate ids
evaluated version ids
READY suggestion
visible suggestion
surfaceCount
surfaced Idea ids
referenced Idea ids
dismissed Idea ids
```

Do not write these into `IdeaAggregate`.

Do not create Idea evolution events for:

```text
retrieved
judged
surfaced
viewed
dismissed
expired
```

### 15.1 Evaluation observability

If an audit/decision log can be implemented safely within existing plugin infrastructure without changing Harness or forcing an Idea-domain migration, record bounded facts such as:

```text
conversationId
triggerTurnId
signal types
candidate ids
evaluated version ids
retrieval scores
suppression reasons
judge decision
judge reason
optional diagnostic confidence
final outcome
timestamps
```

Do not duplicate full Conversation text into the audit record.

Use `triggerTurnId` / canonical identities to refer back to Conversation state.

If a safe durable audit is not available without architectural expansion:

- keep minimal runtime observability;
- disclose the limitation in the final execution report;
- do not widen T10 scope to force persistence.

V1 explicitly does not implement:

```text
daily durable budget
7/30/90 day cooldown
cross-conversation learning
dismiss-based ranking
behavioral adaptation
```

---

## 16. Compatibility With T9

T10 is an opportunistic delivery layer above accepted T9 behavior.

T10 may read/reuse:

- canonical Idea state;
- current Idea version;
- lexical primitives;
- current-version projections;
- T9 canonical reference descriptors;
- Continue Discussion lineage / bindings;
- T9 reference admission.

T10 must not alter:

- Save Idea semantics;
- Idea version semantics;
- Search user-facing semantics;
- Reference admission;
- Reference limits;
- dedupe rules;
- exact-version pin behavior;
- Continue Discussion behavior;
- accepted T9 UI behavior outside T10’s new strip.

T10 gets no privileged reference bypass.

---

## 17. Required Scenario Coverage

At minimum, add focused tests for the frozen review cases.

### Expected silence

```text
继续
为什么？
详细一点
好的
```

Expected:

```text
NO_OPPORTUNITY
```

### Goal declaration

```text
我准备重新做一个个人知识管理工具。
```

Expected:

```text
eligible evaluation
```

### Recurring problem

```text
之前那个问题又出现了。
```

Expected:

```text
PROBLEM_RECURRENCE
```

### Topic re-entry

```text
塔防那个方向其实又有点意思。
```

Expected:

```text
TOPIC_REENTRY
```

### Strategy reset

```text
还是不行，我可能得换一种办法了。
```

Expected:

```text
STRATEGY_RESET
```

### Context-dependent short turn

```text
那 Mac mini 呢？
```

Expected:

```text
trigger only if recent deterministic context proves a decision/alternative structure
```

### Continue Discussion suppression

If the current Conversation descends from candidate Idea X:

```text
Idea X
→ CURRENT_DISCUSSION_DESCENDS_FROM_IDEA
→ suppressed
```

Other eligible candidates may continue.

### Semantic redundancy

If the current context already expresses the historical Idea but no exact deterministic identity proves that fact:

```text
candidate survives deterministic suppression
→ Judge
→ REDUNDANT_WITH_CONTEXT
→ NONE
```

### Related but unhelpful

Expected:

```text
INTERESTING_BUT_NOT_USEFUL_NOW
→ NONE
```

### Lexical limitation

Strong `MEMORY_GAP` but no useful lexical candidate:

```text
NO_CANDIDATE
→ 0 model calls
```

This is a known V1 lexical-only limitation, not a reason to add embeddings.

### Composer race

Judge returns SURFACE, then composer revision changes:

```text
COMPOSER_CHANGED_SINCE_TRIGGER
→ EXPIRED
→ no UI
```

### Newer user turn race

Judge returns SURFACE, then a newer user turn exists:

```text
TRIGGER_TURN_NO_LONGER_CURRENT
→ EXPIRED
```

### User continues

Suggestion surfaced, user sends another message:

```text
EXPIRED
expireReason=USER_CONTINUED
surface budget consumed
```

### History/replay safety

Open an existing old Conversation or replay history:

```text
replace/prepend
→ zero proactive evaluation
```

---

## 18. Tests and Acceptance Order

Follow this order strictly:

```text
Implementation
→ Focused / Unit Tests
→ Detector / Retrieval / Suppression deterministic tests
→ Judge parser / contract / fail-closed tests
→ Client event-trigger / replay / stale-race tests
→ T9 compatibility regression
→ Architecture / scope audit
→ Pre-Full quality gates
→ Repair and rerun affected focused tests as needed
→ Canonical Full last
```

Canonical Full is the final executable acceptance gate.

After the final Full, executable drift is prohibited.

Only documentation / acceptance report changes may follow.

If a post-Full change is not obviously non-semantic documentation-only, the evidence is invalid and the required executable acceptance must be rerun.

---

## 19. Pre-Full Quality Gates

Use repository-native gates.

At minimum verify applicable equivalents of:

```text
format check
lint
typecheck
build / package compilation
git diff --check
domain/schema drift check
Harness SHA check
package generation / generated artifact freshness if applicable
```

Do not mechanically run irrelevant Python-only checks in a TypeScript package.

If generated Remote/schema artifacts are part of the package contract, regenerate and verify them through the repository’s existing workflow.

Before Canonical Full, there must be no unexplained executable drift.

---

## 20. Harness Protection

Harness must remain read-only.

At the end prove:

```text
HARNESS_SHA=c291e7961a515f6d7af9304e7fd1d257929aef26
HARNESS_EXECUTABLE_DIFF=ZERO
```

Do not:

- edit Harness;
- vendor Harness changes;
- patch local Harness files;
- create a hidden dependency on an uncommitted Harness modification.

If the T10 design cannot be implemented without changing Harness:

```text
STOP
ARCHITECTURE_DECISION_REQUIRED
```

Do not silently cross the boundary.

---

## 21. Git and Drift Governance

Preserve unrelated user drift.

Do not:

```text
git reset --hard
git clean -fd
overwrite unrelated untracked files
revert user changes outside T10
```

Stage only task-owned files.

Before every acceptance checkpoint, inspect the exact diff.

After implementation, create an executable checkpoint before acceptance documentation where the project’s established process requires it.

After acceptance docs, verify that executable content has not drifted from the tested executable SHA.

---

## 22. Model / Provider Call Governance

Focused deterministic tests must not make real provider calls.

Judge contract tests should use fixtures/fakes unless an explicit acceptance step authorizes real calls.

The final report must state the exact real model/provider call count.

Do not perform unrelated exploratory provider calls.

---

## 23. Final Deliverables

The final T10 execution report must include:

1. baseline SHA;
2. implementation commit SHA;
3. tested executable SHA;
4. acceptance/report commit SHA;
5. Harness SHA;
6. Idea domain version;
7. exact changed files;
8. focused/unit test totals;
9. detector/retrieval/suppression test totals;
10. Judge/parser/fail-closed test totals;
11. client event/replay/race test totals;
12. T9 regression result;
13. static/pre-Full gate results;
14. Canonical Full result;
15. real provider/model call count;
16. T9 compatibility statement;
17. proof that Harness executable diff is zero;
18. proof that Idea domain migration/schema drift is zero;
19. known limitations;
20. exact final `git status`;
21. preserved unrelated user drift;
22. `origin/main` verification.

Known V1 limitations should explicitly include, where still true:

```text
lexical-only retrieval may miss synonym-only resurfacing opportunities
deterministic Chinese opportunity rules are intentionally conservative
no cross-conversation dismiss cooldown
no embedding/vector retrieval
no learned resurfacing ranking
```

---

## 24. Acceptance Outcomes

If every required executable gate passes and the final remote verification is clean:

```text
DSH_IDEA_T10_CONTEXTUAL_RESURFACING_ACCEPTED
```

If implementation exists but one or more formal acceptance gates fail:

```text
T10_IMPLEMENTED_NOT_ACCEPTED
```

If the frozen architecture cannot be implemented within the allowed boundaries:

```text
T10_ARCHITECTURE_DECISION_REQUIRED
```

If a frozen baseline does not match:

```text
T10_BASELINE_DRIFT_STOP
```

Do not declare ACCEPTED unless the evidence supports it.

Do not enter T11.

---

## 25. Execution Principle

When implementation details are not explicitly fixed here:

1. prefer existing dsh-idea architectural patterns;
2. prefer existing Harness public/plugin seams;
3. keep Harness read-only;
4. keep T9 semantics unchanged;
5. choose the smallest implementation that satisfies the frozen T10 product contract;
6. do not convert an implementation convenience into a new product semantic;
7. if a necessary decision would materially change the frozen architecture, STOP and report it instead of deciding silently.
