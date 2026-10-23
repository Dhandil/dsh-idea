# Unified local execution runtime — implementation for review

Status: `DSH_IDEA_DEV_RUNTIME_READY_FOR_ARCHITECTURE_REVIEW`.

- Base / local main / verified remote main before execution:
  `9fcee9888390cd04d4a87bbf837c04bebfa92f61`.
- Branch: `codex/dsh-idea-dev-runtime`; no merge to main.
- Implementation / tested tree: `b3a7aec8e20fe04f4e3839a6e53c847027ef149f`.
- Environment: macOS, Node `v24.21.0`, pnpm `11.28.5`; no installation or global tool changes.
- Provider requests: **0**. Existing semantic tests use controlled loopback doubles.

## Changes

1. Ignore `.dev/`; create private `.dev/runs/<label>-<UUID>/` and matching
   `.dev/owners/<run-id>.json` automatically. No temporary content is committed.
2. Add reusable manager and command wrapper. Ownership binds canonical repository
   path/device/inode, run inode, random capability, host, uid and owner PID/start
   time. One task-owned process group, child identity, cleanup lock and open-handle
   proof protect concurrent/unknown/active resources. Cleanup never traverses
   symlinks or sweeps external paths, and verifies run removal before success.
3. Wrap root/package typecheck, test, Typert and Host/Client builds. Root `verify`
   includes the new runtime tests. Nested commands reuse the outer run.
4. Redirect HOME, DSH_HOME, TMPDIR/TMP/TEMP, XDG directories and supported execution
   caches. Provide run-owned browser-profile, Workspace, Storage, logs,
   screenshot/video and scratch-build paths for task code to consume explicitly.
5. Move Typert scratch copies to run-local unique workspaces. A temporary
   node_modules alias restores the original analyzer resolution after relocation;
   it points at existing dependencies and is unlinked without traversal. Formal
   generated artifacts remain in `lib/`; product runtime resolution is unchanged.
6. Move Vite/Vitest cache and coverage output into the run. Native Node 24 config
   loading prevents Vite's bundled config loader leaving package `.vite-temp`.
7. Add `AGENTS.md`, concise entry-point guidance in README, and `docs/DEV_RUNTIME.md`
   with interfaces, exception accounting and conservative orphan recovery.

No plugin product source, existing business tests, Storage/schema/migration,
Freeze, lockfile or dependency declarations changed. No Harness Core, normal
DSH/browser profile or other project's resources were modified. Required builds
regenerated the existing ignored formal output in place; no formal lib/dependency
tree was relocated or cleaned.

## Validation

| Check | Result |
| --- | --- |
| `pnpm test:runtime`, final run | **24/24 PASS**, no skipped tests |
| Unique IDs/private ownership/environment + credential filtering | PASS |
| Success, nonzero command, spawn failure | Exit status preserved; run removed |
| SIGINT/SIGTERM/SIGHUP cancellation | PASS; run removed |
| Concurrent task runs / nested wrappers | PASS; separate ownership / single outer cleanup |
| Normal command exit with surviving task descendant | Targeted graceful termination; run removed |
| Uncooperative cancellation | Active run retained and reap refused; after controlled child exit, reap PASS |
| SIGKILL of controlled owner | Auditable orphan; active reap refused, dead reap PASS |
| Path/absolute escape, symlink ancestor, substituted directory, mismatched owner | Refused; no external target deletion |
| Active child / open handle / unavailable handle scanner / changed process birth | Refused; retained until proof restored |
| Unknown orphan / linked ownership file | Refused and retained |
| External exception end check | Presence reported; external fixture preserved |
| Public `pnpm dev:run -- node ...` smoke | HOME/DSH_HOME/tmpdir all inside its run; removed |
| `pnpm generate:typert` | PASS after resolution fix; formal Host/remote artifacts emitted; run removed |
| `pnpm typecheck`, including final declaration/config revision | PASS; run removed |
| `pnpm build` / `pnpm build:client` | Both PASS; runs removed |
| Related regression set, serial files | **19 files / 335 tests PASS**, no exclusions or timeout increases |
| Same regression set, parallel files | **334 PASS / 1 E6 timeout**, twice; see boundary below |
| E6 alone with original 5000ms limit | PASS (other cases filtered out for this diagnostic only) |
| `git diff --check` | PASS |

Related regression command:

```sh
pnpm test schema.spec.ts service.spec.ts version.spec.ts lifecycle.spec.ts \
  semantic-core.spec.ts semantic-index.spec.ts semantic-retrieval.spec.ts \
  resurfacing-preference.spec.ts resurfacing-budget.spec.ts \
  resurfacing-mute-suppression.spec.ts p2-lite-update.spec.ts \
  client-p2-lite.spec.tsx package.spec.ts --no-file-parallelism
```

Vitest's substring file filters select 19 files. These cover real JSON-backed
storage, migrations/compatibility, persistence reopen, semantic fixtures,
preparation/update, client behavior and built-package exports. No unrelated full
suite or browser/provider workflow was run.

### Observed limitations and intermediate failures

- Initial Typert relocation lost access to the package's ancestor dependency
  tree and failed analysis. The final run-owned alias resolves that issue; no
  dependencies were installed/relinked, and subsequent generation passed.
- First Vite validation created an empty package `.vite-temp` outside its run.
  Its exact identity, empty scope and absence of handles were verified before
  removing that task-created empty directory. Native config loading prevents
  recurrence; final checks found no `.vite-temp`, `.vite` or old Typert workspace.
- Two parallel regression executions timed out the unchanged E6 embedding race
  case at 5000ms. E6 alone and the entire same 335-test set in serial passed.
  This is an execution-mode-sensitive observation, **not a proven root cause or
  proof of zero runtime influence**. The test, timeout and default file
  parallelism were not altered. Parallel stability remains a review boundary;
  failed executions were also cleaned successfully.

## Redirectable scope and explicit exceptions

Automatic environment redirection applies to descendants of the wrapper and
libraries honoring HOME/DSH_HOME/TMPDIR/XDG. Vitest and Typert are wired directly.
Browser profile/output, Workspace/Storage and log/screenshot/video paths are
explicit task integration interfaces, not imaginary universal third-party env
settings. This task verified their isolation through controlled processes and
filesystem tests; **no real browser was launched**.

Every run records default exception categories and emits their end status:

| Exception | End handling / boundary |
| --- | --- |
| OS sockets, shared memory, crash reports, OS/browser helper services | `not-enumerable`; no claim of absence, no broad system scan/deletion |
| Existing MCP services/browser binaries, shared package stores and Harness links | Preserved; existing processes do not inherit a new run environment |
| Known third-party exact external path | `recordException` records it; final metadata check reports present/absent; never deleted |
| Launcher/parent tool behavior before entering the wrapper | Cannot be redirected retroactively; shared front-end/tool caches remain outside scope |
| SIGKILL/power loss/failed proof or uncooperative task | Retain ownership record and resources; audit then exact-ID reap only when owner, child, group and handles are inactive |

For an existing global MCP, per-call output paths must be explicit where
supported. Unsupported paths require an exception or a separately supported,
task-owned instance; this implementation does not modify global MCP configuration
or claim to redirect an already-running MCP/browser. Task-owned browser launches
must explicitly use the exported profile/output paths. Do not escape the task
process group.

This is a cooperative lifecycle mechanism, not a hostile same-user filesystem
or network sandbox. `ps` birth evidence has second resolution. Incomplete proof
retains resources. Windows is rejected; Linux has not been certified by this run.
Credential-variable stripping is defense in depth, not a Provider/network gate.

## Cleanup and scope checks

- Final runtime audit: empty; `.dev/runs/` and `.dev/owners/` empty.
- Each success/failure/cancel validation emitted verified removal; controlled
  crash/uncooperative fixtures were subsequently reclaimed after safe proofs.
- Old `build/typert-workspace`, package `.vite` and `.vite-temp`: absent.
- `.dev` ignore rule verified; no runtime contents staged.
- All **37 historically inventoried external dependency links** retained their
  exact targets; the explicitly protected `dsh-invariants` link also retained its
  inode and nanosecond modification time.
- Local/remote main remained at the base. Existing worktree retained; only the
  new independent branch was created. Initial tracked/untracked drift was empty.
- No shared MCP or user browser was stopped. No real Profile/Session contents or
  credentials were read, and no live Provider was called.
- This report follows the implementation commit and changes documentation only.
  Branch publication and fetch/ls-remote equality are reported in the task's
  final response; no claim of architecture acceptance or main advancement.
