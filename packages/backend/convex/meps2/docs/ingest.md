# Ingest

`ingest` is the ordered timeline of scan artifacts for one `path`. It records which files
are registered and which contiguous interval has been ingested. It does not fetch, store
blobs, explode JSONL, or write views.

Callers pass identities, never bytes.

## States

| State      | Meaning                                          | Durable where                         |
| ---------- | ------------------------------------------------ | ------------------------------------- |
| stored     | `(path, artifact_id)` exists                     | `artifacts`                           |
| registered | admitted to the timeline                         | `ingest` scans table                  |
| ingested   | projections have been applied for this `scan_at` | `ingest` window covers this `scan_at` |

- Stored is not registered. Registered is not ingested.
- 🧭 Baseline (`before`) is the latest ingested scan artifact. Empty maps if the window is
  empty.
- 🧭 Latest row in `artifacts` is not the baseline.
- 🧭 A registered-not-ingested file is backlog, not `before`.

## Tables

### Scans (`meps2_scans`)

Insert-only order log. One row per registered observation.

| Field         | Meaning                              |
| ------------- | ------------------------------------ |
| `path`        | Timeline. Scan artifacts use `scan`. |
| `scan_at`     | Domain identity and apply order      |
| `artifact_id` | Opaque pointer for `artifacts.load`  |

- No `ingested_at`, status, error, stats, or workflow id.
- Index `by_path_scan_at` on `['path', 'scan_at']`. Lookups use `.unique()`.
- Index `by_path_artifact_id` on `['path', 'artifact_id']`. Lookups use `.unique()`.
- Range queries for neighbors use `by_path_scan_at` with `eq('path')` and `gt` / `lt` on
  `scan_at`, `.take(1)`. Never `.filter()`. Never list `meps2_artifacts`.

### Window (`meps2_ingest_window`)

One row per `path`. Absent row means nothing ingested.

| Field              | Meaning                                        |
| ------------------ | ---------------------------------------------- |
| `path`             | Timeline                                       |
| `earliest_scan_at` | Inclusive lower bound of the ingested interval |
| `latest_scan_at`   | Inclusive upper bound of the ingested interval |

- Index `by_path` on `['path']`. Lookups use `.unique()`.
- 🧭 The ingested set is exactly the registered rows with
  `earliest_scan_at ≤ scan_at ≤ latest_scan_at`. Holes in that interval are unrepresentable.
- Artifact identity for a window bound is the scans row at that `scan_at`, not a field on
  the window.

## Interface

```ts
type ScanRef = { path: string; artifact_id: string; scan_at: string }

register(ref: ScanRef): void
latest({ path }): ScanRef | null
earliest({ path }): ScanRef | null
nextAfter({ path, scan_at }): ScanRef | null  // null scan_at → oldest registered
nextBefore({ path, scan_at }): ScanRef | null // null scan_at → newest registered
markIngested({ path, scan_at }): void
```

`path` is an argument so this module does not hard-code `scan`. Live scan artifacts still
use `path: 'scan'`.

There is no `live` / `backfill` argument. Direction is which neighbor the caller asks for.

## `register` (mutation)

Admit a stored identity onto the timeline. Does not load bytes. Does not check that the
blob exists.

1. Read `by_path_scan_at` `.unique()`.
   - Same `artifact_id`: return. Idempotent.
   - Different `artifact_id`: throw. `scan_at` is bound.
2. Read `by_path_artifact_id` `.unique()`.
   - Same `scan_at`: return. Idempotent.
   - Different `scan_at`: throw. The pair is bound.
3. Read the window for `path`.
   - If a window exists and `earliest_scan_at < scan_at < latest_scan_at` (strict): throw.
     Interior to the ingested interval.
4. Insert `{ path, artifact_id, scan_at }`.

- 🧭 Register is allowed on either open edge, including a pile of not-yet-ingested files
  newer than latest or older than earliest.
- 🧭 Register does not create or patch the window.
- ⚠️ Overlapping produces that ingest a newer `scan_at` before an older one registers will
  make the older `scan_at` interior. Register immediately after store. See
  [`orchestrate.md`](orchestrate.md).

## `latest` / `earliest` (queries)

1. Read the window for `path`. If none, return `null`.
2. Read the scans row at that bound `scan_at` with `by_path_scan_at` `.unique()`.
3. Return `{ path, artifact_id, scan_at }`.

A missing scans row for a window bound is a corruption. Throw. Do not invent an
`artifact_id`.

## `nextAfter` / `nextBefore` (queries)

Neighbors are registered rows, not blobs.

- `nextAfter({ path, scan_at: S })`: `by_path_scan_at`, `eq path`, `gt S` if `S` is
  non-null, order ascending, `.take(1)`. `S === null` starts at the oldest registered.
- `nextBefore({ path, scan_at: S })`: `eq path`, `lt S` if `S` is non-null, order
  descending, `.take(1)`. `S === null` starts at the newest registered.

Drain on the latest edge peeks `nextAfter({ path, scan_at: latest()?.scan_at ?? null })`.
The peeked row is `after`. `latest()` is `before` (empty maps when `null`).

Drain on the earliest edge peeks `nextBefore({ path, scan_at: earliest()?.scan_at ?? null })`.

- 🧭 Apply the neighbor, not an arbitrary registered id. Peeking T102 while T101 is still
  registered-not-ingested is wrong; `nextAfter(latest)` returns T101.
- 🧭 While the window is empty, both edges return the oldest registered row, with empty
  `before`.

## `markIngested` (mutation)

Advance the window by exactly one neighbor. The only writer of the window.

1. Read the scans row for `{ path, scan_at }`. If none, throw. Not registered.
2. Read the window for `path`.
3. If no window:
   - This `scan_at` must equal `nextAfter({ path, scan_at: null })` (oldest registered).
   - Insert window `{ path, earliest_scan_at: scan_at, latest_scan_at: scan_at }`.
   - Return.
4. If `scan_at === latest_scan_at` or `scan_at === earliest_scan_at`: return. Idempotent.
5. Compute `after = nextAfter({ path, scan_at: latest_scan_at })` and
   `before = nextBefore({ path, scan_at: earliest_scan_at })` in this same transaction.
   - If `scan_at` equals `after.scan_at`: patch `latest_scan_at`.
   - Else if `scan_at` equals `before.scan_at`: patch `earliest_scan_at`.
   - Else throw. Not an edge neighbor.
6. Do not write scans rows. Do not write views or series.

- 🧭 Two concurrent `markIngested` calls serialize on the window document. The loser either
  no-ops (same `scan_at` already on an edge) or throws (no longer a neighbor).
- 🧭 Extending latest does not require reading earliest's neighbor writes; the patch still
  contends on the same window row. That is accepted. Apply is single-flight at
  `orchestrate` so this is a safety net, not a hotspot under load.

## What this module does not do

- It does not parse `artifact_id`.
- It does not call `artifacts.store` or `artifacts.load`.
- It does not explode JSONL or stamp `unlisted_at`.
- It does not store error strings, counters, or workflow ids.
- It does not decide live vs backfill. The caller chooses `nextAfter` or `nextBefore`.
