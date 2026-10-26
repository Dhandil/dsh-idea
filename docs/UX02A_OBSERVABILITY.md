# UX-02A observation boundaries

This is instrumentation, not a model/latency optimization. Business payloads,
fixed context limits, model route, one-call preparation, save/concurrency and
cancel semantics remain unchanged. Metrics retain only fixed stage names and
numeric `count`, `totalMs`, `maxMs` in memory; no default request logs or IDs.

## Reading timings

- `IdeaSaveSurface.performance.snapshot()` contains `client.choice-commit`,
  `client.pending-commit`, `client.preview-commit` and
  `client.generate-to-preview-commit`. The latter begins at Generate, excluding
  time spent choosing a mode or target. `client.new-rpc` / `client.update-rpc`
  split the operation type. Existing `client.rpc`, `pending-render` and
  `preview-render` remain compatible; the render names mean **React commit**.
- Host new-Idea metrics live at `ideaPreparations.performance`; update metrics
  at `ideaPreparations.updates.performance`. Both record Session read, capture,
  route, prompt, first chunk, first nonempty text, stream completion, parse,
  preparation total and RPC handler. Update also records its two target checks.
- First chunk includes reasoning/block-start/usage/finish. First text requires
  nonempty text-delta or a completed nonempty text block, and never stores it.
  Stream completion is not necessarily successful parsing or a valid finish.
- These stages overlap. Do not sum first-response + complete + total, subtract
  aggregates of unrelated requests, or subtract independent browser/Host clocks.
  RPC includes carrier, scheduling, Host and serialization; model stages include
  middleware/adapter setup, network and generation, not pure model compute.
- React layout effects do not prove pixels were presented. Browser acceptance
  requires separate real PNGs/compositor evidence and labelled capture upper
  bounds. Double-rAF/FCP alone is not dynamic-modal paint proof.

## Current browser gate: BLOCKED

`scripts/ux02a-browser.mjs` fails closed **before Host or browser launch**.
There is no environment override. The draft driver retains task-only
`--use-mock-keychain`, `--password-store=basic`, independent user-data-dir and
native Chromium sandbox; it never adds `--no-sandbox` or edits Keychain settings.
Those flags have **not** passed runtime verification and do not establish the
missing filesystem/network boundary.

Observed: nested macOS Seatbelt prevented native CFT child sandbox startup.
Without outer Seatbelt, page routing only controls page requests; it cannot
attest browser background traffic or deny the browser main process access to
real DSH/browser directories. The Host's separate Seatbelt policy does not
extend to that browser process. A reviewed, compatible process-wide boundary
must be demonstrated before removing this gate. Do not probe real private data
or disable Chromium sandboxing to finish the matrix.

The earlier draft browser starts failed before the summary-generation matrix;
there are no accepted browser latency numbers or no-Keychain-popup results.
Offline component/Host tests and a green Full cannot substitute for that Gate.

## Offline validation

Use the normal wrapped focused tests for `ux02a-perf.spec.ts`,
`ux02a-session.spec.ts`, `client-p2-lite.spec.tsx`, `client.spec.tsx`,
`preparation-service.spec.ts`, `p2-lite-update.spec.ts`, `remote-service.spec.ts`.
The Session matrix uses public Session lifecycle and JSONL persistence for
new/update × short/long × live/cold, with one scripted stream and no prepare
writes. Cancellation/late-response tests are separate. They are not browser
or Provider performance acceptance.

Setting `DSH_IDEA_UX02A_HOST_EVIDENCE=1` inside an authenticated `.dev` run opts
into synthetic case timing files in `DSH_IDEA_LOGS`; default execution writes
none. Keep raw synthetic Sessions, traces, profiles and logs under the owned run.
Promote only sanitized evidence before owner-checked cleanup and strict audit.
