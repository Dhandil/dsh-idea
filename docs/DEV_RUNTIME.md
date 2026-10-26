# Task execution directories

Repository entry points: [README](../README.md) · [task instructions](../AGENTS.md).
The [user guide](USER_GUIDE.md) describes the installed product; commands here
are for development and isolated validation, not for the normal Web Profile.

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
pnpm verify
pnpm dev:audit
pnpm dev:audit:strict
```

The root/package validation scripts wrap execution automatically. Nested wrapped
commands reuse the parent's run and leave cleanup to that parent. A plain
`vitest`/Typert invocation without an authenticated run fails with an entry-point
instruction. `setup:dev` and installation remain explicit dependency management
operations; they are not run by this manager or silently redirected.

Run these commands from the repository root. Root `verify` performs strict
audit → Runtime tests → package `verify` → strict audit. Package `verify`
performs strict audit → Typert generation → typecheck → plugin tests → Host
build → Client build → strict audit; invoking it directly does not include the
root Runtime tests. Builds keep their formal `lib/` output; generation updates
formal Typert outputs. Do not run them during a docs-only task that forbids such
changes. Prefer link/command/source consistency checks for that task instead.

For an authorized fresh Full, preserve its actual exit status and complete
sanitized result, including any failure. A one-run task must stop on failure;
do not retry, change timeouts or reduce parallelism to replace that result.
When launching nested package-manager calls inside an outer run, pin the
already-installed pnpm entry point (as the A/B driver does with `npm_execpath`);
an isolated HOME/Corepack cache
must not silently select or download another toolchain. Do not modify global
package-manager configuration to make a task pass.

The runtime creates `.dev/runs/<label>-<UUID>/` with mode 0700 and an independent
mode-0600 ownership receipt in `.dev/owners/`. `.dev/` is ignored; nothing there
is a durable report. Labels are case-normalized then validated before any
directory or receipt is created: 1–48 ASCII lowercase letters/digits/hyphens,
starting with a letter/digit. Invalid labels throw without filesystem changes;
the complete generated UUID-based ID is also validated before creation. Run-id
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

`audit` is non-destructive and reports active, orphan, unknown and dangling
registry entries. `audit --strict` / `pnpm dev:audit:strict` exits nonzero for
anything except valid active runs or an empty inventory. It never removes
residue. Every wrapped command now runs this gate before execution and after
successful cleanup; both root and package `verify` also require strict pre/post
checks. A legitimate concurrent active run passes and is never reaped.

Creation, cleanup and audit share a short-lived exclusive `.dev/lifecycle.lock`
metadata lease. Task execution is not serialized. This prevents auditors seeing
partially published/removed markers as unknown residue. A contending auditor
waits for the verified live lease owner (up to five seconds); busy means retry,
not a residue classification. Missing/foreign/dead/changed lease ownership is
retained and blocks the gate; no lease stealing occurs. Audit therefore writes
and removes its own temporary metadata lease, but does not mutate task contents.
An abandoned lifecycle lease requires independent manual ownership review.

`reap` accepts one exact ID and additionally requires the owner to be
dead. Active/PID-reused/foreign/unknown records and active handles are refused.
After SIGKILL/power loss no in-process finally can run: the next task must audit
and explicitly reclaim a proven orphan. An interrupted cleanup with changed or
missing ownership/lock records stays unknown for manual review, not auto-swept.

Recovery is explicit: `pnpm dev:audit` first, then only
`pnpm dev:reap <exact-orphan-run-id>` for a proven dead owned run. Never delete
the entire `.dev` tree or another task's files. At task end require the wrapper's
`removed: true` result and `pnpm dev:audit:strict`; record any legitimate concurrent
active runs separately rather than claiming an empty inventory.

`pnpm test:runtime:ab` is a reusable offline diagnostic for the original E6
parallel timeout: immutable baseline `9fcee98` and implementation `b3a7aec`,
fresh snapshots/environment per case, A/B/B/A order, same current read-only
installed dependencies and copied lib, original parallel mode and timeout.
The driver pins the already-installed pnpm JS entry point from `npm_execpath`
instead of letting an isolated HOME/Corepack cache choose a newer pnpm release.
The driver emits sanitized summary counts/hashes to the terminal; raw fixture
results remain inside its run and are removed. It is not a Provider experiment,
not part of default `verify`, and does not silently turn red runs green.
Its zero exit means the comparison completed: every arm's actual runner exit
code and failed assertions are reported separately, including failures.

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
