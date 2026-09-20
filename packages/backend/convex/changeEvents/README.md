# Change events

Durable entity-change history built by interpreting retained change event inputs.

See the [design philosophy and stories](../../../../docs/orca/change-event-streams.md).

## Index

- `schema.ts` shares queryable entity fields and defines input and event payloads.
- `ingestion.ts` runs temporary standalone ingestion; `ingestion/` extracts and stores inputs.
- `processing.ts` traverses pending changes and applies stateful rules within bounded transactions.
- `events.ts` supplies recent events and individual event lookup to consumers such as `textFeed`.
- `reset.ts` clears CES events, inputs, and receipts while preserving scans and view-ingestion records.

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
- After reset, choose an explicit replay baseline; the default starts with the latest scan pair.
- Processing publishes committed inputs immediately, optionally scoped by `scan_at`.
- A separately invoked processor can publish partial comparisons; retries preserve completed inputs.
- The feed orders events by `scan_at`, placing backfilled observations in their historical position.
- Entity kind, identity, category, and observation times are native fields on both tables.
- Events support indexed entity history and retain references to their contributing inputs.
- JSON payloads preserve arbitrary upstream keys in assigned values and historical context.
- Ingestion excludes exact metadata keys in `EXCLUDED_METADATA_KEYS` (currently `status`) from updates.
- Status-only changes create no inputs; mixed updates retain eligible fields and complete context.
- Processing publishes only selected endpoint metadata keys from the frontend, excluding `is_deranked`.
- Model and provider metadata updates produce no events; other assigned fields remain publishable.
- Metadata selection preserves original keys and values, including property additions and removals.
- Inputs with no remaining changes complete without events; full historical context remains retained.
- Processing excludes `pricing.display_pricing`, including updates where it is the only changed field.
- Ingestion batches by measured document bytes, targeting 4 MiB within Convex's 16 MiB budget.
- Convex's 1 MiB document limit remains the hard stop for oversized inputs or events.
- Ingestion and processing log total and largest document sizes for each comparison or page.
- The separate `textFeed` module serves `/ces/feed` and `/ces/events/<id>`.

## Demo with sampled production scans

Use an isolated dev deployment with `ORCA_PULL_SOURCE_URL` pointing at the source deployment.
Copy a sparse series of scans to cover a broad timespan; CES compares adjacent available artifacts.
These comparisons describe net changes across the sampled intervals, not every intervening change.

1. Discover source filenames with a read-only query, choosing dates spread across the desired period:

   ```sh
   bun run --cwd packages/backend convex run --deployment dependable-husky-550 \
     --inline-query 'return await ctx.db.query("objects_locators").withIndex("by_path_name", q => q.eq("path", "scans").gte("name", "scan.2026-09-10")).first();'
   ```

2. Copy the selected artifacts into the dev deployment (example: a nine-day, three-scan sample):

   ```sh
   bun run --cwd packages/backend convex run v3/pullArtifacts:run \
     '{"filenames":["scan.2026-09-10T00:40:05.258Z.jsonl","scan.2026-09-17T00:40:05.558Z.jsonl","scan.2026-09-19T00:40:04.327Z.jsonl"]}'
   ```

3. Ingest from the first artifact as the baseline, producing changes rather than initial appearances:

   ```sh
   bun run --cwd packages/backend convex run changeEvents/ingestion:run \
     '{"afterArtifactId":"scan.2026-09-10T00:40:05.258Z.jsonl","process":true}'
   ```

   The runner schedules subsequent pairs; add `once: true` to process one pair at a time.
   Receipts in `changeEventIngestions` track completed pairs; pending inputs have `processed: false`.

4. Open the dev deployment's `/ces/feed`; follow `/ces/events/<id>` for complete changes and context.
   The feed displays only its latest bounded window; earlier events remain in `changeEvents`.

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
