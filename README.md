# dsh-idea

Idea domain for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — an
independent, external Harness plugin (`@dsh-external/dsh-idea`, loader id `dsh-idea`).

An **Idea** is a long-term, user-owned possibility / hypothesis / direction / opportunity that
evolves over time. The V1 core loop:

```text
Conversation -> explicit Save Idea -> Idea v1 -> dormant/active
  -> explicit Related Ideas -> Continue Discussion -> explicit Save Again -> Idea v2
```

Every Idea operation is user-triggered. There is no automatic detection, background monitoring,
automatic resurfacing, or hidden prompt injection.

## T1 scope (current)

Host-only domain + persistence foundation. Implemented:

- typed Idea domain model (branded ids, aggregate invariants)
- schema-validated `idea` storage domain (`per-record` layout, one document per idea)
- `IdeaService` (`ctx.ideaService`): `create` / `get` / `list` / `archive` / `evolve`
- immutable linear version history (ordinals `1..N`, append-only)
- source-discussion snapshot persistence (bounded, user/assistant messages only)
- optimistic conflict protection for `evolve`/`archive` (`expectedCurrentVersionId`)
- focused tests, typecheck, build

Not implemented (later tasks): web UI, `💡 Idea` button, preview dialog, Typert Remote API,
LLM extraction, Related Ideas, Continue Discussion, session context capture, embeddings, PAH
integration, automatic hooks.

## Architecture

One Idea is **one canonical aggregate record**:

```text
domain: idea      table: ideas      key: ideaId      value: IdeaAggregate
```

A save (create or evolve) is one serialized single-record `put`/`update` on the domain's write
chain — durability before memory, no cross-table writes (the current Harness `storage-domain`
has no cross-table transactions). Version history is an immutable linear append; archived is
retrieval filtering, never deletion.

Domain schemas are zod and enforce the aggregate invariants at the durable read boundary;
plugin `Config` is schemastery per Harness convention (T1 declares none).

## Development

Requires a local DeepSeek Harness checkout (installed and built) — it is the authoritative
API baseline and provides the packages this plugin composes at runtime.

```bash
pnpm install
DSH_CHECKOUT=/path/to/deepseek-harness pnpm setup:dev   # junction node_modules to the checkout
pnpm verify        # typecheck + tests + build
```

On Windows (junctions are used, no admin rights needed):

```bash
set DSH_CHECKOUT=D:\Harness\deepseek-harness
pnpm setup:dev
pnpm verify
```

Re-run `pnpm setup:dev` after any `pnpm install`: installs refresh `node_modules` and the
checkout links must be reapplied so the whole graph shares one module instance per package.

## Installing into a Harness profile (future)

The package manifest is bundle-shaped (`dsh.bundle.patch` -> `./cordis.patch.yml`), so once T2+
wires the host surface:

```bash
pnpm dsh plugin --profile web add D:\Harness\harness-plugin\dsh-idea
```

then restart the profile. The bundle patch inserts the loader row naming this package; Cordis
waits for `storageDomain` and mounts `IdeaService`.

## License

MIT
