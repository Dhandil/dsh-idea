# DSH Idea T13.2 Playwright MCP Environment Review

**Outcome:** `DSH_IDEA_T13_2_PLAYWRIGHT_MCP_ENVIRONMENT_REVIEW_READY`

**Baseline:** `35b91b7e1d70c5d78567beb216fd7ca099f6b933`

**Scope:** Read-only local configuration, package metadata, process ownership, profile path, and listener inspection. No Playwright tool was invoked. No browser, MCP server, Harness Host, Fixture A, Agent, Judge, provider, or Canonical Full action was started. No configuration or dependency was changed and no credential values were read or emitted.

## Repository preflight

At inspection start, dsh-idea `HEAD == origin/main == 35b91b7e1d70c5d78567beb216fd7ca099f6b933`; tracked and index drift were zero. Existing untracked `.DS_Store` files were present and left untouched. The Harness symlink and all other unrelated drift were not changed.

## Installation and Codex configuration

The global Codex configuration is `~/.codex/config.toml`. Its `playwright` server entry runs:

```text
/opt/homebrew/bin/node /Users/tongxin/Developer/Tools/playwright-mcp/node_modules/@playwright/mcp/cli.js --browser=chrome
```

The configured package is `@playwright/mcp` **0.0.83**, installed under `~/Developer/Tools/playwright-mcp/node_modules`; the project wrapper package is `playwright-mcp` 1.0.0. Its bundled `playwright` and `playwright-core` dependencies are `1.64.0-alpha-1790635538000`; Node is v24.21.0. This configuration selects the installed Chrome channel. The observed Chrome process reports version 155.0.8059.40.

The MCP entry is user-global. No dsh-idea, `Tools/playwright-mcp`, or `deepseek-harness` project MCP config file was found. A separate `@playwright/mcp` 0.0.80 package exists in `deepseek-harness` dependencies but is not the package selected by the Codex global entry. The current Codex task exposes the `mcp__playwright` navigation and interaction tool schemas; they were not called during this investigation.

The global entry has no explicit `--isolated`, `--user-data-dir`, or `--port` argument. It uses stdio MCP transport. The installed package documentation says its default persistent profile is derived from the MCP client's workspace root, and that concurrent clients using the same workspace profile can conflict. The package supports `--isolated` or a distinct user-data directory; its config schema also supports an explicit browser `userDataDir` and `launchOptions`.

## Live process and isolation observation

Two MCP server processes were present under the Codex CLI process:

- PID 64596 had working directory `~/Developer/Harness`; no browser child or relevant listening socket was observed for this instance.
- PID 64685 had working directory `~/Developer/Harness-projects/personal-agent-hub` and owned Chrome PID 91033. This is the other project's currently running MCP/browser instance. Chrome uses the persistent profile `~/Library/Caches/ms-playwright-mcp/mcp-chrome-229cbd3`; its process command includes `--remote-debugging-pipe` and `--use-mock-keychain`. The process tree shows separate Chrome helpers. Page count, active tab contents, and authentication state were not inspected.

The two server instances are separate processes and their observed workspace roots differ. The other project's active browser/Profile was not contacted, read, or modified. A separate Chrome process not proven to belong to either MCP instance was also left alone. Although package documentation describes workspace-hash profile separation, the dsh-idea repository is nested under the current `~/Developer/Harness` workspace, and no dsh-idea-specific profile identity is configured. Isolation from other clients that use that same workspace therefore is not established by the current configuration.

No listener was present on 18795, 18796, 3080, 9222, or 9223 at inspection time. The configured MCP uses stdio and the observed Chrome uses a debugging pipe rather than a TCP CDP port. The independent Host at `127.0.0.1:18795` was not running, so navigation to it was not tested.

## dsh-idea availability and recommendation

The current Codex task has the global Playwright MCP tool surface available, and a separate server process exists for the Harness workspace. In principle, a local Playwright browser can navigate to `http://127.0.0.1:18795/` after that independent Host is running. This does not authorize or establish safe use of the other project's active browser. Do not take over PID 64685, PID 91033, or its persistent profile.

The global default is not sufficient evidence for T13.2 browser isolation: it selects Chrome rather than an explicitly owned Chrome for Testing executable, and it does not declare a run-specific HOME or dsh-idea-specific profile. A dedicated dsh-idea/run MCP instance is therefore recommended before any future live UI exploration. Keep the existing global entry intact; configure a separate instance with a fresh external HOME and unique disposable profile (or the package's in-memory `--isolated` mode), an explicit Playwright-managed Chrome for Testing executable, and a verified `--use-mock-keychain` launch argument. Preserve Chromium's sandbox and keep Chrome outside the Host/CLI Seatbelt tree. Do not share a persistent profile across simultaneous clients. No configuration change is required for tool visibility, but **a dedicated isolation configuration is required to meet the T13.2 live-browser contract**.

This MCP setup can explore the Web UI after the Host is available, but Workspace initialization remains the official authenticated Host Remote/RPC call. The accepted request shape is `client-request` with `method: "workspace/create"` and `payload.args.request.path`; require a successful response and verify the returned workspace ID and temporary path. Do not click a Workspace directory-picker control, use `directoryPicker/pick`, or fall back to a native picker. RPC failure or uncertain authentication is a stop condition.

## Conclusion

**MCP availability:** present in the global Codex config and current task tool surface.

**Other-project isolation:** separate server process and workspace-derived persistent profile observed; its Chrome is live and must remain untouched. Same-workspace parallel profile isolation is not guaranteed.

**Safe T13.2 use as currently configured:** not established. The local browser endpoint is technically addressable, but the current global default does not prove the required dsh-idea HOME/Profile and Chrome for Testing isolation.

**Configuration change:** none made. A dedicated dsh-idea/run MCP configuration is required before live exploration under the frozen T13.2 contract. Workspace creation must continue through the official authenticated `workspace/create` Remote/RPC flow.
