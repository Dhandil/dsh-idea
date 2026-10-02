# DSH Idea T12.4 — Real Browser / Real Provider User Journey Protocol Freeze

Status: `T12_4_PROTOCOL_FROZEN`
Date: 2026-10-02
Scope: VALIDATION ONLY for the T12.2/T12.3 Quick Capture user journey — real browser, real localhost Harness Web, real dsh-idea plugin, real configured provider. No code/test/Harness/config/build-artifact modifications of any kind.

## Tested executable

- Accepted executable: **`61e1eede676829e6fd07c5918ed84b64f7f0ad93`** (T12.3 CLOSED at `a0d1075…`; the built `lib/` state on disk is that commit's final build).
- Closure baseline: `65d5ac184623a3329cd65b723e1a846020cc8a64` (= `origin/main` at freeze).
- Harness: `ddefc45fbc7f8e46dd73185e68295696d1297887`, read-only, tracked diff zero.

## Isolation

- Disposable HOME `C:\Users\EDY\dsh-t124-home`, Workspace `D:\dsh-t124-ws`, disposable profile `dsh-idea-t12-4` — all outside both repositories, non-nested.
- Idea store starts EMPTY: no seeding, no user Idea data copied, normal profiles untouched.
- Workspace created through the official Host Remote (`workspace/create`), never by hand-editing tracked config.
- Real `~/.dsh` is never mounted; a full recursive manifest + `settings.yaml` SHA-256 are captured before boot and re-verified byte-identical after cleanup.
- `maxRetries: 0` is set rig-only (disposable home copy), never in tracked files.

## Provider budget

- `EXPECTED_PROVIDER_REQUESTS = 2` (the two AI organizes).
- `HARD_PROVIDER_REQUEST_CAP = 4`, enforced by the R4-class pre-dispatch guard (atomic reserve BEFORE network dispatch, wrap of `globalThis.fetch` in the single server process); would-be request #5 is denied pre-dispatch.
- Ledger records every real provider request (provider/model/redacted fingerprint/delivered-failed status) — never secrets, API keys, Authorization headers, or tokens.
- Success criterion: attempted = 2, delivered = 2, denied = 0, failed = 0. Direct saves, search, Add, reloads: 0 calls. A 3rd/4th actual call must be source-attributed or the round ends `T12_4_PROVIDER_CALL_BOUNDARY_UNEXPECTED`.

## Scenarios (unique marker `DSH_IDEA_T12_4_<timestamp>`; four ideas carry marker-suffixed titles)

- **A** Conversation panel UI: title 「Idea」, placeholder, footer LEFT ＋记录新想法 / RIGHT 添加到对话 verified with REAL bounding boxes (x-distance), capture subview contents, back-draft preservation (`BACK_PRESERVE_<MARKER>`), full-close idle-draft cleanup. Δ0.
- **B** Conversation direct save `<MARKER>_CONV_DIRECT`: Δ0, no AI preview, persisted with empty provenance.
- **C** Conversation AI organize `<MARKER>_CONV_AI`: ΔEXACTLY 1, editable proposal with all seven field UIs, browser-edit title `_BROWSER_EDIT`, save with no further calls, empty provenance.
- **D** Settings entry visibility (Current/Archived/search). Δ0.
- **E** Settings direct save `<MARKER>_SETTINGS_DIRECT`: Δ0, auto-exit → Current + cleared search + fresh reload; survives a browser reload.
- **F** Settings AI organize `<MARKER>_SETTINGS_AI`: ΔEXACTLY 1, seven-field proposal, browser-edit possibleValue `SETTINGS_AI_EDIT_<MARKER>`, save + fresh reload, empty provenance.
- **G** Existing idea → search → select → 添加到对话: panel closes, canonical reference chip in composer, composer content preserved, no send. Δ0.

## Pass/fail criteria

- PASS `T12_4_REAL_BROWSER_PROVIDER_USER_JOURNEY_PASS`: all scenarios pass, ledger = 2/2/0/0, persistence + empty provenance verified for all four ideas, `DSH_IDEA_RELEVANT_BROWSER_ERRORS = 0`, real `~/.dsh` byte-identical, Harness diff 0, dsh-idea executable drift 0.
- Any frozen-UI mismatch, boundary breach, direct-save provider call, missing proposal field, persistence/provenance failure, or real browser crash → immediate STOP, no fixes, report `T12_4_REAL_VALIDATION_PRODUCT_DEFECT_FOUND` with exact repro/screenshot/ledger/SHA.

## Evidence boundary

- Screenshots (7+) saved to a repository-external evidence directory; only redacted, non-secret descriptions enter the report. No tokens, cookies, auth state, or credential-bearing traces are committed.
- Browser engine/execution mode recorded (browser-use MCP In-app Browser, real Chromium). Console/page-error capture is best-effort via an in-page collector installed immediately after load (the IAB facade exposes no native console stream); it is supplemented by UI-visible error surfaces and Host logs. The limitation is disclosed in the report.

## Delivery

Docs-only commits only (this freeze, then the validation report). Precise staging; user docs drift untouched; no reset/clean/git add .; no T13. Stop after the report.
