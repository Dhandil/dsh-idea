# Task execution directories

## Entry points

Requires the existing Node 24/pnpm toolchain and POSIX `ps` + `lsof`. No new packages
are installed. macOS is validated; Windows fails closed pending a Windows
process/handle adapter. Linux requires its own environment validation.

```sh
pnpm dev:run -- node path/to/task.mjs
pnpm test:runtime
pnpm test schema.spec.ts
pnpm typecheck
pnpm generate:typert
pnpm build
pnpm build:client
pnpm dev:audit
pnpm dev:reap <exact-orphan-run-id>
```

The root/package validation scripts wrap execution automatically. Nested wrapped
commands reuse the parent's run and leave cleanup to that parent. A plain
`vitest`/Typert invocation without an authenticated run fails with an entry-point
instruction. `setup:dev` and installation remain explicit dependency management
operations; they are not run by this manager or silently redirected.

The runtime creates `.dev/runs/<label>-<UUID>/` with mode 0700 and an independent
mode-0600 ownership receipt in `.dev/owners/`. `.dev/` is ignored; nothing there
is a durable report. The label contains only sanitized characters, and run-id
reuse/selection is not accepted by the execution CLI.

## Redirected paths

| Resource | Relative run path / interface |
| --- | --- |
| HOME / DSH_HOME | `home/`, `dsh-home/` |
| OS-aware temporary files | `tmp/`: TMPDIR, TMP, TEMP, PUPPETEER_TMP_DIR |
| XDG cache/config/data/state | `cache/`, `config/`, `data/`, `state/` |
| Browser user-data-dir | `browser-profile/`: DSH_IDEA_BROWSER_PROFILE, explicit launch option |
| Workspace / Storage | `workspace/`, `storage/`: DSH_IDEA_WORKSPACE / DSH_IDEA_STORAGE |
| Logs / screenshots / video | `logs/`, `screenshots/`, `videos/`: corresponding DSH_IDEA_* variables |
| Scratch build | `build/`: DSH_IDEA_BUILD |
| Typert analyzer | `build/typert-<UUID>/`; formal artifacts still go to package `lib/` |
| Vitest/Vite | Native Node config loader avoids package `.vite-temp`; `cache/vite/`; coverage to `logs/coverage/` |
| npm/corepack/Node execution caches | `cache/npm`, `cache/corepack`, `cache/node` |

Existing filesystem tests using `os.tmpdir()` now inherit the run's tmp path,
including tests that miss their own teardown. The parent wrapper is the final
cleanup boundary. Typert's relocated analyzer has a **run-owned** node_modules
alias to the unchanged installed package tree to retain TypeScript resolution;
cleanup unlinks this alias without following it. No formal dependency link is
recreated and no package/runtime/module identity changes.

For task scripts import `requireRun()`, then `runPath(run, 'screenshots', 'one.png')`
or the named `run.paths`. `runPath` rejects lexical escapes and symlink ancestors.
Temporary build tasks must use these paths; final shipped `lib` output remains
explicit and persistent. If stdout/stderr is not explicitly saved under `logs/`,
it remains terminal output. Persistent sanitized reports/evidence require an
explicit copy to a reviewed tracked location before returning.

## Ownership and cleanup

The receipt and in-run marker must match exactly: random capability, canonical
repository path + device/inode, run directory device/inode, uid, host and owner
PID/start time. Paths and ownership files cannot be symlinks. A cleanup lock
prevents competing cleaners. The CLI spawns one dedicated process group, records
the root child identity, forwards SIGINT/SIGTERM/SIGHUP and waits for graceful
exit. Any remaining task descendants in that group receive targeted SIGTERM.
No shared MCP/user browser process group is signaled. There is no SIGKILL fallback.

Before deletion the manager rechecks the ownership, child identity/process group
and open handles, snapshots the exact tree, rejects special files/mount crossings,
and removes only verified entries. Symlinks are unlinked themselves; new entries
make rmdir fail. It verifies the run directory is absent before removing the
receipt and emitting `removed: true`. Exit status is preserved (including failed
commands and signal cancellation). Cleanup refusal yields nonzero and retains
what remains for review. Scripts must not put their own cwd inside a run while
asking that same live process to clean it.

`audit` is read-only and reports active, orphan, unknown and dangling registry
entries. `reap` accepts one exact ID and additionally requires the owner to be
dead. Active/PID-reused/foreign/unknown records and active handles are refused.
After SIGKILL/power loss no in-process finally can run: the next task must audit
and explicitly reclaim a proven orphan. An interrupted cleanup with changed or
missing ownership/lock records stays unknown for manual review, not auto-swept.

This is a cooperative developer lifecycle boundary, not a hostile same-user
filesystem sandbox. Do not concurrently replace paths or escape the process
group. Process birth evidence uses public `ps` start-time output (second
resolution); no cross-host recovery is allowed. Missing/incomplete handle or
process proof is a retention condition. `ps`/`lsof` are metadata checks, not a
scan of logs, browser data or other user sessions.

## Exceptions and end checks

Every run records two explicit default exceptions in `exceptions.json`:

1. OS-managed sockets/shared memory/crash reports and services may ignore TMPDIR.
   There is no claim that all such resources can be enumerated or do not exist.
2. Existing MCP services/browser binaries, pnpm/shared installs and Harness
   dependency links stay shared. They are neither relocated nor cleaned.

Register additional **known exact paths** with
`recordException(run, { category, path, reason })`. Do not include credentials or
session text. End checks report whether the external path is still present, and
never delete it. Category-only defaults report `not-enumerable`. The completion
summary goes to the terminal before the record itself is cleaned; task reports
must preserve any unresolved exception and cleanup failure.

Global MCP cannot be redirected by a child command's environment. Task-owned
launches must explicitly pass the profile/output paths; per-call screenshots
must use absolute run paths. Unsupported outputs must be recorded, not assumed
redirected. Do not change the global MCP config for a repository task. Browser
binary caches remain preinstalled/shared: no browser downloads are performed.

Loopback/OS sockets and listening TCP ports have process lifetimes rather than
directory lifetimes; task scripts must dispose servers, and the wrapper checks
its process group/handles before cleanup. Escaped daemons are not supported.
Known exceptions are checked by exact-path metadata only; no broad `/tmp` scan,
normal-profile scan or external deletion is performed.

Common inherited credential variables are stripped and HOME/DSH_HOME are fresh,
but this is **not** Provider dispatch enforcement or network isolation. Offline
tests use controlled doubles/loopback. Any later live task needs its own explicit
authorization and budget/sandbox gates; this manager grants none.
