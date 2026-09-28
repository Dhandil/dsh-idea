# DSH Idea — T11.1 Harness-LLM Semantic Retrieval Acceptance

Outcome: `DSH_IDEA_T11_1_HARNESS_LLM_SEMANTIC_ACCEPTED`

## SHAs

| Item | Value |
| --- | --- |
| Starting SHA (= origin/main) | `7ad1bac00e384ea3715893026ff0cfa990c09ff7` |
| Pre-T11.1 tested executable | `a03e5029e16961dc00b7b9291bac8e57313deec1` |
| Harness SHA / version | `ddefc45fbc7f8e46dd73185e68295696d1297887` (0.1.6-alpha.2) |
| T11.1 tested executable SHA | `1afd6f0d5f8adda709709f645918229f59dd575a` |
| Docs-only acceptance SHA | see "Remote verification" below |

## Architecture audit (§32) — all PASS

Harness unchanged (HEAD `ddefc45f`, tracked diff 0) · idea/v3 unchanged (`src/spec.ts` version 3) · idea_semantic/v1 unchanged (`IDEA_SEMANTIC_DOCUMENT_VERSION = 1`) · no new Remote · client contract unchanged (no `src/client` diff) · RRF unchanged (`resurfacing/hybrid.ts` untouched) · mode llm/embedding/off implemented · default llm · legacy config compatibility exact · llm reuses current Session route · no second credential · no local model · no provider adapter · small corpus all-candidate · large corpus broad top-12 · selector payload bounded · selector output strict · post-selector canonical revalidation · selector failure lexical-fallback · selector cancellation preserved · T10 Judge unchanged · T10 durable budget unchanged · embedding backend preserved · off mode inert · T9 unchanged · T12 not started.

## Frozen semantics proofs

- **Config mode resolution**: `tests/semantic-config.spec.ts` — explicit `mode` beats `enabled` in all four directions; `mode: 'hybrid'` rejected `mode-invalid`; llm/off resolve with inert provider placeholders.
- **Default llm**: mode absent + enabled absent → `llm`; shipped `cordis.patch.yml` sets `mode: llm`.
- **Legacy enabled compatibility**: `enabled: true` → embedding, `false` → off, absent → llm; embedding keeps the full accepted validation chain (base-url/model/dimensions/timeout/batch/api-key-env reasons).
- **Session model-route reuse**: `tests/semantic-llm.spec.ts` "llm route reuse" — lazy `sessionQuery`/`agentDefaultModel`/`llm` resolution; Session projection provider/model used verbatim (`session-provider`/`session-model`), projected `reasoningEffort: 'high'` preserved, null projection falls back to the host default; exactly one call; `system === SELECTOR_SYSTEM_PROMPT`; no `tools` key; user message `source: {kind:'plugin', plugin:'dsh-idea'}`; `sessionId` = the requesting session.
- **No second credential / no local model / no provider adapter**: the llm path carries only `{provider, model, reasoningEffort?, messages, system, sessionId, signal?}` — no key material, no API-key env, no new provider or local runtime; selector prompt contains no key text.
- **Small-corpus all-candidate**: corpus ≤ 12 passes through whole in corpus order (selector spec passthrough; llm spec "sends every eligible idea"); a zero-lexical-overlap idea ("Orchid greenhouse" vs "quantum capacitor" turn) is still recovered by the selector.
- **Large-corpus broad top-12**: 13+ corpus → deterministic broad lexical top-12 (score DESC → updatedAt DESC → ideaId ASC; every positive-score candidate kept; zero-score recency fill; equal-score tie-break covered with an 14-candidate corpus so sorting actually engages).
- **Payload bound**: `projectWithinBudget` over `SEMANTIC_SELECTOR_PAYLOAD_LIMIT = 48_000`; degradation order useWhen → currentConclusion → core; identity trio + version pin survive every state; extreme-pressure test ends at identity + clipped core; serialized size asserted ≤ limit.
- **Strict parser**: raw `JSON.parse` only — prose, Markdown fences, extra root fields, non-array/missing `ideaIds`, non-string/unknown/duplicate ids, and >12 ids all reject as `invalid-model-output`; model order preserved; no retry (exactly one selector call on every degraded outcome).
- **Semantic-only recall**: the selector never judges usefulness-now (system prompt asserts "Do not decide"), and no lexical floor is applied to the pool it sees.
- **Post-selector canonical revalidation**: mid-stream (scripted generator mutation) `deleteIdea`, `archive`, `manualEdit` (stale version pin never remapped), and `continueDiscussion` (discussion-descendant) each drop the pick with ranks compacted; survivors keep pinned `evaluatedVersionId` identity.
- **Cancellation**: pre-route abort → `request-cancelled` with 0 calls; mid-stream abort → `request-cancelled` with 1 call, no retry; Remote boundary maps both plus `signal.aborted` to `gateway/cancelled`.
- **Failure → lexical fallback**: selector stream failure or non-success finish → empty semantic branch, budget untouched, and the lexical candidate still reaches the unchanged Judge and is surfaced; both-branches-hit preserves RRF order with `presentInLexical`/`presentInSemantic` flags.

## Regression proofs

- **Embedding backend preserved**: `semantic-core`/`semantic-index`/`semantic-provider`/`semantic-retrieval` suites pass; `semantic/service.ts` diff contains only doc comments, `enabled` → `mode` gates, and the re-located entry-abort branch — embedding indexing/coalescing/reconciliation/retrieval bodies verbatim.
- **llm-mode isolation**: zero embedding HTTP requests, zero `idea_semantic` vector writes (`embeddingExists === false`), zero reconciliation.
- **Off mode inert**: zero selector calls, zero embedding requests, empty candidates.
- **T9/T10 regression**: search, resurfacing (detector/retrieval/hybrid/budget/judge/suppression), preparation, evolution, related, lifecycle, remote, and client suites all pass.
- **Durable budget**: selector success and every degraded outcome leave `getResurfacingBudget().consumed` false; Final Delivery Gate claim returns `CLAIMED` once then `ALREADY_CONSUMED`.
- **Judge unchanged**: `resurfacing/*` untouched; end-to-end LLM-semantic candidate judged via the existing `judge` API; Judge input text contains no `semanticRank`/selector provenance.

## Static gates (§33)

`pnpm setup:dev` ✓ · `pnpm generate:typert` ✓ · `git diff --check` ✓ · `pnpm typecheck` ✓ · `pnpm build` ✓ · `pnpm build:client` ✓. idea/v3 = 3, idea_semantic/v1 = 1, no new migration, no T12 executable files.

## Canonical Full (§34)

Pre-T11.1 baseline: 46 files / 712 tests. Post-T11.1: **49 files / 776 tests, all green** (+3 new spec files: `semantic-config`, `semantic-selector`, `semantic-llm`; +64 tests). Run as the last executable gate; no executable drift after.

### Load-hardening repair inside the gate

First two Full runs failed only in the pre-existing T11 spec `tests/semantic-index.spec.ts` under full-suite load: (1) the `settle` helper waited record-exists + fixed 30 ms, which can observe a coalesced latest-wins write mid-flight; (2) two startup-rebuild `until` waits used the default 2 s deadline. Repair (test infrastructure only): `settle` now requires the record's `contentHash` to stay stable across a 50 ms re-read (5 s deadline), and the two startup-rebuild waits pass an explicit 10 s deadline. The embedding subject code is byte-identical (diff audited above); no frozen contract changed.

## Real external calls (§35)

`REAL_LLM_PROVIDER_CALLS=0`, `REAL_EMBEDDING_PROVIDER_CALLS=0`, `PUBLIC_NETWORK_CALLS=0`. All model streams are scripted `FakeLlm` async iterables; embedding tests use loopback-only fake servers; no real API keys anywhere.

## Remote verification (§38)

- Docs-only acceptance commit: `fe028f0c6e6be5ad698aef66e458e0d24bf3e75c`
- After push: `HEAD` = `origin/main` = `fe028f0c6e6be5ad698aef66e458e0d24bf3e75c` (equality verified via `git fetch` + `git rev-parse`)
- `T11_1_TESTED_EXECUTABLE_SHA..HEAD` = `1afd6f0..fe028f0` — docs-only: exactly one file, `docs/report/DSH_IDEA_T11_1_HARNESS_LLM_SEMANTIC_ACCEPTANCE.md` (+68), zero executable change.

## Harness / working tree

- Harness HEAD `ddefc45fbc7f8e46dd73185e68295696d1297887`, tracked diff = 0 (six pre-existing untracked scratch files untouched).
- dsh-idea final working tree: only the user's pre-existing docs drift remains (5 deleted `docs/DSH_IDEA_*.md` unstaged; `docs/architectue/`, `docs/implements/`, `docs/report/` pre-existing files untracked) — preserved, never restored or committed by this task.
- T12 not started.
