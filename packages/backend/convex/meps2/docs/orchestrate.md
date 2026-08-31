# Orchestrate

`orchestrate` is the only module that knows the live sequence. It composes `scan`,
`artifacts`, `ingest`, and `projections`. Domain modules do not import the workflow
component.

Durable execution uses `@convex-dev/workflow`. The journal holds identities, never bytes
or Catalog maps. Stats and errors go to `console.log` / `console.error`. There is no
jobs log.

Two workflows: **observe** (scan + store + register) and **drain** (latest-edge apply).
They are separate so a later hour can checkpoint while apply is still running or
failing. Observe does not wait on drain.

Cron is the intended caller of observe `start`. It is disabled until meps2 is live.

## Callers

```ts
observe.start(): { scan_at: string }
drain.start({ path }?): void
drain.backfill(scans: { scan_at: string; artifact_id: string }[]): void
```

- Observe `start` claims the observe lock, assigns `scan_at`, and starts observe. It
  returns before ingest completes. Cron and dashboard use this. The observe action
  does not retry.
- Cron does not pass a baseline, a workflow id, or bytes.
- Drain `start` applies registered-not-ingested files on the latest edge. No new
  observation. Dashboard/CLI entry to clear a blockage after a failed apply. Observe
  kickoffs it after register. Default `path` is `scan`.
- `backfill` registers already-stored identities, then starts latest-edge drain when
  `nextAfter(latest)` is non-null (including an empty window).

## Lock

`lock` is a generic claim/release. Presence of a `meps2_locks` row is the lock. The
module does not know observe or drain.

```ts
claim({ key }): void
release({ key }): void
```

- `claim` inserts `{ key }`, then `.unique()` on `by_key`. One row: held. Two rows:
  `.unique()` throws, the mutation throws, the insert rolls back.
- `release` deletes the row. Missing key is a no-op.
- 🧭 `claim` is its own mutation. Catching `.unique()` in the mutation that inserted
  would commit the extra row. Callers that no-op on a held lock catch `claim` via
  `ctx.runMutation`.
- Observe uses key `observe`. Drain uses key `drain:${path}`. Those strings belong to
  the workflows, not to `lock`.
- Each workflow's `onComplete` releases only its own key, then `cleanup`s a successful
  journal.

## Observe

1. `claim` observe. Throws if held.
2. Assign `scan_at` in observe `start`. Put it in the workflow arguments. The action
   does not mint it.
3. Action: `scan({ scan_at })` then `artifacts.store`. Return a `ScanRef`. Uncompressed
   JSONL never becomes a step result. Action retries are off. A taken `(path,
artifact_id)` throws.
4. Mutation: `ingest.register` of that identity.
5. Mutation: drain `start` (no-op if drain is held or `nextAfter(latest)` is null).

Fetch failure: no store, no register, that `scan_at` unused. The next observe `start`
assigns a new `scan_at`.

Store failure: no register.

Observe may start while drain is failing or in progress. Register is allowed on the open
latest edge. That is the stored backlog.

## Drain

Each iteration is one work item. The workflow does not take a caller-supplied
`artifact_id` as `after`.

1. Action `applyNext({ path })`: query `beforeRef = ingest.latest`, query
   `afterRef = ingest.nextAfter({ path, scan_at: beforeRef?.scan_at ?? null })`. If null,
   return null. Load, `explode`, `compare`, write chunks. Pass `scan_at: afterRef.scan_at`.
   Action retries are off.
2. Mutation: `ingest.markIngested({ path, scan_at: afterRef.scan_at })`.
3. Repeat until the peek is null or the batch cap is reached.

- Peek lives inside `applyNext` so restart of that named step re-peeks. The journal
  records the returned `ScanRef`, never bytes.
- 🧭 Re-peek after every `markIngested`. A file registered during the drain cannot be
  skipped.
- ⚠️ Do not pass a journaled `after` into apply. `applyNext` takes only `path`.
- Apply writes are idempotent on `scan_at` (views upsert, series unique keys). A crash
  between writes and `markIngested` replays the same pair, then advances the window.

### Batch and re-arm

One drain workflow applies at most a small batch of neighbors, then completes. The batch
size is a knob, not a contract. The journal must not grow without bound over a historical
pile.

Drain `onComplete` on **success** releases the drain lock, then kickoffs another drain if
`nextAfter(latest)` is non-null. That closes the race where drain peeks empty while
observe is about to register, kickoff no-ops, and drain then exits.

A **failed** drain releases the lock and does not re-arm. The window did not move. Fix
projections and call `drain()`.

## Concurrency

- At most one **observe** in flight. Observe `start` does not catch `claim`.
- Observe may start while drain is in flight. Separate keys.
- At most one **drain** in flight per `path`. Drain `start` catches a held lock and
  returns. Re-arm on successful completion is the join.
- 🧭 `ingest.markIngested` still checks the neighbor in its own transaction.

## Workflow mechanics

- Handler is deterministic. `Date`, `fetch`, gzip, OpenRouter live only inside action
  steps.
- Observe and apply action retries are off. A taken artifact pair throws. A code bug
  must not chew views under backoff.
- Each workflow has its own `onComplete`: `console.error` on failure, `console.log`
  otherwise. `cleanup` the journal on success. Failed journals stay for inspect.
- Step arguments and returns are `ScanRef` values (or `scan_at` / `path` for the
  workflow args). Journal size is the reason bytes stay in `artifacts`.

## Failed observe vs failed drain

- Failed **observe**: the next observe `start` assigns a new `scan_at`. Do not reuse
  the failed attempt's timestamp.
- Failed **drain**: call drain `start`. `applyNext` re-peeks. The window is the
  checkpoint.

## Backfill

Adapters produce a scan artifact. The caller `artifacts.store`s, then `ingest.register`s
(or passes identities into `backfill`).

- Register throws if `scan_at` is strictly inside the ingested window.
- After register, start latest-edge drain when `nextAfter(latest)` is non-null. An
  empty window uses `nextAfter(null)` (oldest registered, empty `before`).
- Historical files must all be registered before the first live ingest if they should
  precede it.
- ❓ Apply of an older-than-earliest artifact against the current view (reverse-time
  unlist) is not started. Earliest-edge drain is not wired until that rule exists.
  `ingest.nextBefore` is specified so the bound is queryable.

## What this module does not do

- It does not own baseline. `ingest.latest` does.
- It does not parse `artifact_id`.
- It does not flatten metadata or stamp `unlisted_at`. Those are `projections`.
- It does not persist stats or error strings on meps2 tables.
