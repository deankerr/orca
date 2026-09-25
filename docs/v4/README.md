# V4

Purpose: replace V3's grid, overview, current stats and pricing-history backend.

[Conventions](conventions.md) · [Remaining work](stages.md) · [Glossary](../../CONTEXT.md)

> **Temporary override — production backfill:** This guide describes normal operation.
> While the one-time backfill runs, [its guarantees and completeness rules](backfill.md)
> override the usual Catalog and progress guarantees below. Remove this notice and that
> document when the backfill is retired.

## Module rationale

### Scan: isolate upstream structure

- Neutral observations spare consumers from decoding upstream nesting and overloaded identities.
- Current product scope requires both text input and text output.
- Endpoint `status` is dropped at extraction: it is noisy and carries no meaning.
- Durable artifacts retain broader evidence for later reinterpretation.
- Capture and artifact storage remain shared infrastructure.

### Catalog: accumulate knowledge

- Omission does not erase knowledge of an entity.
- Unlisted endpoints retain last-known facts.
- Rebuilding cumulative state requires historical replay or a coherent baseline.
- Copied model facts on endpoints serve the grid.
- Metadata remains with its owning entity.
- Endpoint labels follow [endpoint-local ownership](../orca/provider-identity.md).

### History: preserve distinct kinds of continuity

- Pricing, Listings and Stats describe the same endpoint timeline.
- Sparse Listings avoids repeating associations and tags across high-volume Stats.
- Pricing carries forward within continuous availability.
- Reappearance supplies a fresh quote, even when its value repeats.
- Stats history is dormant: its code remains, unregistered, until it receives dedicated attention.

### Current stats: the grid's hot path

- Only the grid's two default-tier readings are kept, for the latest scan only.
- Null, malformed and missing readings are all "no reading", represented by absence.
- Missing readings never inherit an earlier value, including for unlisted endpoints.
- Every row is assessed against each incoming scan; the grid reads the whole table, so it has no indexes.

### Ingestion: coordinate recoverable progress

- Data modules own interpretation; Ingestion owns execution order and progress.
- Capture, materialization and event publication have independent completion meanings.
- Stored artifacts are the backlog.
- Catalog is the heart of discovery; it gates what every other module may reflect.
- Routine draining, deployment initialization and module catch-up have separate entry points
  under `v4/ingestion/`. The registry owns processor selection and replay/latest policy.

## Representation decisions

- JSON text preserves extensible metadata beyond Convex object-key restrictions.
- Typed fields express the facts ORCA deliberately relies on.
- Query interpretation follows V3's product meanings.
- Invalid optional facts may become unknown.
- Malformed required facts fail.
- Presentation choices do not redefine retained facts.
- The grid omits zero prices while historical pricing retains them.
- Catalog sorts metadata string arrays to suppress order-only writes.
- Pricing override order is preserved.
- Storage equality does not determine event significance.

## Ingestion assumptions

### Deterministic selection

- Supplied observations and rules determine output selection.
- Existing database contents never select updates, except current stats' whole-table assessment.
- Catalog identity reads serve insertion or replacement.
- History inserts omit duplicate checks.

### State

- A declared pair is the official next step of the stream; the latest one is the Catalog clock.
- Declaration commits in the same mutation as the pair's Catalog writes.
- Each following module owns one cursor: its output reflects every declared pair through it.
- A null cursor awaits the module's baseline at the first declared pair.
- A module is current when its cursor equals the clock before the newest pair, otherwise behind.
- Status, phases and running or failed markers are deliberately absent; failures are logs.

### Initialization

- Each deployment initializes the Catalog once, from its first two artifacts, before routine operation.
- The baseline is too large for one mutation, so each Catalog table commits separately; declaration comes last.
- It is not resumable; after a failure, rerun it from the start, since writes replace by identity.
- This is deliberately non-routine: partial table writes can persist without a declaration,
  and no per-table progress is saved. Start following modules after initialization succeeds.

### Routine operation

- One action loads the next pair once, then advances the Catalog.
- Catalog failure commits nothing; the stream halts until the pair succeeds or is manually skipped.
- Current modules then process the same loaded pair independently.
- A failed module falls behind without blocking the Catalog or other modules.
- Behind modules are skipped by routine operation.
- Routine continues scheduling itself while further artifacts exist.

### Catch-up

- Each module has a private catch-up loop, started manually.
- Replaying modules walk every declared pair from their cursor; latest-only modules jump to the clock.
- One step per action allows catch-up to span action lifetimes.
- Reaching the clock returns the module to routine operation.

### Exclusive writes

- Ingestion is not idempotent.
- Writes and their cursor advance commit in the same mutation.
- A write whose expected cursor has moved rolls back, so concurrent runs never apply a pair twice.
- Routine Catalog writes commit all tables in one mutation; only initialization is split.
- Mutation logs are lost on timeout, so callers log counts and serialized argument length first.

### Manual recovery

- Rerun a behind module's catch-up after fixing its cause.
- Invalidated committed output requires repair or replay.
- Automatic retries, leases, heartbeats and stuck-run recovery are deliberately absent.

## Time and visibility

- `scan_at` means the data came from the scan at that time.
- Observation time dates ORCA's knowledge, not necessarily an upstream change.
- Catalog is volatile and historyless; its timestamps are not a change log.
- Departed entities keep the facts, and `scan_at`, of the scan they were last seen in.
- Modules never reflect a pair the Catalog does not.
- History is visible only through its module's cursor.
- Multi-request historical loads pin one cutoff.
- Tearing between Catalog tables and modules is accepted.

## Historical identity

- Provider tags are mutable and non-unique within a model.
- Historical offerings retain endpoint UUIDs and period-correct provider identity.
- A tag change can split an offering without producing a price change.
- Historical model discovery uses Listings rather than today's Catalog.
- A later listing under another model closes the earlier association.
- Historical windows need entering prices and listings.
- Pagination boundaries do not represent changes or gaps.

## Evidence retained for later work

- Current products do not require general entity revisions or persisted diffs.
- Artifacts preserve evidence for delayed processing.
- Future Events requirements will determine its context-retention design.
