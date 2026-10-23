# Local execution resources

- Use `pnpm dev:run -- <command> [args...]` for commands that create execution
  resources. `pnpm typecheck`, `test`, `test:runtime`, `generate:typert`, `build`
  and `build:client` already use it, including when invoked from the package.
  Read-only inspection and Git commands do not need the wrapper.
- Keep temporary HOME/DSH_HOME, Workspace/Storage, browser profiles, logs,
  screenshots and scratch builds under the provided `DSH_IDEA_RUN_DIR` paths.
  `TMPDIR` is already isolated. Never invent an external temp path or use the
  normal DSH/browser profile for tests. Do not change Harness Core.
- For a task-owned browser, explicitly pass `DSH_IDEA_BROWSER_PROFILE` as its
  user-data-dir and the provided screenshot/video/log paths. A preexisting MCP
  server does not inherit a new shell environment: use explicit per-call paths
  where supported, otherwise record an exception and obtain a dedicated
  task-owned instance through the supported interface. Do not alter shared MCP
  configuration or shut down shared services.
- Do not daemonize/escape the wrapper's process group. Close/dispose resources
  before the command returns. Success/failure/cancel must end with the wrapper's
  `removed: true` record; require `pnpm dev:audit:strict` to pass at task end.
  Wrapped execution and root/package `verify` enforce strict pre/post gates;
  orphan/unknown/dangling records block, legitimate concurrent active runs pass.
  `pnpm dev:audit` is the non-destructive diagnostic inventory. Retention
  errors are failures to resolve/report, never grounds for broad deletion.
- After SIGKILL, power loss or a cleanup refusal, audit first. Only
  `pnpm dev:reap <exact-run-id>` may reclaim a proven dead owned run. Never sweep
  `.dev`, other runs, system temp roots, or shared caches. Unknown ownership,
  active processes/handles, changed paths or unavailable proof must be retained.
- Record unavoidable third-party/system exceptions with `recordException` from
  `scripts/dev-runtime.mjs`, and include its end check in the task report. OS
  sockets/crash reports are not assumed absent. Explicitly promote only approved,
  sanitized long-term evidence before cleanup; no temporary content is committed.
- This is lifecycle/path management, not a network/OS sandbox. No real Provider
  calls without explicit task authorization. Existing dependencies, dependency
  links, `lib` outputs and shared installations remain in their official paths.

See `docs/DEV_RUNTIME.md` for interfaces, limits and recovery.
