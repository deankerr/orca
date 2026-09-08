# V3

- Builds on the `scan` and `objects` modules.
- Ingestion assumes a single runner and does not currently use locks.
- Will run in parallel with existing backend systems in production.
- Will be gradually adopted in public-facing systems.
- Should implement schema-breaking revisions now, if advantageous.

# Change Event Streams (CES)

- Encompasses Monitor/Alerts products.
- Projection updates do not produce change events.
- Will be processed as part of an `ingest` action.
- Will likely involve `json-diff-ts`, but will not use the atomic `or_views_changes` strategy.
- Currently out of scope.

# Scans

- Are a snapshot of model/endpoint API data.
- Requires carefully chosen properties to be validated.
- Removes purely duplicated data, cutting the final artifact size from ~10MB to ~5.5MB.
- Any request failure fails the entire scan.
- The parallel request process takes only ~1.5 to ~3 seconds, including object storage.
- Runs independently of any downstream ingestion functions.
- Legacy archives will be converted to this more efficient format.

# Projections

- Projection tables include the entity and series tables.
- Required, validated fields are carefully chosen and always exist.
- The latest ingestion record identifies the current scan, whose scan time is the ORCA clock.
- Public endpoint listings retain endpoints unlisted within 30 days of the ORCA clock.
- Models must include text in both modality arrays to produce entity or series projections.
- Would support Endpoints Data Grid and Pricing History Charts products.
- Each projection table is applied atomically.
- Stats and the ingestion record commit together, including for scans without stats.
- Failed ingestion can leave partial projections visible.
- Retrying an interrupted ingestion repairs partial writes without duplicating series rows.
- Backfill and normal ingestion must still run one at a time, including during recovery.
- Failure to ingest a projection halts this process until developer intervention.

## Views

- Entity views are like a "cache" of the latest ingested scan.
- Endpoint views copy model identity, names, modalities, and creation date for independent reads.
- Endpoint views retain current pricing separately from metadata, including when unlisted.
- They do not model "change" or "history" (aside from `unlisted_at`).
- Entity views store arbitrary properties in the `metadata` record with a restricted value schema.
  - They allow us to manage upstream schema changes without changing ours.
  - Are never required to contain a specific property, or a normalised set across entities.
  - May exclude upstream properties by key name if known to be unnecessary or superfluous.
  - Public queries will use something like zod to create a normalized shape with default fallbacks.
- Update suppression is a performance optimisation only.
- `scan_at` links to the last scan which caused the entity view to update.
  - It does not indicate staleness.

## Series

- Endpoint listing rows are inserted whenever an endpoint becomes listed or unlisted.
- Endpoint pricing rows are inserted whenever a change is detected.
- Endpoint stats rows are always inserted when present.
- Current stats contain only readings at the ORCA clock; missing readings remain absent.

## Legacy backfill

- **Has been successfully completed on production backend.**
- Converts the latest valid legacy archive per UTC hour before `LEGACY_BACKFILL_END_SCAN_AT`.
- Missing or invalid `LEGACY_BACKFILL_END_SCAN_AT` disables the action.
- Reaching the cutoff stops; normal ingestion is started manually.
- Known incomplete bundles are skipped; schema failures halt processing.
- Legacy backfill records ingestions through the same process as normal ingestion.

## Projection pulls

- Pulls idempotently merge views, listings, and pricing in creation order through shared writes.
- Pulls run exclusively on the destination and refresh by rerunning from the beginning.
- Pulls import the captured current scan and its stats together after copying other projections.
- A source argument or default `ORCA_PULL_SOURCE_URL` enables pulling.
- Previews pull alongside the legacy crawl until the frontend migrates.
- Pulls copy the captured scan artifact and product projections, excluding historical stats.
- Imported ingestion records establish the current scan without requiring continuous local history.

## Deployment controls

- Previews bootstrap through init pull; scheduled processes are disabled unless explicitly enabled.
- Scans run hourly at :40 with ORCA_SCAN_ENABLED; ingestion runs at :42 with ORCA_INGEST_ENABLED.
- Objects default to Convex storage; ORCA_OBJECTS_BACKEND=r2 selects R2 for new writes.
- Existing objects always load through their stored locators.
- Pull the baseline before enabling scans and ingestion for an independent preview timeline.
