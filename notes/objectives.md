# Objectives

- Capture everything trustworthy as immutable raw artifacts, then project only what a product needs
  into a cache or query store. A projection is disposable and rebuildable; raw capture is not.
- Develop and deploy reliable and accessible bulk data capture solution
- Unify historical and active capture data sources
- Enable modular processing pipelines/utilities
- Satisfy existing product data requirements

## Immediate production slice

Build confidence one product outcome at a time instead of designing every future product, modality,
and schema variation together.

1. Instantiate live core projection and diff processing from a recorded cutover crawl.
2. Prove the selected current view and immutable change events by repeatedly rebuilding the full
   archive with `bun:sqlite`.
3. Backfill the same event contract forward from the historical archive to the cutover boundary.
4. Supply Monitor and constrained Pricing History from those events.
5. Supply the ORCA API from the D1 current view; evaluate the Grid cutover from the same view.

SQLite is the local executable specification, not the production architecture. Raw artifacts remain
authoritative, and the processor must expose a store contract that a later production adapter can
implement. Choose D1 or another remote projection only after the full history and product queries
are proven locally.

## Products

- Harmonize schema/field label definitions
- Enable "easy win" feature enhancements via better platforms/deployments

### Endpoints Data Grid

- Live endpoints catalog data projected into a "current" cache or store
- LLMs only
- Similar data requirements, but does not need to be a "drop in" schema (make improvements)
- ❓ Retain Convex for reactive updates
  - ❓ Transition to new reactive frontend data source
- 🔮 (Future) Expand modality-specific data support

### ORCA API

- Serve a V2-compatible projection from the current store (a separately cached blob is optional)
- V2 compatible
- 🔮 (Future) Develop V3 schema

### Monitor / Alerts

Note: These are separate products but should share event data, i.e. a Discord alert should have a matching Monitor item

- Derive change events from artifact diffs
- Enrich change events with contextual metadata as valid for that period (e.g. model/provider names)
  - ⚠️ `@orca/backend` Monitor presents current metadata as historical
- Processing pipeline for both historical and active data
  - ⚠️ Alerts should not be broadcast for historical data
- ❓ Baked in or just in time metadata

#### Monitor

- Improve query dimensions

#### Alerts

- Durable, observable broadcast system (rebuild with Cloudflare stack)

### Pricing History Charts

- Replace data source
- Constrain granularity
- ❓ Should also just use Monitor change events

## Ultimate Objective

- Shut down `@orca/backend` `snapshots` process.
