# V4

Purpose: replace V3's grid, overview, current stats and pricing-history backend.

[Conventions](conventions.md) · [Remaining work](stages.md) · [Glossary](../../CONTEXT.md)

## Module rationale

### Scan: isolate upstream structure

- Neutral observations spare consumers from decoding upstream nesting and overloaded identities.
- Current product scope requires both text input and text output.
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
- Stats retains every supplied upstream observation.
- Stats contents are upstream-defined.
- Missing stats never inherit an earlier value.
- Exact-scan reads avoid maintaining a separate current-stats copy.

### Ingestion: coordinate recoverable progress

- Data modules own interpretation; Ingestion owns execution order and progress.
- Capture, materialization and event publication have independent completion meanings.
- Stored artifacts are the backlog.

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
- Existing database contents never select updates.
- Catalog identity reads serve insertion or replacement.
- History inserts omit duplicate checks.

### Exclusive execution

- Ingestion is not idempotent.
- At most one ingestion may be unfinished.
- Writes and their checkpoint commit in the same table mutation.
- Resumption skips committed steps.
- Final endpoint writes atomically complete ingestion and schedule continuation.
- One pair per action allows backfills to span action lifetimes.
- One mutation per table preserves V3's simple transaction model.
- Transaction splitting requires demonstrated limits.

### Manual recovery

- Recover only after the previous execution has stopped.
- Restore ready status without resetting the checkpoint.
- Invalidated committed output requires repair or replay.
- Unfinished work constrains changes to checkpoint names and derivation rules.
- Automatic retries, leases, heartbeats and stuck-run recovery are deliberately absent.

## Time and visibility

- Observation time dates ORCA's knowledge, not necessarily an upstream change.
- Catalog timestamps date the last row update.
- Catalog becomes visible per table mutation, allowing temporarily mixed observation times.
- History is visible only through the completed ingestion clock.
- Multi-request historical loads pin one cutoff.
- Completion does not make Catalog an arbitrary-time snapshot.

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
