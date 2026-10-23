# E6 Stability Repair — independent architecture review

Status: `DSH_IDEA_E6_STABILITY_READY_FOR_ARCHITECTURE_REVIEW`.

- Branch created directly from main: `codex/dsh-idea-e6-stability`.
- Base/main: `9fcee9888390cd04d4a87bbf837c04bebfa92f61`.
- Fix/tested SHA: `e4c01df58f1a655f83dde0c35148fab1e7b32dfe`.
- Harness: `86a402200d95fecef4529d969836f1fe13c6cb0d`.
- Node `v24.21.0`, installed pnpm `11.28.5`, Vitest `4.1.11`.
- Provider calls: **0**; only scripted/loopback fixture requests.
- Evidence: `DSH_IDEA_E6_STABILITY_EVIDENCE_20261023.json`.

This report requests independent review. The E6 change has **not** been integrated
into Runtime Repair, and no fresh complete `pnpm verify` was run ahead of that
review. Main is unchanged; the Runtime branch remains at `35531f30...`.

## Root cause established before repair

The original E6 was instrumented transiently in test code only, before changing
its synchronization. An original focused execution passed; the original
default-parallel 19-file run failed E6 at 5000ms, with 334/335 passing overall.
The failing event sequence was:

| Elapsed from E6 start | Observed event |
| --- | --- |
| 18.384ms | Harness ready |
| 47.821ms | First HTTP request: index embedding |
| 81.662ms | Disk embedding record readable; memory publication had not occurred; total requests = 1 |
| 89.453ms | Semantic retrieval invoked |
| 89.802ms | Retrieval already resolved with zero candidates; no Query HTTP request |
| 93.664ms | Embedding KvTable memory publication event |
| About 5017ms | Vitest reports original 5000ms timeout |

The problem was **a readiness race, not a five-second initialization cost**.
Disk visibility preceded memory publication by 12.002ms in this sample. Retrieval
read the empty in-memory index, legitimately returned no eligible candidates and
never dispatched Query. Later publication did not re-run that completed
retrieval. E6 then waited for an aggregate request count to increase, which could
not repair its failed precondition.

Read-only source and the actual installed compiled libraries corroborate this
ordering at Harness SHA above:

- `packages/storage/storage-json/src/atomic.ts`: rename publishes the path, then
  awaits directory fsync before resolving durability. Its compiled `lib/index.js`
  contains the same ordering.
- `packages/storage/storage-domain/src/domain.ts`, `KvTableImpl.put`: await
  backend `putRecord`, update `records`, then emit public `domain/changed`. The
  compiled library has the same ordering.
- Idea `semanticResurfacingViaEmbedding` reads that in-memory table, returns
  immediately when no records are eligible, and does no query-time retry.

This is correct product/storage behavior. The faulty assumption was in E6.
Tracing adds small synchronous metadata I/O and can perturb schedules; the source
contract and previously observed uninstrumented failures independently support
the existence of the window. One trace is not a failure-rate estimate.

## Other fixture defects investigated

1. **Budget composition:** both original `until` calls independently allowed
   5000ms inside a test whose callback itself had a 5000ms limit. The Query wait
   started about 89ms into the failing callback, so its own deadline extended
   beyond the remaining test budget. Raising a timeout would not make a missing
   Query exist.
2. **Count is not Query admission:** aggregate request count does not establish
   which request entered a handler or whether the expected Query is parked.
   Extra index requests could also satisfy a count condition. That second risk
   was not observed as the cause in this failing trace; it is separately covered
   by the new gate regression.
3. **Failure cleanup:** original `release`/`pending` were scoped inside `try` and
   released only on the happy path. An assertion or wait failure after handler
   entry could leave the handler parked while `server.close()` waited for it.
   The trace above did not enter the Query gate; cleanup risk is therefore
   documented separately, not claimed as the cause of that observation.

## Minimal test-only repair

Only three test files changed in the implementation commit:

- E6 callback in `tests/resurfacing-mute-suppression.spec.ts`.
- Focused helpers in `tests/helpers/e6.ts`.
- Six fixture regression tests in `tests/e6-fixture.spec.ts`.

The callback subscribes before Idea creation and waits for the **target** public
embedding `put` publication, which follows durable and in-memory publication.
It retains the disk-record existence assertion. It then installs a gate for the
exact deterministic Query and awaits actual handler entry. Retrieval returning
before entry fails immediately instead of spending another polling timeout.

Assertions now prove exactly one expected Query, unreleased/in-flight retrieval,
unmuted-before and persisted-muted-after states, no completion before release,
and the original empty-candidate post-I/O result. The original race remains:
mute lands **after Query dispatch and before its result**. No extra Query/model
call, product retry or product hook was introduced.

All work shares one monotonic 4000ms fixture deadline, leaving nominal cleanup
space inside the unchanged **5000ms** test callback limit. No phase gets a fresh
5000ms allowance. Phase failures are named, and request cancellation is connected
to a real AbortController. Finally releases the gate idempotently, aborts and
settles the request, removes the publication listener, disposes context, closes
servers and removes storage. Cleanup was exercised against a real loopback HTTP
server for both injected assertion and work-budget failures.

The helper tests also cover wrong domain/table/key/delete events, early
publication, extra index traffic, a wrong Query, premature empty completion,
shared rather than reset phase budgets, and refusal of a 5000ms work budget.
The clock injection is fixture-only and makes its budget regression deterministic.

## Verification and timing evidence

The matrix was fixed before execution. Each trial started a new test process
with a unique Vite cache. Trials were launched sequentially, but each retained
Vitest's **default parallel file execution**, not a serial workaround. No retry,
test skip, timeout increase or default-parallelism change was made.

| Check | Result |
| --- | --- |
| Initial repaired focused diagnostic | 16/16 PASS |
| Prescribed focused matrix: two files | **10/10 trials PASS; 16/16 each (160 total)** |
| Prescribed parallel matrix: 20 related files | **10/10 trials PASS; 341/341 each (3410 total)** |
| Additional repaired parallel phase trace | 341/341 PASS |
| Final Typecheck | PASS |
| Product/config/lockfile diff against base | Empty |

The first development typecheck caught a mistaken test-only default type import;
it was corrected before the final typecheck and both stability matrices. No red
matrix iteration was discarded or retried to green. The initial original E6
failure remains in the evidence.

Focused trial wall times were 922–965ms; related parallel trial wall times were
4260–4400ms. These are suite times, not individual E6 duration. In the repaired
parallel sample, harness readiness was 15.251ms, index publication 76.656ms,
Query gate entry 86.203ms, persisted mute 118.927ms, result assertions 123.641ms,
and cleanup completion 143.122ms. Aggregate transform/import times across files
are not treated as E6's callback budget. These samples establish ordering and
observed headroom, not a general performance claim.

The related matrix reuses the prior 19-file filters (schema, service, version,
lifecycle, semantic core/index/retrieval, resurfacing preference/budget/mute,
P2-Lite update/client and package exports), adding `e6-fixture.spec.ts`.
The full suite is deliberately deferred to the post-review integration gate.

## Isolation, cleanup and next gate

Since base main has no runtime wrapper, the immutable Runtime Repair helper from
`de58e73...` was loaded in memory solely as execution scaffolding. No Runtime
commit was merged or copied into this branch. Its run owned all HOME/DSH_HOME,
TMPDIR, caches, temporary native-loader config, dependency aliases and logs under
repository `.dev/runs/<task-id>/`. pnpm used its existing installed JS entry;
Typecheck used the existing TypeScript binary. No dependency install/relink was
performed. Temporary config changed only root/cache location, not test settings.
Node's typeless-package warning for that temporary config was retained; package
metadata was not changed to hide it.

Before deleting transient evidence, only synthetic counts and phase summaries
were retained in the companion JSON. All test child groups exited. The task
controller performed owner-checked cleanup and exited normally. Final checks:
owned run absent; zero runs/receipts/leases/open run handles; legacy Typert,
`.vite` and `.vite-temp` paths absent. No browser was started, no shared service
stopped, and normal DSH/browser data was not read or modified. OS/shared-tool
exceptions remain explicit; no claim of universal system-temp enumeration.

After **independent E6 acceptance**, integrate the fix into the still-independent
Runtime Repair branch and run **one fresh complete `pnpm verify`** with its normal
settings. Preserve raw outcome if that Full fails; do not repeatedly run it until
green. This submission does not self-approve that review or execute the later
gate. Main, Runtime branch and unrelated drift are preserved.
