# DSH Idea T13.2 Dedicated Playwright MCP Configuration

**Outcome:** `DSH_IDEA_T13_2_DEDICATED_MCP_CONFIG_BLOCKED_NOT_LOADED`

**Baseline:** `ddd3033d87d4075c9b33d6a441cae59d968bf6c7`

**Scope:** Local project config preparation and static validation only. No MCP server, browser, Harness Host, or provider was started. No UI interaction or Workspace RPC was performed. The user-level Codex config and PAH configuration, processes, browser, and profile were left untouched.

## Local-only configuration

The project-scoped files are present locally and are intentionally not staged:

- `.codex/config.toml` registers the separate `playwright_idea` stdio MCP entry. It launches the repository-local wrapper and sets the working directory to dsh-idea.
- `.codex/playwright_idea_mcp.sh` creates a unique external temporary run directory whenever Codex starts this MCP instance. It gives the MCP process a fresh `HOME` and `TMPDIR`, assigns a fresh browser `userDataDir`, and generates the MCP JSON config inside that run directory. That config selects Chromium with the already-installed Chrome for Testing executable and supplies `--use-mock-keychain` through `browser.launchOptions.args`. On server exit, the wrapper targets only its own generated run directory for cleanup. It contains no fixed per-run path that can become stale.

The wrapper uses the installed `@playwright/mcp` 0.0.83 CLI and the existing Chrome for Testing binary at `~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`. No packages or browser binaries were installed. Chromium's normal sandbox remains enabled; neither `--no-sandbox` nor an outer Seatbelt wrapper is configured.

Static checks passed for the project TOML table and values, generated browser JSON schema and fields, shell syntax, executable permissions, and all referenced binary/script paths. The local project config and wrapper were not executed. The installed `playwright-core` metadata expects Chromium revision 1247 while the available browser directory is `chromium-1234` (bundle version 151.0.7922.34); browser compatibility remains unverified and must be checked by a future provider-zero preflight.

## Load and trust status — BLOCKED

The Codex user config contains an explicit trusted-project entry for PAH but none for dsh-idea or its Harness parent. Running `codex mcp list` with the dsh-idea repository as the working directory listed the existing global `playwright` server but did not list `playwright_idea`. The current task's tool catalog likewise contains `mcp__playwright__*` only, with no `mcp__playwright_idea__*` namespace. Thus the project-level entry is not available to this task, and this report does not claim that Codex loaded it.

Codex's official configuration guidance says project `.codex/config.toml` layers load only for trusted projects. The official MCP setup guidance says to restart the IDE extension after adding an MCP server. The next startup must mark the dsh-idea project trusted in Codex, then restart the extension or open a new Codex task rooted at dsh-idea. Before starting Harness, verify that the new `mcp__playwright_idea__*` tools appear and that the spawned process uses this wrapper, the dsh-idea working directory, the reused MCP package, and a fresh run-owned HOME/Profile. Do not call the existing `mcp__playwright` tools as a fallback.

Official references: [Codex configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic?translationFallback=zh-Hans) and [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).

## Runtime and cleanup evidence

Because the named MCP instance did not load, no Harness Host or browser was launched, no Workspace was created, and no UI controls, locators, fields, saves, versions, or read-backs were exercised. The required authenticated official `workspace/create` Remote/RPC remains the only allowed Workspace initialization method for a future run; Workspace directory selectors and native picker fallback remain prohibited.

Provider ledger: public/semantic requests **0**; Agent **0**; Judge **0**; AI organization **0**; Fixture A **not used**.

No run-owned pages, contexts, windows, processes, ports, Profile, or temporary HOME were created, so this attempt had no runtime resources to clean. The wrapper's per-run temporary directory will only be created when the new MCP server is explicitly launched after Codex project trust and tool-catalog verification. Existing PAH and Harness MCP sessions and browser state were not contacted or modified.
