# DSH Idea V1 — T6R Related Ideas Acceptance Repair

## 0. Task identity

Task:

T6R — Related Ideas Acceptance Repair

Repository:

D:\Harness\harness-plugin\dsh-idea

Repair base:

1778c84c1d78e3fa40ad771f76ea42a0125a7fdc

Harness reference, read-only:

D:\Harness\deepseek-harness

Expected Harness SHA:

c291e7961a515f6d7af9304e7fd1d257929aef26

Do not modify Harness core.

This is a focused acceptance repair. Do not enter T7 automatically.

---

## 1. Why this repair is required

Remote architecture review of `Dhandil/dsh-idea` at T6 checkpoint `1778c84` found two remaining acceptance gaps.

### R1 — Candidate payload truncation does not implement the frozen field-priority policy

Current `src/related/retrieval.ts` uses one shared per-field budget rung:

```text
[∞, 4000, 2000, 1000, 500, 250, 120, 60, 0]
```

At each rung, all semantic fields are clipped to the same budget.

That means low-priority `possibleValue` and high-priority `core` are degraded together.

But T6 froze this preservation priority:

```text
1. title
2. core
3. currentConclusion
4. useWhen
5. openQuestions
6. motivation
7. possibleValue
```

Identity + title must always survive, and when payload pressure requires loss, lower-priority fields must be reduced before higher-priority fields.

The current implementation is bounded and safe, but it does not meet the frozen retrieval-quality contract.

### R2 — The reported startup smoke used `--dump-config`, which explicitly does not boot Harness

The T6 report used:

```powershell
pnpm dsh web --dump-config
```

as the startup smoke.

At the pinned Harness baseline, the CLI documentation/source defines `--dump-config` as a boot-free config-composition diagnostic.

Therefore it proves the patch row appears in the composed tree, but it does not prove:

- the Host imports `@dsh-external/dsh-idea/related`;
- the plugin initializes;
- the web client bundle mounts;
- the generated Remote contribution mounts at runtime.

T6 acceptance requires one real zero-provider web startup smoke.

---

## 2. Scope

Only repair:

1. candidate payload priority preservation;
2. real zero-provider startup/mount smoke.

Do not change:

- candidate eligibility;
- lexical scoring weights;
- CJK/English feature extraction;
- Top-12 policy;
- LLM usefulness prompt semantics;
- Remote API;
- Related result persistence semantics;
- Save Idea;
- Continue Discussion;
- Evolution;
- Harness core.

Do not add embeddings/vector/BM25/FTS dependencies.

---

## 3. R1 — Priority-aware payload degradation

Keep:

```text
RELATED_PAYLOAD_LIMIT = 48_000
RELATED_CANDIDATE_LIMIT = 12
```

Keep candidate identity and title always present.

The required preservation order is:

```text
highest priority
title
core
currentConclusion
useWhen
openQuestions
motivation
possibleValue
lowest priority
```

When the full payload exceeds 48,000 characters, degrade fields from lowest priority to highest priority:

```text
possibleValue
→ motivation
→ openQuestions
→ useWhen
→ currentConclusion
→ core
```

Do not reduce a higher-priority field while a lower-priority field can still be reduced further.

Title must never be dropped or truncated beyond its already-valid durable title value.

Idea identity must never be dropped.

---

## 4. Deterministic degradation algorithm

An accepted implementation is:

For each degradable field, from lowest priority to highest:

```text
possibleValue
motivation
openQuestions
useWhen
currentConclusion
core
```

apply a deterministic cap ladder such as:

```text
full
4000
2000
1000
500
250
120
60
0
```

Only advance to the next higher-priority field after the current lower-priority field has reached zero and the whole serialized candidate projection still exceeds 48,000 characters.

After every reduction step:

```text
JSON.stringify(projection).length
```

must be checked.

Return the first projection within the frozen payload budget.

For list fields:

```text
useWhen
openQuestions
```

use a deterministic list-budget rule. It may reuse the existing per-item truncation helper, but the whole list field must participate at its own priority tier.

Do not mutate stored candidate objects.

---

## 5. Required priority tests

Add focused tests proving semantic priority, not only total size.

### Case A — low-priority loss before high-priority loss

Construct candidates where reducing `possibleValue` alone is enough to fit.

Expected:

```text
possibleValue reduced/dropped
motivation unchanged
openQuestions unchanged
useWhen unchanged
currentConclusion unchanged
core unchanged
title unchanged
```

### Case B — multiple low tiers exhausted

Construct a payload where:

```text
possibleValue = 0
motivation = 0
```

is needed, but `openQuestions` need not be reduced.

Expected:

```text
core/currentConclusion/useWhen/openQuestions remain whole
```

### Case C — eventual high-priority clipping

Use maximal candidates so even all lower tiers at zero still require clipping `core`.

Expected:

- serialized payload <= 48,000;
- title + ideaId always present;
- lower-priority fields are already at zero before core is clipped.

### Case D — deterministic output

Same candidates + same order produce byte-identical JSON projection on repeated calls.

### Case E — stored candidates unchanged

Existing zero-mutation assertion remains.

---

## 6. Do not change lexical retrieval

The following remain frozen:

```text
title              5
core               4
motivation         3
currentConclusion  3
useWhen             3
possibleValue       2
openQuestions       2
```

Sort remains:

```text
score DESC
updatedAt DESC
ideaId ASC
```

Corpus <= 12 still passes all eligible Ideas.

Corpus > 12 still selects Top 12 deterministically.

Current continuation Idea remains excluded.

Archived remains excluded.

---

## 7. R2 — Real zero-provider web startup smoke

First, `--dump-config` may still be used as a config preflight:

```powershell
pnpm dsh web --dump-config
```

Confirm the composed tree contains:

```text
dsh-idea-related
@dsh-external/dsh-idea/related
```

But this does NOT count as startup acceptance.

Then perform a real boot:

```powershell
pnpm dsh web
```

Use the normal `web` profile already pointing to the plugin's `link:` package.

Requirements:

- do not edit Harness core;
- do not edit the web profile merely for the smoke;
- do not send a user prompt;
- do not invoke Related Ideas;
- do not make any provider/model/network API call;
- wait until the app reaches its normal ready/listening state;
- verify no loader/plugin initialization/Remote mount/client-bundle error is emitted;
- verify the process remains stable for a short bounded observation window;
- terminate it cleanly after evidence is captured.

The smoke is about startup/mount only.

---

## 8. Smoke evidence

Report concrete runtime evidence, not only config composition.

Include:

```text
command
startup/ready marker observed
dsh-idea-related loader/import evidence if logged
plugin/Remote/client error lines: none
observation duration
termination method
provider/model calls: 0
```

If normal boot does not emit a direct plugin row, runtime readiness + absence of import/mount errors is acceptable when combined with the config preflight proving the row is in the effective tree.

Do not claim `--dump-config` itself booted the app.

---

## 9. Parser note

Do not expand this repair into a parser redesign.

The current Related parser validates candidate identity and `whyUsefulNow`, while Host canonical re-projection prevents model-supplied title/core from becoming authoritative.

Exact unknown-key rejection may be considered during T7 hardening if desired.

It is not part of T6R.

---

## 10. Regression gates

Run:

```text
related retrieval focused tests
related prompt/parser tests
related service tests
remote-related tests
client-related tests
```

Then full plugin regression suite.

Preserve all accepted T1–T6 behaviors.

Expected test count may exceed the current 305.

---

## 11. Static/build gates

Required:

```text
pnpm typecheck
pnpm test
pnpm build
pnpm build:client
git diff --check
```

Run `pnpm generate:typert` only if Remote/wire declarations changed. This repair should normally require no Remote change.

All automated tests:

```text
0 real provider/network calls
```

---

## 12. Durable-state invariants

No new durable schema.

No migration.

No domain version bump.

Related Ideas remains query-only.

Required:

```text
Idea durable bytes before == after
```

for Related requests.

---

## 13. Git governance

Do not rewrite `1778c84`.

Preferred repair commit:

```text
fix: preserve related idea prompt priority
```

Push to:

```text
origin/main
```

Verify:

```powershell
git rev-parse HEAD
git ls-remote origin refs/heads/main
git status
```

Local HEAD must equal remote `main`.

Working tree clean.

---

## 14. Completion report

Return:

```text
Outcome
Repair base
R1 priority-aware projection
Priority regression tests
Full plugin tests
Typecheck/build gates
Config preflight
Real web startup smoke
Runtime readiness evidence
Provider/network calls
Harness SHA verification
Repair commit
Remote SHA verification
Known limitations
```

Do not enter T7 automatically.

---

## 15. Acceptance principles

> The 48k bound is not enough by itself; information must be sacrificed in the frozen semantic priority order.

> `--dump-config` proves configuration composition, not application startup.

> T6 is accepted only after the Related Host/client composition survives a real zero-provider web boot.
