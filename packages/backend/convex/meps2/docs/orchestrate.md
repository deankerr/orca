# Orchestrate

`orchestrate` is the only module that knows the live sequence. It composes `scan`,
`artifacts`, `ingest`, and `projections`. Domain modules do not import the workflow
component.

Durable execution uses `@convex-dev/workflow`. The journal holds identities, never bytes
or Catalog maps. Stats and errors go to Axiom. There is no meps2 jobs table.

## Callers

```ts
run(): { scan_at: string }
drain(): void
backfill(scans: { scan_at: string; artifact_id: string }[]): void
```

- `run` is a mutation that assigns `scan_at` and starts the live workflow. It returns
  before ingest completes.
- Cron calls `run`. It does not pass a baseline, a workflow id, or bytes.
- `drain` applies registered-not-ingested files on the latest edge. No new observation.
- `backfill` registers already-stored historical identities, then the caller uses `drain`
  only while the window is empty. See Backfill below.
- 🧭 Replay after a projections fix is `drain`, or restart of the in-flight workflow from
  the apply step. It does not assign a new `scan_at` and does not write a second blob.

## Live sequence

Later steps do not run if an earlier step fails.

1. Assign `scan_at`. Put it in the workflow arguments so retried steps reuse it.
2. Action: `scan({ scan_at })` then `artifacts.store`. Return `{ path, artifact_id, scan_at }`.
   Uncompressed JSONL never becomes a step result.
3. Mutation: `ingest.register` of that identity.
4. Drain latest until `ingest.nextAfter({ path, scan_at: latest })` is null, or apply
   throws.

Fetch failure: no store, no register, that `scan_at` unused. The next `run` assigns a new
`scan_at`.

Store failure: no register.

Apply failure: registration remains, window unchanged. The file is backlog. Fix
projections and `drain` (or `restart` from the apply step).

- 🧭 `run` still performs steps 1–3 while a previous apply is failing, so later hours
  checkpoint. Drain always peeks the neighbor of latest ingested, so T102 cannot apply
  against T100 while T101 is registered-not-ingested.

## Drain (latest edge)

Each iteration is one work item. The workflow must not apply a caller-supplied
`artifact_id` as `after`.

1. Query `beforeRef = ingest.latest({ path })`.
2. Query `afterRef = ingest.nextAfter({ path, scan_at: beforeRef?.scan_at ?? null })`.
   If null, stop.
3. Action: `artifacts.load` of `afterRef`. If `beforeRef` is non-null, load it too.
   `explode` both (empty Catalog maps when there is no `before`). `compare`.
   `projections/apply` write chunks. Pass `scan_at: afterRef.scan_at`.
4. Mutation: `ingest.markIngested({ path, scan_at: afterRef.scan_at })`.
5. Repeat from 1.

- 🧭 Re-peek after every `markIngested`. A file registered during the drain cannot be
  skipped.
- 🧭 Restart from the apply step re-runs 1–2 first. If `afterRef` is already ingested, the
  mark is a no-op and the loop continues at the new neighbor. Do not apply the journal's
  previous `after` blindly.
- Apply writes are idempotent on `scan_at` (views upsert, series unique keys). A crash
  between writes and `markIngested` replays the same pair, then advances the window.

## Concurrency

- At most one live **produce** in flight. A second `run` while observe (step 2) is still
  running is refused. That prevents two `scan_at` values from ingesting out of order and
  making the slower older register interior.
- Produce may start while drain is failing or in progress. Register is allowed on the open
  latest edge. That is the stored backlog.
- At most one **drain** in flight per `path`. A second drain joins or no-ops. Two apply
  actions on different neighbors must not both write views under a stale `before`.
- 🧭 `ingest.markIngested` still checks the neighbor in its own transaction. That is the
  last line of defense, not the scheduler.

## Workflow mechanics

- Handler is deterministic. `Date`, `fetch`, gzip, SHA-256, OpenRouter live only inside
  action steps.
- Action retries: observe (scan+store) may retry. `artifacts.store` treats same pair +
  same digest as success. Apply action retries are off. A code bug must not chew views
  under backoff.
- `onComplete`: log to Axiom. `cleanup` the journal on success. Failed journals stay —
  they are the restart handle.
- Step arguments and returns are `ScanRef` values only. Journal size is the reason bytes
  stay in `artifacts`.

## Backfill

Adapters produce a scan artifact. The caller `artifacts.store`s, then `ingest.register`s.

- Register throws if `scan_at` is strictly inside the ingested window.
- While the window is empty, drain-latest applies oldest registered first with empty
  `before`. Historical files must all be registered before the first live ingest if they
  should precede it.
- ❓ Apply of an older-than-earliest artifact against the current view (reverse-time
  unlist) is not started. Earliest-edge drain is not wired until that rule exists.
  `ingest.nextBefore` is specified so the bound is queryable.

## What this module does not do

- It does not own baseline. `ingest.latest` does.
- It does not parse `artifact_id`.
- It does not flatten metadata or stamp `unlisted_at`. Those are `projections`.
- It does not persist stats or error strings on meps2 tables.
