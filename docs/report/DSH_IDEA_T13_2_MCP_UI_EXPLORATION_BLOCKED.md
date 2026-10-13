# DSH Idea T13.2 Independent Playwright MCP UI Exploration

**Outcome:** `DSH_IDEA_T13_2_MCP_UI_EXPLORATION_BLOCKED_MCP_INSTANCE_NOT_LOADED`

**Baseline:** `8d478e64132072013e5842bc231b8c9e5a55a2fe`

**Scope:** Read-only MCP/config/browser inventory and static package metadata. The current session did not invoke any Playwright tool, start or stop an MCP server, browser, or Harness Host, or use a provider. No product, Harness, dependency, PAH, or configuration file was changed. No credentials were read or emitted.

## Preflight and MCP binding

At start, dsh-idea `HEAD == origin/main == 8d478e64132072013e5842bc231b8c9e5a55a2fe`; tracked and index drift were zero. Existing untracked `.DS_Store` files were left untouched.

The current Codex tool catalog contains the existing `mcp__playwright__*` surface (25 tools). It contains no `mcp__playwright_idea__*` tools. The process snapshot showed:

- PID 64596: Playwright MCP process with working directory `~/Developer/Harness`; no browser child was observed for this instance.
- PID 64685: separate Playwright MCP process with working directory `~/Developer/Harness-projects/personal-agent-hub`; it owns the other project's live Chrome process tree (root PID 91033) and persistent profile `~/Library/Caches/ms-playwright-mcp/mcp-chrome-229cbd3`.

This task's tool namespace does not identify which live process a call would reach, and the new `playwright_idea` server is not loaded. Using `mcp__playwright__*` would therefore violate the requirement to prove new-instance ownership and could touch the existing Harness or PAH session. The investigation stopped before any browser or Host interaction. Existing MCP and browser processes were not contacted, reconfigured, or closed.

## Static installation and Chrome for Testing

The global user config still points to `@playwright/mcp` **0.0.83**, with `playwright` and `playwright-core` **1.64.0-alpha-1790635538000**. The local package documents `--config`, `--executable-path`, `--user-data-dir`, and `--isolated`; its browser config supports `browser.userDataDir` and `browser.launchOptions`, including launch arguments. No Codex project `.codex/config.toml` exists in dsh-idea.

An existing Playwright-managed Chrome for Testing binary is present at:

```text
~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing
```

Its bundle metadata reports **151.0.7922.34**. Static metadata in the installed `playwright-core` package expects Chromium revision **1247**, while the installed browser directory is `chromium-1234`. No browser was launched, so compatibility is **not verified**. The active PAH Chrome process includes `--use-mock-keychain`, but that process and profile are not available for dsh-idea use; the new instance must specify and verify this launch argument independently.

## Required startup path

Official Codex configuration documentation states project `.codex/config.toml` applies only to trusted projects, takes precedence over user configuration, and can define MCP servers. The IDE MCP setup requires restarting the extension after adding a server. Therefore this running task cannot load a newly added server into its existing tool catalog.

The next run must start from a trusted dsh-idea project after loading a distinct project-scoped `[mcp_servers.playwright_idea]` entry (or an equivalent one-time Codex configuration). Keep `~/.codex/config.toml` and the existing `playwright` entry unchanged. Provide per-run external `HOME`, `DSH_HOME`, and profile paths; point the MCP browser config at the existing Chrome for Testing executable; pass `--use-mock-keychain` through the browser launch options; retain Chromium's sandbox. Restart the Codex extension or open a new Codex task after the project config is loaded. Before starting Harness, require both the `mcp__playwright_idea__*` tool namespace and process evidence showing the new server command, dsh-idea working directory, and run-owned Profile. Resolve the static Chromium revision mismatch through the required provider-zero live compatibility preflight; do not install or upgrade dependencies.

The package's documented config shape supports this setup without changing the existing global entry:

```toml
[mcp_servers.playwright_idea]
command = "/opt/homebrew/bin/node"
args = [
  "/Users/tongxin/Developer/Tools/playwright-mcp/node_modules/@playwright/mcp/cli.js",
  "--config",
  "<repository-external run config.json>"
]
cwd = "/Users/tongxin/Developer/Harness/harness-plugin/dsh-idea"

[mcp_servers.playwright_idea.env]
HOME = "<unique repository-external run HOME>"
```

The external JSON config should set `browser.browserName` to `chromium`, `browser.userDataDir` to the run-owned profile, and `browser.launchOptions.executablePath` to the installed Chrome for Testing binary, with `browser.launchOptions.args` containing `--use-mock-keychain`. Use a fresh run config and paths for each run; these placeholders are not active configuration. The Harness Host process must separately receive its disposable `DSH_HOME`.

The dsh-idea UI exploration must then use only this verified instance. After browser authentication, create the workspace with the official `workspace/create` Remote/RPC and verify its success response, ID, and temporary path. Never use Workspace UI directory selectors, `directoryPicker/pick`, or native picker fallback.

## UI exploration, providers, and cleanup

**UI interactions:** not run; no button, locator, field, save, detail, edit, version, or read-back evidence was generated.

**Workspace RPC:** not sent; no authenticated Harness session was started.

**Provider ledger:** public/semantic provider requests **0**; Agent **0**; Judge **0**; Fixture A **not used**; no AI organization action.

**Cleanup:** this attempt created no Host, workspace, page, context, browser, profile, temporary credentials, or listening port, so there were no run-owned resources to close or remove. Existing global MCP processes and the PAH browser/Profile remain untouched. No cleanup of another project's resources was attempted.

Official Codex references: [Configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic?translationFallback=zh-Hans) and [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).
