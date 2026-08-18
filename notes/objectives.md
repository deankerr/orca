# Objectives

- Capture what we use as raw artifacts, then build disposable and rebuildable projections
- Develop and deploy reliable and accessible bulk data capture solution
- Unify historical and active capture data sources
- Enable modular processing pipelines/utilities
- Satisfy existing product data requirements

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
- Query page size should not need to be coupled to crawl batch size

#### Alerts

- Durable, observable broadcast system (rebuild with Cloudflare stack)

### Pricing History Charts

- Replace data source
- Constrain granularity
- ❓ Should also just use Monitor change events

## Ultimate Objective

- Shut down `@orca/backend` `snapshots` process.
