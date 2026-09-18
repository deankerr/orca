# Change events

Durable entity-change history built by interpreting retained change event inputs.

See the [design philosophy and stories](../../../../docs/orca/change-event-streams.md).

## Index

- `schema.ts` shares queryable entity fields and defines input and event payloads.
- `ingestion.ts` runs temporary standalone ingestion; `ingestion/` extracts and stores inputs.
- `processing.ts` traverses pending changes and applies stateful rules within bounded transactions.
- `events.ts` supplies recent events and individual event lookup to consumers such as `textFeed`.
- `reset.ts` clears the experiment while preserving scans and scan-ingestion records.

## Operating notes

- Temporary `changeEventIngestions` receipts record accepted comparisons in any completion order.
- Invoke `changeEvents/ingestion:run` with `afterArtifactId` to start after any stored baseline.
- Without a baseline, ingestion resumes after the newest receipt or starts with the latest scan pair.
- `once: true` stops after one comparison; `process: true` awaits scoped processing before completion.
- Manual runs default to ingestion only; use `afterArtifactId: "initial"` for full archive replay.
- Continuations carry their own baseline, allowing historical replay alongside a newer receipt.
- Receipts are continuation hints rather than proof of complete historical coverage; rerun gaps manually.
- The hourly :44 cron ingests and processes only when `ORCA_CES_INGEST_ENABLED` is `true`.
- CES and view ingestion progress independently over the same stored scan artifacts.
- Initial comparisons retain appearances with a null previous observation time.
- Retries compare parsed content structurally and preserve existing processing state.
- Run one ingestion chain and one processor, and finish both before resetting the experiment.
- Processing publishes committed inputs immediately, optionally scoped by `scan_at`.
- A separately invoked processor can publish partial comparisons; retries preserve completed inputs.
- The feed orders events by `scan_at`, placing backfilled observations in their historical position.
- Entity kind, identity, category, and observation times are native fields on both tables.
- Events support indexed entity history and retain references to their contributing inputs.
- JSON payloads preserve arbitrary upstream keys in assigned values and historical context.
- Ingestion batches by measured document bytes, targeting 4 MiB within Convex's 16 MiB budget.
- Convex's 1 MiB document limit remains the hard stop for oversized inputs or events.
- Ingestion and processing log total and largest document sizes for each comparison or page.
- The separate `textFeed` module serves `/ces/feed` and `/ces/events/<id>`.

## Context sizing

The local September 15, 2026 scans at 03:40 and 09:40 provide an initial sizing sample.
The initial comparison produces 2,238 inputs; the six-hour comparison produces 158 inputs.
Sizes use Convex's document estimator, including system fields and a 32-character input reference.

| Comparison | Events | Median event | P95 event | Largest event | Total event bytes |
| ---------- | -----: | -----------: | --------: | ------------: | ----------------: |
| Initial    |  2,238 |      9,528 B |  14,499 B |      18,937 B |      18,567,405 B |
| Six hours  |    158 |     18,392 B |  25,202 B |      32,410 B |       2,937,310 B |

Context represents 62% and 74% of their aggregate JSON payload bytes respectively.

Context retains complete before/after entity records and related model/provider records.
Lifecycle assignments repeat the entity record; updates repeat assigned fields within context.
These measurements motivate reviewing retained context before choosing any smaller content cap.
