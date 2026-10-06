# DSH Idea T13.2 Follow-up — Isolation / Attribution Freeze Repair

Status: **`T13_2_FOLLOW_UP_FREEZE_REPAIRED_READY_FOR_REVIEW`**
Date: 2026-10-06
Baseline: dsh-idea `3741efc17a9fea2744b1f0f8ec9536fd9a1b25e1` (HEAD == origin/main, clean); Harness `ddefc45fbc7f8e46dd73185e68295696d1297887` read-only. This is a DOCS-ONLY freeze repair: no product/test code change, no Harness change, no T13.2 runtime executed, no real `~/.dsh` modification.

## 1. Historical evidence — the blocked round

The first follow-up attempt (2026-10-06, after validation report `3741efc17a9fea2744b1f0f8ec9536fd9a1b25e1`) performed preflight successfully but STOPPED with **`T13_2_FOLLOW_UP_BLOCKED_NORMAL_HOME_NOT_QUIESCED`** because the user's normal Harness (HOME `~/.dsh`, web on `127.0.0.1:3080`, then PID 14555 and at retry PID 18918) was running. The prior round-1 validation report had also recorded that its real-`~/.dsh` byte-inventory diff consisted exclusively of the user's concurrently running instance (a risk-advisor UX-review session's `sessions/`+`storages/session_projcache/` writes and a `settings.yaml` rewrite), with **zero T13.2-related paths** in the diff. Both facts show the byte-identity requirement mis-attributed legitimate normal-instance activity to T13.2. That rule is hereby repaired, not the product.

## 2. New run-domain model (supersedes the old quiescence requirement)

**Normal Harness domain** — `/Users/tongxin/.dsh`, `127.0.0.1:3080`:
- MAY keep running for the entire T13.2 lifecycle.
- MAY normally create/modify its own sessions, workspaces, storages, settings, and serve other plugin development.
- Its writes are NEVER attributable to T13.2. Stopping it, killing its process (e.g. PID 18918), or touching its state to obtain a "clean baseline" is FORBIDDEN.

**T13.2 domain** — a repository-external disposable runtime (e.g. `/Users/tongxin/Developer/Harness/.t13-2-followup-<RUN_ID>/home`) with `DSH_HOME` explicitly injected into every launched process, listening on `127.0.0.1:18795` (never connecting to 3080). It owns independent DSH_HOME, workspace, profile, sessions, storage, runtime state, logs, and temporary files, and never uses the real `~/.dsh` as a writable runtime directory.

## 3. Replacement invariant (new F3, exact wording)

> **"T13.2-originated processes MUST NOT write to the real user DSH_HOME."**
>
> The acceptance object is **attribution**, not global quiescence. Changes to the real `~/.dsh` during a T13.2 validation do NOT constitute failure by themselves. A change constitutes an isolation failure ONLY if it is proven to be produced by a T13.2 process, subprocess, runtime, or its toolchain. The normal Harness's legitimate concurrent activity must never produce a false T13.2 failure.

The superseded invariant — "the real `~/.dsh` must remain byte-identical / unchanged during validation" — and the derived rule "STOP if the normal Harness is running and may write `~/.dsh`" (`T13_2_FOLLOW_UP_BLOCKED_NORMAL_HOME_NOT_QUIESCED`) are **DEPRECATED and replaced** by this section. The corresponding clause in `DSH_IDEA_T13_2_REAL_BROWSER_PROVIDER_PROTOCOL_FREEZE.md` is amended in place (original text preserved above the amendment).

## 4. Provider configuration template contract

- Path: `/Users/tongxin/Developer/Harness/.t13-2-provider-template/` containing `settings.yaml` + `.credentials.yaml`.
- Creation: at the START of the follow-up execution round, by verbatim copy from the real `~/.dsh` (the user's officially configured provider settings), destination `.credentials.yaml` mode `0600`. Provenance (creation timestamp, source, SHA-size-free statement) recorded in the follow-up report at creation time. Until then the template does not exist; this repair documents the contract only — no secret file is created during this docs-only phase.
- The template is repository-external, never committed to Git, never referenced by any tracked file, and never used directly as a `DSH_HOME`.
- At each T13.2 runtime boot, the allowed configuration files are copied FROM the template INTO the disposable `DSH_HOME`; from then on the runtime operates exclusively on the disposable home. The template itself stays read-only during the run (any modification attempt is an isolation failure).
- No secret value, hash, size, prefix, suffix, or Authorization material may enter reports, logs, evidence, or Git artifacts.
- Should an equivalent, safer repo-external mechanism already exist, it may be substituted with its exact path and provenance recorded.

## 5. Attribution proof design (minimal sufficient)

The follow-up round must produce the following evidence; together they satisfy A–F without ever stopping the normal Harness:

- **A — isolated env injection**: the rig launch script and each boot log record the exact command line with explicit `DSH_HOME=<runtime>/home` (and the guard `--import` preload) for every T13.2 process. No T13.2 process is ever launched without it.
- **B — port separation**: `lsof` evidence that the T13.2 Host listens on 18795 only; 3080 remains owned by the normal instance's PID; the browser session tokens/cookies of the two instances are never exchanged.
- **C — disposable state containment**: directory inventory of the runtime showing `profiles/`, `sessions/`, `storages/`, `workspace/` all inside the disposable home; the workspace created via the official Host Remote has its path inside the runtime; the profile's installed plugin lives in the runtime's profile `node_modules`.
- **D — no write target into the real home**: (1) environment facts from A; (2) periodic `lsof` scans over the T13.2 process tree during the run (at boot, after each scenario block, before shutdown) checking for any open file under `/Users/tongxin/.dsh` — the expectation and required result is ZERO such handles; (3) source-level fact already verified: the Harness resolves all writable roots (`sessions`, `storages`, profiles, settings, credentials) under `DSH_HOME`.
- **E — scoped before/after manifests with path-level attribution**: full secret-safe manifests (path + size inventory; the credential file compared by boolean equality only) captured before boot and after cleanup. Any diff path inside the real home is attributed by rule: it is T13.2-attributable ONLY if the path lies inside the T13.2 domain (impossible for `~/.dsh` by construction) or a D-scan showed a T13.2 handle on it (expected zero). All other diff paths are normal-instance activity and explicitly NOT a failure. The report states the verdict as `REAL_DSH_HOME_WRITTEN_BY_T13_2 = FALSE` (success) — the previous literal byte-identity verdict is retired.
- **F — safe deletion**: cleanup deletes only the runtime directory tree; the report records that no path inside the real home referenced the runtime (evidenced by D's zero-handle scans), so deletion cannot affect the normal instance.

## 6. Cleanup semantics (unchanged in mechanics, re-scoped in attribution)

Stop disposable Host, close validation browser pages, release 18795, delete the disposable `home/` (including copied credentials), `workspace/`, and `rig/` (guard, ledger, manifests, tarball, cookies). Evidence screenshots may remain repository-external. The raw ledger is deleted; only safe summaries enter the report. The normal instance and the real `~/.dsh` are left exactly as the user's own activity made them — untouched by T13.2.

## 7. Explicitly unchanged

Product code, tests, Harness source, the provider cap discipline (fresh per-round hard cap, pre-dispatch atomic guard), the Judge-attribution fingerprint, the real-browser requirement, the product-defect stop rule, the Judge-nondeterminism rule, and the docs-only delivery discipline are all unchanged. This repair ONLY replaces the isolation/attribution contract (§2–§5) and the provider-template mechanism (§4) for the T13.2 follow-up round.
