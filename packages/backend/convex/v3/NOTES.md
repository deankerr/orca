# V3

- Builds on the `scan` and `objects` modules.
- Ingestion is manually single-flight, so it does not currently use locks.
- Will run in parallel with existing backend systems in production.
- Will be gradually adopted in public-facing systems.
- Should implement schema-breaking revisions now, if advantageous.

# Change Event Streams (CES)

- Encompasses Monitor/Alerts products.
- Are completely distinct from Projections. Projections updates have no relation to change events.
- Will be processed as part of an `ingest` action.
- Will likely involve `json-diff-ts`, but will not use the atomic `or_views_changes` strategy.
- Currently out of scope.

# Scans

- Are a snapshot of model/endpoint API data.
- Requires carefully chosen properties to be validated.
- Removes purely duplicated data, cutting the final artifact size from ~10MB to ~5.5MB.
- Are always complete. Any request failure fails the entire scan.
- The parallel request process takes only ~1.5 to ~3 seconds, including object storage.
- Runs independently of any downstream ingestion functions.
- Legacy archives will be converted to this more efficient format.

# Projections

- Projection tables include the entity and series tables.
- Required, validated fields are carefully chosen and always exist.
- Would support Endpoints Data Grid and Pricing History Charts products.
- Failure to ingest a projection halts this process until developer intervention.

## Views

- Entity views are like a "cache" of the latest ingested scan.
- They do not model "change" or "history" (aside from `unlisted_at`).
- Entity views store arbitrary properties in the `metadata` record with a restricted value schema.
  - They allow us to manage upstream schema changes without changing ours.
  - Are never required to contain a specific property, or a normalised set across entities.
  - May exclude upstream properties by key name if known to be unnecessary or superfluous.
  - Public queries will use something like zod to create a normalized shape with default fallbacks.
- Update suppression is a performance optimisation only.
- `scan_at` links to the last scan which caused the entity view to update.
  - It does not indicate staleness. It is only updated if the view was updated.

## Series

- Endpoint listing rows are inserted whenever an endpoint becomes listed or unlisted.
- Endpoint pricing rows are inserted whenever a change is detected.
- Endpoint stats rows are always inserted when present.

## Legacy backfill

- Converts the latest valid legacy archive per UTC hour before `LEGACY_BACKFILL_END_SCAN_AT`.
- Missing or invalid `LEGACY_BACKFILL_END_SCAN_AT` disables the action.
- Reaching the cutoff stops; normal ingestion is started manually.
- Known incomplete bundles are skipped; schema failures halt processing.
- Converted artifacts and projection writes share the normal ingestion ledger.
