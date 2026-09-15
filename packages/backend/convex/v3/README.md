# V3

Scan-derived current views, historical series, and shared inputs for change processing.

## Modules

| Module        | Responsibility                                                                       |
| ------------- | ------------------------------------------------------------------------------------ |
| `scan`        | Capture, artifact identity, discovery, and loading.                                  |
| `objects`     | Named-object storage and retrieval through Convex storage or R2.                     |
| `projections` | Shared validation, text scope, record construction, and structural comparison.       |
| `views`       | Table-specific adaptation, write planning, application, and exports.                 |
| `v3`          | Ingestion, ingestion records, pull, provider refresh, and the public Convex queries. |

## Shared projection

- Models must support both text input and text output to enter the shared catalog.
- Records contain normalized identities, contextual fields, endpoint pricing, and broad JSON metadata.
- The last text-eligible occurrence selects the provider record; endpoints keep their observed names.
- Metadata retains remaining source fields without significance-based key exclusions.
- Arrays, nulls, and empty objects survive projection; literal dotted-key collisions remain unresolved.
- Default endpoint stats are extracted and validated separately; `statsByTier` is excluded.
- Comparison returns complete before/after projections and a versioned `json-diff-ts` change document.
- Observation times and stats are outside the compared catalog.

## Ingestion

- Capture runs independently of ingestion and stores scan artifacts as the durable source.
- Ingestion loads the next source pair and prepares one in-memory comparison.
- The action calls the ordinary view consumer and reserves a call site for future change processing.
- Each view table is applied atomically; stats and the ingestion record commit together last.
- The latest ingestion record defines the current scan and its observation time defines the ORCA clock.
- Interrupted ingestion can expose partial writes; retrying repairs them without duplicating series rows.
- Ingestion assumes one runner; backfill, recovery, and pulls require exclusive execution.
- An ingestion failure stops forward processing until developer intervention.

## Views and series

- Views adapt shared records to existing table schemas, including restricted metadata values.
- Endpoint rows retain shared contextual fields and current pricing for independent reads.
- Unlisted endpoints retain their last known data; public listings include a 30-day retention window.
- Entity `scan_at` records the last write rather than the latest observation of an unchanged entity.
- Listing series record endpoint appearance and disappearance; pricing series record stored price changes.
- Every supplied default stats reading is inserted, including repeated values.
- Current stats contain only readings at the ORCA clock; missing readings remain absent.

## Pull and provider refresh

- Pull merges views, listings, and pricing through shared writes, then imports current stats and ingestion.
- Pull copies the captured scan artifact and current stats, with selected history rather than a replica.
- Imported ingestion records establish the current scan without requiring continuous local history.
- Pull uses the source argument or `ORCA_PULL_SOURCE_URL`; source and destination need matching exports.
- Provider refresh replaces retained provider metadata using current or row-`scan_at` source artifacts.
- Refresh resolves all required sources before one atomic metadata write and requires exclusive execution.

## Deployment controls

- Previews bootstrap through init pull; scheduled processes are opt-in.
- Capture runs hourly at :40 with `ORCA_SCAN_ENABLED`; ingestion runs at :42 with `ORCA_INGEST_ENABLED`.
- New objects use Convex storage by default or R2 with `ORCA_OBJECTS_BACKEND=r2`.
- Existing objects load through their stored locators.
- Pull the baseline before enabling capture and ingestion for an independent preview timeline.

## Design notes

- [Product objectives](../../../../docs/orca/objectives.md)
- [Change Event Streams](../../../../docs/orca/change-event-streams.md)
- [Raw change stream](../../../../docs/orca/raw-change-stream.md)
