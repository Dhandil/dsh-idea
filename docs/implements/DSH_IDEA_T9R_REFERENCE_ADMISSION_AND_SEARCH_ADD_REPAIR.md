# DSH Idea T9R — Reference Admission & Search Add Failure Semantics Repair

## 0. Task identity

Repository: `D:\Harness\harness-plugin\dsh-idea`

Remote: `https://github.com/Dhandil/dsh-idea`

Current reviewed remote `main`:
`943dce5be7412c34f924efda810e464ddb6379ee`

T9 tested executable currently under review:
`4e220714de10f15822e2a934d8e6ed1429486e54`

T9 documentation-only commits after the tested executable:
- `ac178e1e2ef9d0e03c4a742f839e152bcd200716`
- `943dce5be7412c34f924efda810e464ddb6379ee`

Harness read-only baseline:
`c291e7961a515f6d7af9304e7fd1d257929aef26`

Do not modify Harness core.

T9 acceptance is reopened only for the bounded defects in this file. Do not expand the feature set.

---

# 1. Review outcome

Remote review found four concrete issues in the accepted T9 tree.

Two are executable acceptance blockers:

1. Composer Search closes after `添加` even when the reference append failed or no live Session input seam exists.
2. The Host reference resolver silently accepts more than `MAX_IDEA_REFERENCES` distinct references by projecting the first five and leaving surplus canonical mentions raw in the direct user message.

Two additional protocol/report defects must be repaired in the same bounded pass:

3. The explicit Markdown parser does not match an empty `dsh-idea:` payload, so `@[X](dsh-idea:)` is silently treated as ordinary text instead of being rejected as malformed.
4. Same-pin occurrences with different labels are not all normalized to the Host-resolved title; only the first mention spelling is rewritten. The acceptance report also incorrectly describes missing pins as “marked unavailable” although the implementation correctly rejects them, and it inaccurately says there is only one post-tested commit.

No other T9 product scope is reopened.

---

# 2. R1 — Search Add must close only after a successful reference append

Current reviewed wiring in `packages/dsh-idea/src/client/index.ts` conceptually does:

```ts
const attachReference = (...): void => {
  const seams = appendSeamsFor(...)
  if (seams === undefined) return
  appendIdeaReferenceNotified(...)
}

add: descriptor => {
  attachReference(sessionId, descriptor)
  surface.close()
}
```

This violates the frozen T9 failure contract:

```text
append/CAS/input-seam failure
→ do not claim success
→ keep Search/Related surface available
→ show bounded failure feedback when the input seam is available
```

## Required repair

Make the attachment seam report success:

```ts
attachReference(...): boolean
```

Semantics:

```text
live seams absent
→ false
→ Search remains open

appendIdeaReferenceNotified(...) === false
→ false
→ Search remains open
→ existing localized composer notice remains the failure feedback

append succeeds
→ true
→ Search closes
```

For the Search overlay:

```ts
if (attachReference(...)) {
  surface.close()
}
```

Do not close on failure. Related already remains open after Add; preserve that behavior. Do not auto-submit. Do not mutate Idea storage.

## Required tests

Add focused tests proving:
- successful Search Add appends exactly one reference and closes;
- CAS failure leaves Search open;
- CAS failure publishes one bounded failure notice;
- failed append does not submit;
- missing/unavailable Session input seam does not close the Search surface;
- Related Add failure still leaves Related open;
- successful Related Add behavior is unchanged.

Prefer integration at the client registration/seam level where possible; do not only test the pure append helper and miss the close wiring again.

---

# 3. R2 — Enforce the five-reference admission limit loudly

Current reviewed Host code in `packages/dsh-idea/src/reference/service.ts` deduplicates pins and then does:

```ts
const selected = [...pins.values()].slice(0, MAX_IDEA_REFERENCES)
```

The existing test explicitly freezes the wrong behavior:

```text
caps five distinct references; surplus mentions stay raw
```

This is not acceptable. A user who explicitly added six Ideas must not have the sixth silently downgraded into an opaque URI-like text token while the model receives only five contexts.

The T9 contract is:

```text
MAX_IDEA_REFERENCES = 5
```

and reference failures must be loud, never silent substitution/drop.

## Required repair

After parsing and deduplicating exact pins:

```text
unique pins <= 5
→ resolve all

unique pins > 5
→ reject the pre-step
→ zero Idea recall context admitted
→ no model request
```

Do not slice, drop later pins, leave surplus mentions raw, silently pick the first five, or substitute current versions.

Duplicates of the same exact `(ideaId, versionId)` count once.

## Required tests

Replace the wrong surplus-raw test with:
- 5 distinct exact pins → enter, 5 projected;
- 6 distinct exact pins → reject;
- 6 occurrences containing only 5 unique exact pins → enter, 5 projected;
- over-limit rejection makes zero model calls;
- over-limit rejection publishes no partial recall context.

---

# 4. R3 — Explicit malformed Markdown references must fail loud

Current parser pattern in `packages/dsh-idea/src/reference/uri.ts` uses a payload shape equivalent to:

```regex
dsh-idea:[^)\s]+
```

Because `+` requires at least one character, this explicit mention:

```text
@[X](dsh-idea:)
```

does not match the parser at all and therefore survives as ordinary text.

That contradicts the protocol rule that explicit Markdown Idea mentions with malformed/non-canonical URIs reject rather than silently degrade.

## Required repair

Match explicit Markdown mentions even when the URI payload is empty, then let the canonical decoder reject it.

Use the same defensive shape as the established Harness session-reference parser where appropriate, conceptually:

```regex
@\[((?:\\.|[^\\\]])*)\]\((dsh-idea:[^\s)]*)\)
```

Do not broaden into arbitrary bare-URI detection unless necessary.

`decodeIdeaReferenceUri()` remains the canonical validator.

## Required tests

Add at least:

```text
@[X](dsh-idea:)
→ parser throws / pre-step rejects

@[X](dsh-idea:non-canonical-or-invalid)
→ rejects

valid canonical mention
→ still parses

ordinary prose containing “dsh-idea” but not explicit canonical mention syntax
→ stays ordinary prose
```

Preserve Unicode and escaped-label tests.

---

# 5. R4 — Rewrite every selected mention occurrence, not only one spelling per pin

Current resolver builds one readable map entry per resolved pin using:

```ts
parsed.find(...).mention
```

If the same exact pin occurs twice with different display labels, only the first mention spelling is rewritten. The other valid canonical reference remains raw in the direct message.

The Host owns the readable title. Client labels are presentation only.

## Required repair

For every parsed occurrence whose exact pin is admitted:

```text
canonical occurrence
→ resolve pin
→ rewrite that occurrence to Host title
```

All occurrences of the same pin must be rewritten even when their labels differ.

Recommended approach:
- key resolved canonical versions by `(ideaId, versionId)`;
- iterate/rewrite parsed occurrences, not one `mention` per unique pin;
- use the Host-resolved exact-version title for readable text.

Do not trust the client label as semantic content.

## Required tests

Add:

```text
same exact pin + label A
same exact pin + label B
→ one recall projection
→ both mention occurrences rewritten
→ neither raw dsh-idea mention remains
→ Host exact-version title used in both readable spans
```

Also retain the existing duplicate-identical-mention test.

---

# 6. Documentation corrections

Update `docs/DSH_IDEA_T9_SEARCH_REFERENCE_ACCEPTANCE.md`.

Correct these points:

1. Missing/deleted Idea/version references:
   - implementation semantics are **fail loud / reject before model request**;
   - do not describe them as “marked unavailable”.

2. Post-tested commit chain:
   - `4e220714...` is followed by two docs-only commits:
     - `ac178e1...`
     - `943dce5...`
   - do not say the acceptance/report commit is the only commit after the tested SHA.

3. After T9R, supersede `4e220714...` as the accepted executable baseline while preserving history.

Do not rewrite old commits.

---

# 7. Scope freeze

T9R changes only:
- reference admission/normalization;
- Search Add failure/close semantics;
- tests;
- T9 acceptance documentation.

Do not change:
- Search ranking;
- Search field weights;
- Search result limit;
- Related candidate retrieval;
- Related one-call usefulness judge;
- Save Idea flow;
- lifecycle/archive/restore/delete;
- domain version;
- storage schema;
- continuation/evolution;
- exact-version reference identity;
- reference payload budget;
- proactive resurfacing;
- PAH / Memory / Knowledge;
- Harness core.

No migration. `DOMAIN=idea/v3` remains.

---

# 8. Focused test sequence

Before full regression, run focused tests covering the repaired areas.

At minimum:

```text
reference-uri
reference-service
reference-projection
client-search
client-related
client registration/integration seam
```

The focused suite must prove R1–R4 directly.

Then run the complete plugin suite.

---

# 9. Static/build gates

After focused tests and architecture audit:

```powershell
pnpm generate:typert
pnpm typecheck
pnpm build
pnpm build:client
git diff --check
pnpm test
```

If the repository has a canonical verify command, it may additionally be run, but record the individual gates above.

No real provider/model call in automated tests.

---

# 10. Architecture audit

Before runtime acceptance, explicitly verify:

```text
Search = zero auxiliary LLM calls
Add = zero auxiliary LLM calls
Reference resolution = zero auxiliary LLM calls
Related = exactly one judge call after explicit user action
Summarize = existing explicit extraction only
```

Also verify:

```text
>5 unique refs → reject, not truncate
deleted/missing exact pin → reject
malformed explicit mention → reject
same pin/different labels → every occurrence normalized
Search append failure → card remains open
Search append success → card closes
Related append failure → overlay remains open
```

Harness tracked tree must remain unchanged.

---

# 11. Zero-provider smoke

Run fresh at the new executable SHA using an isolated providerless home.

Verify at minimum:
- plugin boots;
- Composer `+ → Idea` opens Search;
- Search normal success path still works;
- Settings Search works;
- no provider/model calls;
- no console/page/failed-request regression;
- clean shutdown and port release.

---

# 12. Real Playwright acceptance

Because T9R changes executable code after the T9 E2E evidence, establish a new tested SHA and bind runtime evidence to it.

After all offline gates pass, run the full T9 A–H acceptance once on fresh isolated storage.

Additionally include focused browser proof for R1 if practical:

```text
force/reference-append rejection through a deterministic browser seam
→ Search card remains visible
→ no prompt sent
```

If inducing a genuine browser CAS failure safely is disproportionately artificial, the deterministic client integration test is authoritative for R1, while the real-browser Search success path remains mandatory.

For reference-admission R2–R4, deterministic Host integration tests are authoritative. Do not create six billable model calls just to test a pre-step rejection; the pre-step tests must prove the model is never reached.

Final A–H must remain green.

---

# 13. Runtime hygiene

Mandatory cleanup:
- close test tabs/windows when no longer needed;
- stop obsolete Harness test instances;
- terminate only test-owned Playwright/Chromium children;
- release test ports;
- remove token-bearing temporary logs/files;
- do not touch unrelated user browser windows/processes.

Report cleanup explicitly.

---

# 14. Git / checkpoint discipline

Start from current remote `main` after fetch.

Do not rewrite accepted history.

Implementation commit should be narrowly named, e.g.:

`fix: harden idea reference admission`

After all offline gates and final runtime acceptance, record:

`T9R_TESTED_SHA`

Then update the T9 acceptance report as docs-only and commit separately:

`docs: update dsh-idea t9 acceptance`

Record:

`T9R_ACCEPTANCE_SHA`

Final verification:

```text
local HEAD == origin/main
working tree clean
Harness SHA unchanged
post-tested diff documentation-only
```

---

# 15. Final report fields

Return at least:

```text
DSH_IDEA_T9_ACCEPTED

T9_TESTED_SHA=<new executable SHA>
T9_ACCEPTANCE_SHA=<new docs-only acceptance SHA>
HARNESS_SHA=c291e7961a515f6d7af9304e7fd1d257929aef26
DOMAIN=idea/v3

SEARCH_ADD_FAILURE_KEEPS_CARD=PASS
REFERENCE_LIMIT_OVER_5=REJECT
MALFORMED_EMPTY_REFERENCE=REJECT
DUPLICATE_PIN_DIFFERENT_LABELS=NORMALIZED
MISSING_PIN=REJECT_BEFORE_MODEL
EXACT_VERSION_REFERENCE=PASS
SEARCH=PASS
RELATED=PASS
SETTINGS_SEARCH=PASS
ZERO_PROVIDER_SMOKE=PASS
PLAYWRIGHT_A_H=PASS
RUNTIME_CLEANUP=PASS
HARNESS_UNCHANGED=true
ORIGIN_VERIFIED=true
TREE=CLEAN
```

Do not report T9 accepted before the new executable SHA has passed the required gates and runtime evidence.
