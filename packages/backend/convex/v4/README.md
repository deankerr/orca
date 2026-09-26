# V4

Scan-derived Catalog, independently processed endpoint History, and latest-only current stats.

## Responsibilities

| Component       | Responsibility                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scan            | Select and load validated captures as shared observations, independently of ingestion state. Scope to text input/output; discard endpoint `status`.                                    |
| Catalog         | Cumulative entity knowledge: retain departed entities' last-known facts. Keep metadata with its owning entity and labels [endpoint-local](../../../../docs/orca/provider-identity.md). |
| Ingestion       | Commit prerequisites (currently Catalog), release a pair, create processor work and schedule initial attempts atomically.                                                              |
| Pair processors | Pricing and Listings derive output from that pair alone. Different pairs may run and finish out of order; Stats history stays dormant.                                                 |
| Current stats   | Publish the latest scan's two default-tier readings and its cursor atomically. Older/duplicate publication is ignored.                                                                 |

## Commit and failure semantics

- A `v4_scan_ingestions` record means the pair is released. Catalog writes and the record commit
  together; Catalog failure releases nothing. Duplicate pair commits do not write or schedule twice.
- Each released pair creates one `v4_processor_work` row per registered processor. Its `pending` →
  `complete` transition commits with the entire payload, including empty output. Concurrent attempts
  cannot commit twice. There are no processing claims, leases or automatic processor retries.
- Pending work remains outstanding even when later pairs complete. Routine ingestion schedules only
  new work; manual recovery targets a work ID. Ingestion never waits for processor or stats results.
- Processor dispatch shares one loaded pair across processors. The handoff is scheduled inside the
  ingestion transaction, so it survives the orchestrating action stopping after commit.
- Stats is not a pair processor or an ingestion prerequisite. Failure retains the previous snapshot;
  the grid serves it even when its cursor trails ingestion. A successful snapshot removes absent,
  null or malformed readings. Later observations supersede missed work; recovery loads only the latest.
- History queries pin an upper observation cutoff, **not a completeness frontier**. Earlier pending
  work can coexist with later committed rows; inspect work records for gaps. Bootstrap history stays
  hidden until the first ingestion completes. Catalog/history/stats tearing is accepted.
- `scan_at` dates the source observation, not an upstream change. Catalog has no revision history.
  History uses endpoint UUIDs and period-correct context; `listings.byModel` discovers UUIDs, then
  `listings.list` supplies their full timelines, including model moves and mutable provider tags.
- Payloads fit one mutation per responsibility. Log counts before database work and in callers;
  failed transactions leave both output and completion unchanged.

## Fresh deployments

With no ingestion records, the routine action calls the separate bootstrap path once two artifacts
are available. It inserts the **selected baseline only**, one table mutation at a time: models,
providers, endpoints, initial prices and initial listings. Then normal ingestion processes the
first real pair. There is no baseline flag in routine diffs, synthetic ingestion or bootstrap record.

Bootstrap is deliberately non-resumable. Partial initialization, including failure before the first
real ingestion commits, needs investigation/reset; repeated inserts into nonempty tables are refused.

## Scan interface

- Import loading functions, observation types, entity validators and time assertions from `v4/scan.ts`.
  Files in `v4/scan/` are implementation details; callers do not handle raw artifacts or extraction.
- `loadNextPair(ctx, from)` returns the first capture at/after `from` and its immediate successor as
  a `ScanPair` of `{ previous: Scan, next: Scan }`;
  `null` selects the earliest baseline, and fewer than two captures returns `null` without loading.
- `from` accepts an ISO date (UTC midnight) or a timestamp with a timezone, normalized to UTC.
- `loadPair(ctx, times)` reloads two exact capture times (`ScanPairTimes`) for processor work;
  `load(ctx, time)` returns one exact `Scan` for current stats. Missing or inconsistent captures fail.
- Scan owns discovery, loading, source identity validation and interpretation; it has no ingestion-table dependency.
- Ingestion supplies `clock ?? start_at ?? null`, then records the actual capture times returned.
  Subsequent requests use the clock; commits enforce continuity with the previous ingestion.
- Internally, `scan/artifacts.ts` handles stored captures and `scan/extract.ts` purely interprets their
  entries into entity maps, keeping interpretation independent of I/O.
- Object discovery and batched loading use the canonical [Objects interface](../objects/README.md);
  source selection and compressed transport are encapsulated there. Parsing runs in the consumer.
- A dev/preview `now - N` seed belongs to ingestion setup, outside the Scan interface.

## Operating entry points

Run internal commands from `packages/backend`, selecting the deployment explicitly:

```sh
bunx convex run --deployment dev <function-path> '<args>'
```

| Function                                   | Trigger and arguments                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `v4/scan:selectPair`                       | Read-only action, `{"from":"2026-09-15T12:00:00Z"}` or `{"from":null}`. Inspect the selected pair without loading its contents.      |
| `v4/ingestion/routine:run`                 | Manual worker, `{start_at?}`. Bootstrap if needed, then release consecutive pairs until caught up.                                   |
| `v4/ingestion/routine:scheduled`           | Cron at minute 43 UTC each hour, `{}`. Schedule `run` only when `ORCA_V4_INGEST_CRON_ENABLED` is exactly `"true"`.                   |
| `v4/ingestion/processors:retryWork`        | Manual, `{"work_id":"…"}`. Schedule one attempt for pending work.                                                                    |
| `v4/stats/current:refreshLatest`           | Scheduled after release or manual, `{}`. Publish the newest released scan's stats.                                                   |
| `v4/ingestion/progress:getIngestionScanAt` | Read-only, `{}`. Latest completed ingestion time.                                                                                    |
| `v4/ingestion/progress:listProcessorWork`  | Read-only, `{"processor":"pricing","state":"pending","paginationOpts":{"numItems":100,"cursor":null}}`. Inspect work and obtain IDs. |

`scheduled` checks the cron flag even when called manually; direct calls to `run` bypass it.
Disabling the flag stops new cron starts; existing scheduled work and continuation chains proceed.
`start_at` requires a fresh timeline and selects the first capture at or after that time as the
baseline; change processing starts with the following capture. Omit it to resume from the clock.

```sh
bunx convex run --deployment dev v4/ingestion/routine:run \
  '{"start_at":"2026-09-20"}'
```

`commitIngestion`, processor `commitStep`, stats `publish` and bootstrap inserts are transaction
steps, not standalone operator commands.

## Data conventions

- Required facts are validated by their consumer; optional invalid facts may become unknown.
- Observations select Catalog/history writes; database reads identify Catalog insert/replace targets
  and enforce completion. Current stats deliberately reconciles every stored row.
- Typed fields capture dependencies; JSON text preserves extensible metadata. Catalog sorts metadata
  string arrays to suppress order-only writes; pricing override order is retained.
- Pricing carries within continuous availability; reappearance supplies a fresh quote. Historical
  windows need entering prices/listings. Presentation owns units and sampling; the grid omits zero
  prices while History retains them. Storage equality does not determine event significance.
