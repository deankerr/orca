# V4

Scan-derived, cumulative Catalog knowledge and endpoint History, composed by Ingestion.

> **Temporary override — production backfill:** This guide describes routine operation.
> [Backfill guarantees and completeness rules](backfill.md) override the usual Catalog and
> progress guarantees until finalization. Remove this notice when the backfill is retired.

## Module boundaries

Modules own their interpretation and output; Ingestion owns ordering and progress. Independent
cursors let modules be developed, started and caught up separately without blocking one another.

| Module             | Responsibility                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scan.ts`, `scan/` | Resolve upstream structure and identities into shared observations. Reuse capture and artifact storage from `../scan/` and `../objects/`. Current scope requires text input and output; endpoint `status` is dropped.                      |
| `catalog/`         | Accumulate entity knowledge, retaining last-known facts for departed entities. Copy model facts onto endpoints for the grid; keep metadata with its owning entity and labels [endpoint-local](../../../../docs/orca/provider-identity.md). |
| `history/`         | Preserve Pricing and Listings separately: prices carry within continuous availability; reappearance supplies a fresh quote. Stats history remains dormant and unregistered.                                                                |
| `stats/`           | Reconcile the grid's two default-tier readings against every incoming scan. Missing, null or malformed readings mean absence, never an inherited value. Whole-table reads need no indexes.                                                 |
| `ingestion/`       | Declare scan pairs, advance independent cursors and coordinate routine draining, initialization and catch-up. `registry.ts` selects processors and replay/latest policy.                                                                   |

## Progress and visibility

- The latest declared pair defines the Catalog clock. Routine Catalog writes and pair declaration
  commit atomically; Catalog failure prevents downstream processing of that pair.
- Each routine action loads one pair once, then runs modules whose cursors match its starting scan.
  Failed, behind or unstarted modules do not block Catalog or other modules. Draining self-schedules
  while newer artifacts exist.
- Each module commits output and its cursor atomically. Expected-cursor checks reject concurrent
  duplicate commits. Failures are logged, without persisted running/failed markers or automatic recovery.
- Pricing and Listings catch-up replay declared pairs; current stats jumps to the Catalog clock.
  Catch-up runs one step per action and rejoins routine processing at the clock.
- Recovery: fix the cause, then rerun `drainArtifacts` for Catalog or `catchUpModule` for a behind
  module; invalidated committed output requires repair or replay.
- `scan_at` is source observation time, not upstream change time. Catalog is cumulative but has no
  revision history; departed entities retain their last-seen facts and timestamps.
- History reads stop at their module cursor; multi-request loads pin one cutoff. Catalog and
  modules may be observed at different progress points. Capture and event publication are independent.
- Historical offerings use endpoint UUIDs and period-correct provider identity. Tags are mutable
  and non-unique; Listings, not today's Catalog, determines historical model membership. Windows
  need entering prices/listings, and pagination boundaries are not changes or gaps.

## Operating entry points

These are internal functions, runnable from the dashboard or CLI. From `packages/backend`, select
the intended deployment explicitly:

```sh
bunx convex run --deployment dev <function-path> '<args>'
```

| Function                                    | Trigger                                               | Args and effect                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `v4/ingestion/initialize:initializeCatalog` | Manual, once per deployment                           | `{}` — requires no declared pair and at least two artifacts; writes initial Catalog tables, then declares the pair. |
| `v4/ingestion/modules:startModule`          | Manual, once per module                               | `{"module":"pricing"}` — creates a baseline cursor and schedules catch-up; rejects an existing cursor.              |
| `v4/ingestion/modules:catchUpModule`        | Manual or scheduled by module startup/catch-up        | `{"module":"pricing"}` — advances an existing module cursor until it reaches Catalog.                               |
| `v4/ingestion/routine:drainArtifacts`       | Manual or scheduled by the cron hook/drain            | `{}` — advances initialized Catalog and current modules until no newer artifacts remain.                            |
| `v4/ingestion/routine:scheduleIfEnabled`    | Cron, hourly at minute 43 UTC; also manually callable | `{}` — schedules a drain only when `ORCA_V4_INGEST_ENABLED` is exactly `"true"`.                                    |

- **Switch:** unset or any other value disables cron admission. Manual `drainArtifacts` bypasses
  the switch; disabling it does not stop an already scheduled chain.
- Initialization is deliberately non-routine and non-resumable: table writes commit separately,
  without checkpoints. On failure rerun from the beginning; identity replacement permits repeats.
  After success, start `pricing`, `listings` and `current_stats` independently.
- Inspect with `v4/ingestion/progress:getCatalogScanAt` and
  `v4/ingestion/progress:listModuleCursors`, both with `{}`. A missing module has not started;
  a null cursor awaits its baseline.
- `commitCatalogPair`, `writeInitial…`, `declareInitialPair` and module `commitStep` functions are
  workflow transaction steps, not standalone commands. `getNextModuleStep` only selects work.
- Mutations log intended operation counts before database work; callers also log counts and
  serialized argument length because timeout logs can disappear.

## Conventions

- Public function paths are consumer-facing names. Name manual commands by effect and target;
  keep transaction steps beside their owning workflow. Tables use the temporary `v4_` prefix.
- Scan resolves identities once; consumers use its types and validate their required facts.
  Optional invalid facts may become unknown; repeated observations select a winner.
- Observations and rules select writes, not existing database contents, except current stats'
  whole-table reconciliation. Catalog reads identify insert/replace targets; History relies on
  atomic cursor advancement rather than duplicate checks.
- Typed fields capture deliberate dependencies; JSON text preserves extensible metadata.
  Catalog sorts metadata string arrays to avoid order-only writes; pricing override order is retained.
- Catalog and History share pricing selection and storage representation. Presentation owns units,
  sampling and chart segmentation; the grid omits zero prices while History retains them.
- Storage equality does not determine event significance. Artifacts retain evidence for later
  interpretation; Events context retention and notification eligibility remain undesigned.
