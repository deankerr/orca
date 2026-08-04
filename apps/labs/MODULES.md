# Labs module inventory

This is the maintained map of `@orca/labs`. It records what every file owns, what it exports, and
which code crosses its interface. “Consumer” means a direct importer or, for entry/configuration
files, the runtime or developer workflow that reads it.

## Current shape

```text
snapshot export
  -> snapshot extraction/index
  -> raw bundle archive
  -> projection materialize/filter/deduplicate -> plan/diff
  -> database schema/commit
  -> product queries

programs -> artifact workspace + reports + observability -> stages above
cli -> programs
bin -> cli
```

The stage directories are useful seams: archive code does not know product policy, projection code
is pure, and product queries do not expose SQL rows. The current layout is not considered final. The
inventory exposes these candidates for a later focused refactor:

- `src/programs/shared.ts` combines three concerns: shared CLI values, JSON output, and the SQLite
  read adapter. These are convenient today but are not one cohesive module.
- `src/artifacts/workspace.ts` is the largest helper interface. It owns allocation, discovery,
  compatibility, reference parsing, and repository snapshot discovery. Those policies are related,
  but this is the first module to reassess as incremental inputs broaden artifact selection.
- `src/database/build.ts` is correctly an orchestration module, but its private replay loop is the
  likely extraction point when historical replay and active processing must share one processor.
- Program files export both the callable workflow and its CLI command. This is intentional: CLI
  construction stays beside option use, while tests or future triggers can call the workflow.
- `eventsForLiveCrawl` is an intentionally unconsumed product interface reserved for live Alerts.
  Everything else exported from `src/` has a current package consumer or test.

## Entrypoints and package files

### `AGENTS.md`

Defines local file naming, documentation, Effect readability, and generated-artifact policy. It has
no code exports; coding agents working under `apps/labs` consume it.

### `CONTEXT.md`

Defines the canonical Labs domain language. It has no code exports; developers, product notes, and
future code documentation consume it.

### `MODULES.md`

This file. It is the navigation and ownership index for the package and has no code exports.

### `README.md`

Documents developer workflows, defaults, and CLI examples. It has no code exports; Labs users
consume it.

### `package.json`

Declares `@orca/labs`, its dependencies, and the `start` and `test` scripts. Bun and the workspace
package manager consume it.

### `tsconfig.json`

Selects Labs source and test files and inherits repository TypeScript policy. TypeScript and editor
tooling consume it.

### `src/bin.ts`

Runtime entrypoint that supplies Bun services and runs the CLI. It exports nothing; the `start`
script and root `bun run labs` command consume it.

### `src/cli.ts`

Groups snapshot, archive, and database commands and installs the global work-directory
flag.

- `cli` — root Effect CLI command. Consumed by `src/bin.ts`.

## Artifact lifecycle

### `src/artifacts/types.ts`

Owns the durable vocabulary shared by artifact programs and workspace discovery.

- `ArtifactKind`, `RunStatus` — closed lifecycle labels. Consumed throughout `artifacts/`,
  `observability/`, `programs/`, and `reports/`.
- `ArtifactDescriptor`, `ArtifactReference`, `ArtifactRun`, `ArtifactProgramResult`, `RunReport` —
  artifact and run contracts. Consumed by the same lifecycle modules and artifact tests.
- `isRunReport` — validates JSON before it is trusted as an artifact index. Consumed by
  `artifacts/report.ts`, `artifacts/workspace.ts`, and `test/artifacts.test.ts`.

### `src/artifacts/report.ts`

Reads durable reports and creates report-shaped summaries for older, unindexed artifacts.

- `readArtifactReport` — reads and validates the report adjacent to an indexed artifact. Consumed by
  `programs/report-artifacts.program.ts`.
- `inspectionReport` — represents metrics from an unindexed direct path as a successful report.
  Consumed by `programs/report-artifacts.program.ts`.

### `src/artifacts/workspace.ts`

Owns run-directory allocation and artifact input resolution.

- `resolveWorkDirectory` — applies CLI, environment, then default workspace precedence. Consumed by
  `programs/shared.ts`.
- `createArtifactRun` — allocates a timestamped run and its artifact/report/log paths. Consumed by
  `observability/run.ts` and artifact tests.
- `findResumableArtifactRun` — selects an explicit or newest incomplete artifact run without
  treating it as published. Consumed by raw archive import.
- `latestCompatibleArtifact` — selects the newest published, successful artifact with a supported
  format. Consumed by `resolveArtifactReference` and artifact tests.
- `resolveArtifactReference` — accepts implicit latest, run ids, run directories, direct paths, and
  legacy database names. Consumed by build, query, and report programs plus artifact tests.
- `latestSnapshotZip` — finds the newest repository snapshot ZIP. Consumed by
  `programs/extract-snapshot.program.ts`.

## Raw bundle archive stage

### `src/bundle-archive/schema.ts`

Owns the version-one append-only SQLite schema and immutable bundle-row guards.

- `ensureBundleArchiveIndexes` — upgrades compatible derived indexes on resumed archives. Consumed
  by snapshot import.
- `initializeBundleArchive` — initializes an empty raw archive. Consumed by snapshot import and
  database fixtures.

### `src/bundle-archive/encoding.ts`

Owns the source-envelope conversion shared by historical import and future live synchronization.

- `CompressionLevel`, `isCompressionLevel` — native zstd policy and CLI narrowing. Consumed by
  archive import.
- `encodeGzipBundle` — verifies optional source sizes and returns exact raw evidence independently
  compressed with zstd. Consumed by snapshot import and archive/database tests.

### `src/bundle-archive/storage.ts`

Owns the storage-neutral bundle values and SQLite archive operations.

- `EncodedBundle`, `RawBundle` — values on either side of archive storage.
- `appendBundle` — inserts new evidence idempotently and rejects divergent duplicates.
- `bundleArchive` — chronologically streams and verifies one raw bundle at a time.
- `bundleArchiveSummary` — returns bounded metadata without loading payload BLOBs.
- `verifyBundleArchive` — checks SQLite integrity and every stored raw digest.

### `src/bundle-archive/import-snapshot.ts`

Owns lossless, sequential conversion from extracted snapshot gzip blobs into the archive.

- `SnapshotCrawl`, `readSnapshotCrawls` — decode and order snapshot metadata. Consumed by import,
  snapshot metrics, and extraction validation.
- `validateExtractedSnapshot` — confirms every referenced blob exists. Consumed by extraction and
  snapshot tests.
- `importSnapshotBundles` — creates or resumes an archive at an exact path. Consumed by the archive
  import program and archive tests.

## Projection stage

### `src/projection/types.ts`

Defines the store-neutral values passed from materialization through diff planning and persistence.

- `MaterializedEndpoint`, `EndpointMetrics`, `ProjectionBatch`, `ProjectionState` — selected entity
  state and volatile observations. Consumed across `projection/` and database replay.
- `EntityType`, `EventType`, `FieldChange`, `EndpointEventContext`, `EntityEvent` — immutable event
  contract. Consumed by diff planning, database writes, product decoding, and product-query types.
- `CrawlPlan` — one atomic state transition, including the next state and events. Consumed by
  `database/write.ts`, replay, and tests.

### `src/projection/materialize.ts`

Separates structural bundle inspection from selected core projection so replay policies can choose
candidates before expensive schema decoding and endpoint-model deduplication.

- `MaterializationCandidate`, `InspectionResult`, `MaterializationResult` — values at the structural
  inspection and completed projection boundaries.
- `inspectBundle` — parses raw bytes and returns a usable candidate or exclusion reason. Consumed by
  database replay.
- `materializeCandidate` — validates and projects a selected candidate, deduplicating embedded model
  copies. Consumed by database replay.
- `materialize` — performs both stages when no replay selection policy is involved. Consumed by
  materialization tests.

### `src/projection/diff.ts`

Owns deterministic entity event identity and recursive field-change semantics.

- `diffEntity` — returns a baseline, availability, unavailability, or update event when an entity
  transition has product meaning. Consumed by `projection/plan.ts`.

### `src/projection/plan.ts`

Plans a whole crawl transition without performing storage effects.

- `planCrawl` — compares prior state with a materialized batch and returns the next state plus
  deterministic events. Consumed by `database/build.ts` and product-query tests.

## Database stage

### `src/database/precision.ts`

Owns the historical sampling policy without altering the full-precision raw archive.

- `HistoricalPrecision` — supported replay policies, `daily` and `full`. Consumed by database build
  and its program.
- `selectHistoricalCrawls` — generically passes every crawl-shaped value through or selects the
  final accepted candidate per UTC day. Consumed by `database/build.ts` and precision tests.

### `src/database/schema.ts`

Owns the SQLite executable specification: current state, latest metrics, immutable events, and
indexes.

- `initializeDatabase` — creates and configures a fresh product database. Consumed by
  `database/build.ts` and product-query tests.

### `src/database/write.ts`

Implements the SQLite adapter for one planned state transition.

- `commitCrawl` — atomically advances current state and metrics while appending crawl and event
  evidence. Consumed by `database/build.ts` and product-query tests.

### `src/database/build.ts`

Orchestrates a fresh historical replay and publishes the completed SQLite database atomically.

- `replayProductDatabase` — initializes a temporary database, streams/materializes archive bundles, and
  moves the completed database to its requested path. Consumed by
  `programs/build-database.program.ts` and database tests.

## Product-query stage

### `src/product-query/types.ts`

Defines product-shaped results independent of SQL storage rows.

- `ProductEvent`, `MonitorBatch`, `MonitorPage`, `MonitorPageOptions` — Monitor read contract.
  Consumed by event decoding, Monitor querying, and tests.
- `trackedPrices`, `TrackedPrice`, `Pricing`, `PricingPoint`, `PricingSeries`, `PricingHistory` —
  constrained Pricing History contract. Consumed by `product-query/pricing.ts`.
- `EndpointContext` — alias for the period-valid endpoint event context. It currently has no direct
  importer and exists as a product-facing name.

### `src/product-query/decode.ts`

Hides flat SQL rows, JSON decoding, field-presence encoding, and event grouping.

- `EventRow` — internal SQL result shape shared by product-query readers.
- `decodeEventRows` — reconstructs typed product events from repeated event/field rows. Consumed by
  `product-query/events.ts` and `product-query/pricing.ts`.
- `endpointContext` — narrows a product event and returns its endpoint context. Consumed by
  `product-query/pricing.ts`.

### `src/product-query/events.ts`

Reads complete event batches without exposing SQL layout.

- `eventsForCrawls` — loads and decodes all events for a set of crawls. Consumed by
  `product-query/monitor.ts` and `eventsForLiveCrawl`.
- `eventsForLiveCrawl` — loads one newly committed crawl for the future Alerts path. It currently
  has no package consumer.

### `src/product-query/monitor.ts`

Implements crawl-batched, newest-first Monitor pagination and filters.

- `monitorPage` — discovers matching crawl ids, then returns each selected crawl's complete event
  batch. Consumed by `programs/query-monitor.program.ts` and product-query tests.

### `src/product-query/pricing.ts`

Folds endpoint lifecycle and selected pricing events into chart-ready availability periods.

- `pricingHistory` — returns sparse pricing points without leaking values across availability
  periods. Consumed by `programs/query-pricing-history.program.ts` and product-query tests.

## Reporting and observability

### `src/observability/run.ts`

Owns artifact-program timing, structured JSONL logging, and durable success/failure lifecycle
reports.

- `timedPhase` — times and logs a named Effect phase. Consumed by all three artifact-producing
  programs.
- `runArtifactProgram` — allocates a run, installs its logger, records lifecycle reports, and only
  publishes success after the program returns. Consumed by artifact-producing programs and artifact
  tests.

### `src/reports/metrics.ts`

Calculates bounded, reusable summaries for each artifact kind.

- `archiveMetrics` — summarizes archive metadata and file size without reading payloads. Consumed by
  archive/database programs and artifact reporting.
- `snapshotMetrics` — summarizes metadata without reading crawl blobs. Consumed by snapshot/archive
  programs and artifact reporting.
- `databaseMetrics` — queries entity/event counts, distributions, field hotspots, metadata, range,
  and file size. Consumed by database building and artifact reporting.

### `src/reports/render.ts`

Owns human-oriented terminal rendering for reports and build inputs.

- `renderRunReport` — prints a stable compact run summary. Consumed by build and report commands.
- `logInputSummary` — emits structured input identity and metrics before expensive work. Consumed by
  artifact-producing programs.

## Programs

### `src/programs/shared.ts`

Holds values reused across more than one CLI program.

- `WorkDirectory`, `configuredWorkDirectory` — global workspace setting and its resolved value.
  Consumed by `src/cli.ts` and every program handler.
- `inputFlag`, `labelFlag`, `outputFlag`, `jsonFlag`, `modelSlugArgument` — shared CLI definitions.
  Consumed by the applicable program modules.
- `optionalValue` — converts Effect CLI options at the handler seam. Consumed by every program.
- `printJson` — stable JSON terminal output. Consumed by query and JSON-report commands.
- `provideReadOnlyDatabase` — supplies the SQLite read adapter. Consumed by query and database-report
  programs.

### `src/programs/extract-snapshot.program.ts`

- `extractSnapshot` — resolves a source ZIP, runs extraction, measures it, and records a snapshot
  artifact. Consumed by its co-located command handler.
- `extractSnapshotCommand` — `snapshot extract` CLI command. Consumed by `src/cli.ts`.

### `src/programs/import-bundle-archive.program.ts`

- `importBundleArchive` — resolves a snapshot, imports exact raw bytes, verifies the result, and
  records archive metrics.
- `importBundleArchiveCommand` — `archive import` CLI command. Consumed by `src/cli.ts`.

### `src/programs/build-database.program.ts`

- `buildDatabase` — validates options, resolves an archive, replays it, and records database metrics.
  Consumed by its co-located command handler.
- `buildDatabaseCommand` — `db build` CLI command. Consumed by `src/cli.ts`.

### `src/programs/report-artifacts.program.ts`

- `reportSnapshotCommand`, `reportArchiveCommand`, `reportDatabaseCommand` — artifact-specific
  `report` commands built over one private inspection workflow. Consumed by `src/cli.ts`.

### `src/programs/query-monitor.program.ts`

- `queryMonitor` — resolves a database and executes the Monitor read contract. Consumed by its
  co-located command handler.
- `queryMonitorCommand` — `db monitor` CLI command. Consumed by `src/cli.ts`.

### `src/programs/query-pricing-history.program.ts`

- `queryPricingHistory` — resolves a database and executes the Pricing History read contract.
  Consumed by its co-located command handler.
- `queryPricingHistoryCommand` — `db pricing-history` CLI command. Consumed by `src/cli.ts`.

## General transforms

### `src/transform/json.ts`

Owns JSON object narrowing and deterministic JSON representation.

- `JsonRecord` — unknown JSON object type. Consumed by projection modules.
- `isRecord` — excludes null and arrays when narrowing unknown objects. Consumed by projection
  modules.
- `canonicalJson` — recursively sorts object keys and omits undefined values before encoding.
  Consumed by event diffing and database writes.

## Tests

Test files export nothing; Bun's test runner consumes them.

- `test/artifacts.test.ts` — run-id collisions, publish eligibility, failed-run evidence, and legacy
  database references.
- `test/bundle-archive.test.ts` — exact-byte round trips, chronological reads, full verification,
  and immutable-row enforcement.
- `test/database.test.ts` — end-to-end replay into current state and immutable events, including a
  bounded build.
- `test/materialize.test.ts` — read-time filtering, embedded-model authority, deduplication, and
  bundle exclusions.
- `test/precision.test.ts` — daily final-crawl selection and full-precision passthrough.
- `test/product-query.test.ts` — complete Monitor batches and Pricing History availability periods.
- `test/snapshot.test.ts` — extracted snapshot metadata and referenced-blob validation.
