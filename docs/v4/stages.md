# Remaining work

## Milestones

**Ready to integrate:** verified backend, full historical catch-up and working ongoing ingestion.

**Reassessment:** pause at readiness before deciding when to integrate.

**Integrated:** a product consumes V4 and its end-to-end behavior is verified.

## Current position

- Core ingestion and query code exists.
- Full-history coverage and deployed operating behavior remain unverified.
- Consumer integration remains pending.
- Testing is deferred for a holistic review.
- Do not add or run tests until that review.

## Historical processing

Approach: deploy and backfill independently of frontend adoption.

Rationale: real history reveals source-shape failures and capacity limits before public cutover.

### Coverage

- Establish the earliest baseline and catch-up cutoff.
- Confirm access to the complete artifact backlog.
- Process the baseline and every subsequent available scan.
- Confirm catch-up without blocked unfinished work.
- Demonstrate processing of new captures.

### Operating evidence

- Exercise continuation, module isolation, catch-up and cursor visibility.
- Measure mutation volume and runtime through Convex/Axiom metrics.
- Compare Catalog and current stats with V3 at matching observations.
- Exercise model moves, tag changes, duplicate tags, gaps and reappearances.
- Measure complete historical reads, including pagination and entering state.
- Record coverage and verification evidence before declaring readiness.

### Operational notes

Run commands from `packages/backend`, selecting the intended deployment explicitly:

```sh
bunx convex run --deployment dev <function-path> '<args>'
```

| Manual command                              | Args                      | Prerequisite and effect                                                                                          | Failure recovery                                                              |
| ------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `v4/ingestion/initialize:initializeCatalog` | `{}`                      | No declared pair; at least two artifacts. Write the first pair's Catalog, then declare it.                       | Rerun from the beginning; no saved per-table progress.                        |
| `v4/ingestion/modules:startModule`          | `{ "module": "pricing" }` | After Catalog initialization, start a registered module with no cursor. Create its cursor and schedule catch-up. | Inspect cursors: if created, use `catchUpModule`; otherwise rerun.            |
| `v4/ingestion/modules:catchUpModule`        | `{ "module": "pricing" }` | Existing module cursor. Schedule one step at a time until it reaches the Catalog clock.                          | Fix the cause and rerun; committed steps remain complete.                     |
| `v4/ingestion/routine:drainArtifacts`       | `{}`                      | Initialized Catalog. Advance Catalog and current modules, continuing until no newer artifacts exist.             | Rerun for Catalog failure; use `catchUpModule` for a failed following module. |

Start `pricing`, `listings` and `current_stats` independently. Pricing and Listings replay
declared pairs; current stats jumps to the Catalog clock. Stats history is dormant.

Read-only inspection:

- `v4/ingestion/progress:getCatalogScanAt` with `{}` returns the latest declared scan, or null.
- `v4/ingestion/progress:listModuleCursors` with `{}` returns started modules and their cursors.
  A missing module has not started; a null cursor awaits its baseline.

`commitCatalogPair`, `writeInitial…`, `declareInitialPair` and module `commitStep` mutations
are workflow transaction steps. Run the manual entry points above rather than invoking
these steps individually. `getNextModuleStep` selects work for orchestration without advancing it.

- `ORCA_V4_INGEST_ENABLED` controls routine cron admission.
- The cron calls `v4/ingestion/routine:scheduleIfEnabled`; manual draining bypasses the flag.
- Disabling cron admission does not stop an existing drain.
- Production already owns the shared artifact backlog.

## Integration after reassessment

- Connect grid, overview and current stats to V4.
- Adapt pricing-history loading and rendering to Listings plus Pricing.
- Preserve historical offering identity and existing sampling intent.
- Measure per-endpoint query fan-out on populated data.
- Switch raw inspection's ingestion-record index to V4.
- Keep raw comparisons artifact-backed.
- Verify each product before retiring its superseded V3 path.

## Independently deferred

These projects do not block V3 product-replacement readiness.

### Events and notifications

- Design interpretation, retained context and publication together.
- Settle consumer queries and delivery eligibility from actual product needs.
- General entity history, persisted changesets and reconstruction remain open choices.
- V3 Events is a design reference.
- `textFeed` is a stand-in consumer.
- Existing Monitor/Alerts/Discord implementations carry no reuse requirement.

### Public API V2

- Keep `packages/backend/convex/public_api/` sealed until its developer-guided session.
- Legacy field semantics must not shape contemporary V4 meanings.
- A compatibility review and isolated adapter precede serving cutover.

### Deployment sync

- Choose artifact replay or derived-state transfer when a concrete workflow needs it.
- Imported Catalog and ingestion progress must describe coherent state.
- Historical windows require entering state as well as changes within the window.
- Preserve observation identity across deployments.
- Remap deployment-local Convex IDs when transferring related data.
- Data import creates no notification obligation.

### Final retirement

- Retire shared or legacy processes only after their remaining consumers have moved.
- Public API serving requires its own accepted replacement before shutdown.
