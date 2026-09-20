# DSH Idea × Harness 0.1.6-alpha.2 Compatibility — Acceptance Report

Outcome: **DSH_IDEA_HARNESS_0_1_6_ALPHA_2_COMPATIBILITY_ACCEPTED**

Executed strictly against the frozen instruction
`docs/implements/DSH_IDEA_HARNESS_0_1_6_ALPHA_2_COMPATIBILITY_REPAIR_INSTRUCTIONS.md`
(§0–§19). No Harness modification, no scope widening, no T11 work.

## 1. dsh-idea starting SHA

```text
559e11df663628674c0435f7bda525f7c2b5b9c1  (= origin/main at start, = T10 acceptance HEAD)
```

## 2. Harness SHA / version

```text
ddefc45fbc7f8e46dd73185e68295696d1297887  (= dsh-v0.1.6-alpha.2 tag)
```

Verified identical before and after the repair. Repository at
`D:\Harness\deepseek-harness` stayed read-only throughout.

## 3. Executable repair SHA

```text
e431f5fc5fc58b92183770155b3d59cffe9e051e  fix: repair dsh-idea for harness 0.1.6-alpha.2
```

Contains only compatibility implementation and tests, plus the task-owned
frozen instruction document (committed alongside, per the T9/T10 precedent —
disclosed here as required).

## 4. Tested executable SHA

```text
e431f5fc5fc58b92183770155b3d59cffe9e051e
```

Canonical Full (§15, run LAST) executed against exactly this tree; working
tree was clean at run time and remained clean after (`git status` empty).

## 5. Docs-only acceptance SHA

This commit (contains only this report under `docs/`). No executable changes
after the tested SHA.

## 6. Exact changed files

```text
packages/dsh-idea/package.json                   (peer ranges + ui-workspace peer + dsh.client.client.inject)
packages/dsh-idea/scripts/setup-dev.mjs          (ui-workspace junction entry)
packages/dsh-idea/src/client/index.ts            (navigation seam repair + inject list + type-only import)
packages/dsh-idea/tests/client-continue.spec.tsx (header comment: fallback semantics)
packages/dsh-idea/tests/client.spec.tsx          (session fake de-`open`ed/de-`current`ed; new mount/navigation test)
packages/dsh-idea/tests/package.spec.ts          (inject-list assertion + uiWorkspace)
docs/implements/DSH_IDEA_HARNESS_0_1_6_ALPHA_2_COMPATIBILITY_REPAIR_INSTRUCTIONS.md  (added, task-owned)
```

Nothing else changed. `lib/` is gitignored (rebuilt bundles create no commit
drift).

## 7. peerDependency before/after policy

Instruction §3 mandated a uniform move — all ten `dsh-*` peer ranges to
`^0.1.6-alpha.2`, no OR-unions:

| package | before | after |
|---|---|---|
| @deepseek-ai/dsh-agent | `^0.1.5-rc.2` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-agent-default-model | `^0.1.0-rc.6` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-invariants | `^0.0.1-rc.1` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-llm | `^0.0.1-rc.1` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-session | `^0.0.1-rc.1` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-session-query | `^0.0.1-rc.1` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-storage | `^0.0.1-rc.1` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-storage-domain | `^0.0.1-rc.1` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-storage-json | `^0.0.1-rc.1` | `^0.1.6-alpha.2` |
| @deepseek-ai/dsh-typert-protocol | `^0.1.0-rc.6` | `^0.1.6-alpha.2` |

Unchanged: `@deepseek-ai/cordis >=4.0.0 <5`, `@deepseek-ai/cosmokit >=1.0.0 <2`,
`@deepseek-ai/schemastery >=3.18.0 <4`, `zod >=4.4.0 <5`.

§13 proof (semver 7.8.5, standard prerelease rules): `satisfies('0.1.6-alpha.2',
'^0.1.6-alpha.2')` → `true` for all ten ranges plus the new one; regression
check `satisfies('0.1.6-alpha.2', '^0.1.5-rc.2')` → `false`, confirming the
old ranges did reject the target (npm prerelease comparator rule).

## 8. New `uiWorkspace` dependency declaration

- `peerDependencies["@deepseek-ai/dsh-client-ui-workspace"] = "^0.1.6-alpha.2"`
  (alphabetical position: after dsh-agent-default-model, before dsh-invariants).
- `dsh.client.client.inject` array gained `"@deepseek-ai/dsh-client-ui-workspace"`
  (after ui-renderer).
- Client `inject` const: `['remote', 'locale', 'slots', 'sessions', 'commandUi',
  'inputTriggers', 'conversation', 'uiWorkspace']`.
- Type-only seat pull added: `import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'`.

## 9. setup-dev junction change

`scripts/setup-dev.mjs` LINKS gained
`['@deepseek-ai/dsh-client-ui-workspace', 'packages/client/ui-workspace']`
(after the ui-input-trigger entry). `setup-dev.mjs` was re-run against the
0.1.6-alpha.2 checkout: exit 0, all links (including the new one) established.

## 10. Continue Discussion navigation change

`src/client/index.ts` (library read surface opener):

```text
before:  await sessions.refresh(); sessions.open(SessionId(conversationId))
after:   await sessions.refresh(); ctx.uiWorkspace.openSession(SessionId(conversationId))
```

`ISessions.open()` was removed by 0.1.6-alpha.2; navigation belongs to the
view-owned `UiWorkspace` service. The refresh-before-open ordering is
preserved (still absorbs the `session/created` stream vs RPC race) and is now
asserted by the new mount test via `invocationCallOrder`.

## 11. Current-workspace → recent-workspace fallback (explicit disclosure)

`prepareWorkspace` previously anchored on `sessions.list.getSnapshot().current`
(current session's Workspace → most recent → none). `SessionListState.current`
no longer exists and the client's current selection is private to
`UiWorkspaceService` (no public read), so per instruction §7 the accepted
degradation is:

```text
before: current session's Workspace → most recently updated → none
after:  most recently updated Workspace → none
```

Implemented as `selectContinuationWorkspace(snapshot.items, undefined)`; the
pure function's existing tests already pin the `undefined` branch
(`client-continue.spec.tsx`, 'continuation workspace selection'). No reading
of `dsh.sessions.current`, no private `UiWorkspaceService` member access, no
`retainedBy` inference, no shadow current-session state — all forbidden
shortcuts avoided. Effect: Continue Discussion proposes the most recently
updated Workspace instead of the Workspace of the user's current session,
when they differ.

## 12. Typert generation result

`pnpm generate:typert` run after implementation and again at the drift gate:
exit 0, **zero diff** both times — `typert.host` and `typert.remote-client`
artifacts already conform to the 0.1.6-alpha.2 lazy-factory codec protocol
(`{mode:'strict', create}` / `TypertSchemaFactory {name, create}`); the
regeneration produced byte-identical output. `idea/v3` untouched.

## 13. Focused compatibility tests

```text
tests/client.spec.tsx + tests/client-continue.spec.tsx
→ 2 files, 35 tests, all passed
```

Includes the new mount test 'mounts with uiWorkspace and opens the created
Continue Discussion conversation through it': fake remote carries the idea
face both as a service property and the `remote.idea` cordis key; session
fake is the 0.1.6-alpha.2 shape (no `open`, no `current` — a regression back
to them fails loudly); asserts `continueDiscussion({id:'idea_1'})`, exactly
one `refresh`, exactly one `openSession('session-new')`, and
refresh-before-open ordering. §13 workspace-fallback branch pinned by the
existing `selectContinuationWorkspace(items, undefined)` tests.

## 14. T9 regression

```text
tests/reference-service.spec.ts, reference-projection.spec.ts,
reference-uri.spec.ts, client-t9r2.spec.tsx, client-t9r3.spec.tsx
→ 5 files, 65 tests, all passed
```

## 15. T10 regression

```text
tests/resurfacing-detector.spec.ts, resurfacing-retrieval-suppression.spec.ts,
resurfacing-judge.spec.ts, client-resurfacing.spec.tsx
→ 4 files, 86 tests, all passed
```

## 16. Canonical Full totals

Mid-order full suite (§12, before rebuild): 40 files / 608 tests —
**607 passed, 1 failed**. The single failure was
`tests/package.spec.ts` asserting the `inject` list of the **stale**
pre-repair `lib/client.js` bundle (built at the 559e11d baseline); source
tests were all green. Recorded honestly per the §12 ordering.

Canonical Full **LAST** (after `build` + `build:client`):

```text
40 files / 608 tests, all passed   (baseline 40/607 + 1 new compatibility test)
```

## 17. Build / build:client

```text
pnpm build        exit 0  (tsc -p tsconfig.build.json)
pnpm build:client exit 0  (lib/client.js 334.56 kB, gzip 67.09 kB)
```

## 18. Static / drift gates

```text
git diff --check                clean (no whitespace errors)
typecheck                       exit 0
build / build:client            clean (see §17 above)
generated artifact freshness    regenerated byte-identical (§12 above)
idea/v3 schema drift            zero
Harness tracked diff            zero (§22 below)
dsh-idea drift                  exactly the task-owned files (§6 above)
```

No package-native lint/format gate exists in this package (none declared in
`package.json` scripts beyond typecheck/test/build/generate:typert).

## 19. Real provider call count

```text
REAL_MODEL_PROVIDER_CALLS=0
```

All tests are offline fakes; no network egress occurred during repair or
verification.

## 20. `idea/v3` schema / migration proof

`tests/schema.spec.ts` passed within every full run. Generated typert
artifacts (`typert.host`, `typert.remote-client`) are byte-identical to the
baseline (zero drift, §12 above); no codec, face, or schema shape changed.
The domain remains `idea/v3`; no migration is involved or needed.

## 21. Harness tracked-diff-zero proof

```text
$ git -C D:/Harness/deepseek-harness status --porcelain --untracked-files=no
(empty)
$ git -C D:/Harness/deepseek-harness rev-parse HEAD
ddefc45fbc7f8e46dd73185e68295696d1297887
HARNESS_SHA=ddefc45fbc7f8e46dd73185e68295696d1297887
HARNESS_TRACKED_DIFF=ZERO
```

No `git clean`, no `git reset --hard`, no edits, patches, or vendoring of
Harness files.

## 22. Final git status (dsh-idea)

At the tested SHA the working tree was completely clean:

```text
$ git status --short
(nothing)
```

## 23. Preserved unrelated drift

All six pre-existing untracked files in the Harness checkout were preserved
untouched: `build.log`, `install.log`, `t0-model.txt`, `t0-remote.txt`,
`t0-session.txt`, `t0-storage.txt`. In dsh-idea, no unrelated plugin or file
was touched; the sibling plugins (`dsh-better-sidebar`, `dsh-memory-evolve`,
`dsh-super-injector`) are outside this repository and unaffected.

## 24. `origin/main` verification

After pushing `main` (the executable repair commit `e431f5f` plus this
docs-only acceptance commit), the remote was verified with
`git rev-parse origin/main`:

```text
local main = origin/main = the docs-only acceptance commit (this commit, SHA
recorded in the execution report); both commits present on origin/main.
```

---

## 25. §12 verification-order conformance

Executed in the mandated strict order; no step skipped, none reordered:

Implementation → setup-dev → generate:typert → diff inspection (zero) →
typecheck → focused client/Continue tests (after one test-fake iteration) →
focused T9 → focused T10 → full suite (stale-bundle failure recorded) →
build → build:client → static/drift gates → Canonical Full LAST.

## Known trade-off retained

The §7-sanctioned workspace-selection degradation (§11 above) is accepted as
the final behavior for this release line; restoring a current-session anchor
would require a public client-side selection readout from `UiWorkspace`,
which 0.1.6-alpha.2 does not expose.
