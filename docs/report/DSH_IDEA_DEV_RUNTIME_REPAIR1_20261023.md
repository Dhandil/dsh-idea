# .dev Runtime Repair 1 — architecture review evidence

Status: `DSH_IDEA_DEV_RUNTIME_REPAIR1_READY_FOR_ARCHITECTURE_REVIEW`.
This is a repair submission, **not an all-green test/architecture acceptance**.
The latest default-parallel full verify failed E6; that failure is retained below.

- Original implementation: `b3a7aec8e20fe04f4e3839a6e53c847027ef149f`.
- Accepted report/starting branch head: `801ecfa1f989d06e8a7a77e460199968aa87600b`.
- Repair / immutable tested SHA: `de58e73e24dc4622dc87c13b8c7ea8f0e86cdbeb`.
- Branch: `codex/dsh-idea-dev-runtime`; main remains
  `9fcee9888390cd04d4a87bbf837c04bebfa92f61`. No merge to main.
- Node `v24.21.0`, host/pinned comparison pnpm `11.28.5`, Vitest `4.1.11`.
- Real Provider calls: **0**. All model/embedding seams are offline doubles or
  loopback fixtures. No real DSH/browser Profile, Harness Core or product
  semantics were changed.

## 1. Validate creation before filesystem writes

`createRun` now validates label type, case-normalized label and full generated
UUID ID **before layout/ownership/directory creation**. Labels must start with a
letter/digit and contain 1–48 lowercase letters/digits/hyphens after case folding.
Invalid leading hyphens, punctuation, path components, whitespace, nonmatching
Unicode, overlength and nonstring values are rejected rather than leaving an
unaddressable owned directory. Owner process identity is established before
creation too.

Regression covers 14 invalid labels with an unchanged empty fixture root, four
valid boundary/case-folded labels that clean successfully, and all prior path,
ownership, cancellation and recovery cases. Existing invalid/unknown resources
are not silently reclassified or deleted.

## 2. Strict audit is an automatic gate

- `pnpm dev:audit:strict` / `audit --strict`: zero only for an empty inventory or
  valid active runs. Orphans, unknown runs, dangling receipts, abandoned cleanup
  locks and unexpected runtime-root entries block without deletion.
- Every wrapped command gates before execution and after cleanup. Root and
  package `verify` also enforce strict pre/post gates. Diagnostic `audit` remains
  available separately; nonzero strict status is not swallowed.
- Creation, cleanup and audit coordinate via an exclusive, owner-verified
  metadata lease. Task execution remains concurrent. Auditors do not inspect
  half-published/removed ownership records as residue.
- Legitimate concurrent active runs pass and are preserved. A live contending
  metadata operation is awaited; after five seconds, busy is reported as retry
  needed, not classified as orphan/unknown. Foreign/dead/changed/unverifiable
  metadata leases block and are never stolen.
- Audit now creates/removes its own transient lease: it is non-destructive, not
  literally zero-write. The current guide corrects the original description.
  A crash during a metadata transaction can leave a blocking lease requiring
  independent ownership review; this safety boundary is explicit.

Focused tests prove blocked preflight never executes its payload; blocked
postflight returns failure while retaining unrelated unknown residue; the CLI
strict exit is nonzero. Two mutators perform 16 create/dispose transactions with
48 concurrent strict audits without false residue or cross-run deletion.

## 3. Default-parallel E6 A/B

Reusable driver: `pnpm test:runtime:ab`.
Machine-readable sanitized evidence:
`DSH_IDEA_DEV_RUNTIME_REPAIR1_AB_20261023.json`.

Controls:

- A: frozen main `9fcee98`; B: original runtime implementation `b3a7aec`.
- Fresh source snapshots and isolated HOME/DSH_HOME/tmp for every case, all
  beneath the driver's owned run. No user Session or normal Profile is used.
- Business source, business tests and lockfile are identical between revisions.
  Both use the same installed dependency targets and identical copied formal lib
  bytes. Hashes are in the JSON; this proves input equality for this comparison,
  not an independent transitive binary/source provenance attestation.
- A keeps its original test entry/config; B keeps its runtime wrapper/config.
  Default file parallelism and E6's original **5000ms** limit are unchanged.
- pnpm is pinned to the already-installed `npm_execpath` JS entry and launched
  through the same Node binary. No Corepack release selection is allowed to
  confound the primary comparison.

Primary, version-frozen A/B/B/A results:

| Case | Revision | Passed / failed | Runner exit | E6 ms, rounded | Result |
| --- | --- | --- | --- | --- | --- |
| A1 | main | 334 / 1 | 1 | 5010 | Original 5000ms timeout |
| B1 | original runtime | 334 / 1 | 1 | 5014 | Original 5000ms timeout |
| B2 | original runtime | 334 / 1 | 1 | 5015 | Original 5000ms timeout |
| A2 | main | 334 / 1 | 1 | 5009 | Original 5000ms timeout |

Each case selected the same 19 files/335 tests; E6 was the only failure. The JSON
reporter's error string was `STACK_TRACE_ERROR`; simultaneous human reporter
output corroborated the actual original 5000ms timeout, rather than inferring it
from elapsed duration. No timeout, assertion, test content or default parallelism
was changed. The diagnostic driver completing with exit zero does **not** mean
these four runner invocations passed; their exit-one outcomes are preserved.

**Attribution:** baseline main also fails, so the runtime is not a necessary
condition or unique introduction of E6. The experiment does not prove equal
failure probabilities or identify the underlying race root cause. It provides
no basis to modify business semantics or waive the failure as a general gate.

### Exploratory trials retained

Before tool freezing, two A/B/B/A batches selected pnpm `12.15.0` through the
isolated Corepack environment. The first yielded A 1 pass/1 E6 failure, B 1 pass/1
failure; the second A 0 pass/2 failures, B 1 pass/1 failure. All were cleaned.
These eight trials remain disclosed but are not the primary attribution result.
The driver was then pinned to installed pnpm 11.28.5 and the primary comparison
above was performed. Global tooling/configuration was not changed. General
arbitrary nested Corepack commands remain a toolchain-selection boundary; the
driver's explicit pin does not claim to pin every possible external command.

## 4. Repair verification — including red outcomes

| Execution | Actual result |
| --- | --- |
| Initial focused runtime tests | 30/30 PASS, no skipped cases |
| First complete `pnpm verify`, working-tree review | Exit 0: runtime 30/30, **default-parallel 64 files/1046 tests PASS**, Typert/typecheck/Host + Client build and strict pre/post PASS |
| Repaired default-parallel focused regression | Exit 1: **334/335 PASS**, only E6 5000ms timeout; run removed |
| Complete `pnpm verify` at immutable repair SHA | **Exit 1**: runtime 30/30 PASS, Typert/typecheck PASS, **1045/1046 PASS**, only E6 5000ms timeout; run removed |
| Host/Client builds after immutable verify short-circuited | Both separately PASS; runs removed |
| Explicit final strict audit | PASS, empty |

The latest immutable verify failure is authoritative; the earlier green run is
not substituted for it. The normal `&&` chain skipped builds/post-verify commands
after test failure, so those stages were separately executed and explicitly
identified above. There was no retry to turn the last red verify green, no serial
substitution, exclusion, timeout increase or failure masking. E6 remains a
review boundary despite its successful run in the earlier full verification.

The focused regression uses the same filters as the original runtime report,
with **no** `--no-file-parallelism`. Full verify runs the entire existing business
suite with its default parallelism, not just that subset.

## 5. Cleanup and publication scope

- Successful, failed and canceled task fixtures were disposed. Controlled
  crash/uncooperative fixtures were reclaimed only after owner/child/handle
  checks allowed it. Unknown fixture contents stayed intact during gate checks;
  only their enclosing task-owned test environment was later disposed.
- Strict inventory empty; runs/receipts count zero; lifecycle lease absent.
  Exact-run open-handle scan found zero. Legacy Typert workspace, `.vite` and
  `.vite-temp` paths are absent.
- Protected `dsh-invariants` link target, inode and nanosecond mtime unchanged.
  No project dependency install/relink, global MCP/browser launch or shared-service
  shutdown was performed. Corepack exploratory resources were confined to runs.
- No business source/test, lockfile, Typert generator/config, client build config,
  Storage/Migration or Freeze changes relative to the original implementation.
  Formal lib was regenerated by the required builds at its existing location.
- OS-managed/non-enumerable and shared-service exceptions from the original
  runtime remain explicit; no claim that all third-party/system artifacts vanish.
- The follow-up report/evidence commit is docs-only. The original report remains
  unchanged as history. Main, existing worktree and unrelated drift are preserved.
  Branch push and fetch/ls-remote equality are reported in the final response.
