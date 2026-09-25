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

- Exercise continuation, manual recovery and completed-clock visibility.
- Measure mutation volume and runtime through Convex/Axiom metrics.
- Prioritize Stats as the main volume pressure test.
- Compare Catalog and current stats with V3 at matching observations.
- Exercise model moves, tag changes, duplicate tags, gaps and reappearances.
- Measure complete historical reads, including pagination and entering state.
- Record coverage and verification evidence before declaring readiness.

### Operational notes

- `v4/ingestion:run` with `{}` starts the backlog drain.
- `ORCA_V4_INGEST_ENABLED` controls routine cron admission.
- Disabling cron admission does not stop an existing drain.
- Production already owns the shared artifact backlog.
- Deployment-sync tooling is not required for production backfill.

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
