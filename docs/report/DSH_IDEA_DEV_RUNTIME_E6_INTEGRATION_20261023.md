# Runtime + E6 integration — final review submission

Status: `DSH_IDEA_DEV_RUNTIME_INTEGRATION_READY_FOR_FINAL_REVIEW`.

This submission records the single fresh complete verification after independent
E6 acceptance. It does not merge main or declare final architecture acceptance.

## Revisions and scope

| Item | SHA |
| --- | --- |
| Main, unchanged | `9fcee9888390cd04d4a87bbf837c04bebfa92f61` |
| Runtime starting head | `35531f30fb9c942e2a77d8a60ec39dd345f71d82` |
| Independently accepted E6 implementation | `e4c01df58f1a655f83dde0c35148fab1e7b32dfe` |
| Integrated implementation / tested commit | `32d1879bfc14d48a93a37e11dd133c4105d5d47b` |
| Harness, read-only dependency checkout | `86a402200d95fecef4529d969836f1fe13c6cb0d` |

Remote main, Runtime and E6 heads matched their expected values before mutation.
The worktree was clean and was the repository's only worktree. The existing
`codex/dsh-idea-dev-runtime` branch received a conflict-free cherry-pick of
**only the accepted E6 implementation**; the E6 report commit was not imported.

The cherry-picked change is exactly the three accepted test files. Their bytes
match the accepted E6 commit, and both commits have stable patch ID
`6511a35c858f28d94cfb8e6a82ff9a3483ca9d49`. Every other Runtime file matches
the starting Runtime head. Product source, lockfile, compiler/build configs,
Storage/Migration and Freeze are unchanged. No business behavior, timeout,
parallelism or assertion was edited during integration.

The earlier Runtime report's E6 failure remains unchanged as historical evidence.
This green integration result follows an independently accepted synchronization
repair; it does not replace or reinterpret the earlier red result.

## Execution environment

Node `v24.21.0`, pinned installed pnpm `11.28.5`, Vitest `4.1.11`;
Client build used tsdown `0.22.14` / rolldown `1.2.8`.

All resource-producing execution entered the accepted `scripts/dev-run.mjs`
wrapper. Preparation and Full used **different, newly owned run directories**.
Nested normal project scripts reused their enclosing run. HOME, DSH_HOME,
TMPDIR, XDG paths, logs and caches were isolated below that run. Full began
without a Vite cache; no cache from focused tests was carried into it.

A run-owned executable alias selected the existing pnpm JS entry for nested
`pnpm` commands, bypassing Corepack release selection. Corepack network selection
was disabled for the task. No package installation, dependency relinking,
global tooling/config change or custom Vitest configuration was performed.

## Focused and static gates before Full

| Gate | Actual result |
| --- | --- |
| Runtime focused | **30/30 PASS**, zero failed/cancelled/skipped/todo |
| E6 + failure-cleanup fixtures | **2 files / 16 tests PASS** |
| Related regression, default parallel | **20 files / 341 tests PASS** |
| Typecheck | PASS, exit 0 |
| Patch identity / scope / diff whitespace checks | PASS |

The related filters are recorded in the evidence JSON. They retain normal file
parallelism, with no timeout override, retries or test skips. The related run
printed an existing React `act(...)` warning in client lifecycle coverage; the
run still passed and no unrelated UI/test change was made.

## Unique fresh complete pnpm verify

**Invocation count: 1. Exit: 0. Wall time: 38,699ms. No Full retry or rerun.**

Executed the unmodified root `pnpm verify` script, including its normal package
verification chain:

| Full stage | Actual result |
| --- | --- |
| Root strict pre-audit | PASS; only this valid active run |
| Runtime lifecycle tests | **30/30 PASS**; 0 fail, cancel, skip, todo |
| Package strict pre-audit | PASS; only this valid active run |
| Typert generation | PASS; Host and Remote artifacts emitted |
| Typecheck | PASS |
| Complete default-parallel Vitest | **65 files / 1052 tests PASS** |
| Host TypeScript build | PASS |
| Client build | PASS; 2 files, 2.27MB reported; 93ms |
| Package strict post-audit | PASS; only this valid active run |
| Root strict post-audit | PASS; only this valid active run |

Full passed **1082 test executions** in total (30 lifecycle + 1052 plugin tests).
The 1052 plugin tests include all discovered tests, with no nonpassing remainder.
The Vitest stage reported 8.60s wall time; aggregate transform/import/test timings
are not an individual E6 duration or a performance claim. Default parallelism
and the original 5000ms E6 test limit were preserved; the accepted 4000ms shared
fixture work deadline and all accepted assertions were unchanged.

Client build retained tsdown's informational dependency-bundling hint and
reported `zod` in the bundle. No build option was changed to suppress it.

The companion evidence preserves the **complete captured Full terminal log**,
with repository/run paths and synthetic run ID replaced by placeholders, plus
its raw-log SHA-256, stage counts and exit status. The raw fingerprint identifies
this invocation; it is not a reproducible-build or transitive dependency
attestation. Temporary raw files were removed only after this sanitized evidence
was captured. There was no failure to re-run or hide.

## Strict audit, cleanup and external exceptions

Both enclosing runs emitted `removed: true`. Controller processes exited
normally. Final independent metadata/handle checks found:

- Both exact task run paths absent.
- Zero runs and zero ownership receipts; no lifecycle lease.
- Zero open handles referencing either task run.
- Both controller PIDs absent.
- Legacy Typert workspace, package `.vite` and `.vite-temp` absent.
- Final `node scripts/dev-run.mjs audit --strict`: exit 0, empty inventory.
- Protected `dsh-invariants` symlink target, inode and nanosecond mtime unchanged.
- Working tree clean before adding this report/evidence. The Harness checkout
  retained its preexisting untracked `deepseek-harness` entry unchanged.

The automatic audits correctly accepted the live outer run; an active entry
during execution is not residue. Runtime tests also exercised controlled failure,
cancellation, concurrency, unknown/orphan ownership and strict refusal paths,
then disposed their own fixtures.

| Registered exception | End check / treatment |
| --- | --- |
| OS sockets, shared memory, crash reports/services | `not-enumerable`; no broad system scan or universal absence claim |
| Shared MCP/browser binaries, package stores and Harness links | `not-enumerable`; preserved, not relocated or cleaned |
| Existing pinned pnpm JS entry | `still-present-not-deleted`; used read-only; run alias removed |
| Official package `lib` | `still-present-not-deleted`; required builds regenerated formal outputs in their existing location |

No browser was launched, no shared service stopped, and no real DSH Profile,
normal browser Profile or user Session was read or changed. Harness Core was
not modified. Provider calls: **0**; tests used existing offline doubles and
loopback fixtures. Runtime path/lifecycle isolation is not a network sandbox.

## Publication and review boundary

Only this report and its sanitized evidence follow the integrated tested commit;
they do not change executable inputs. The Runtime branch is pushed independently.
Main and the E6 branch remain unchanged; no merge to main is performed. Final
push/fetch/ls-remote equality and report SHA are returned with this submission.

Evidence: `DSH_IDEA_DEV_RUNTIME_E6_INTEGRATION_EVIDENCE_20261023.json`.

Stop here for independent final architecture review. Do not run another Full
or advance main as part of this submission.
