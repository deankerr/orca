# Projections

Owns the pure extraction, selection and interpretation shared by ingestion, products and Events.

## Transform contracts

| Transform          | Input                                         | Output contract                                                                                                                    |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Raw extraction     | Loaded, scoped scan                           | [Retained entity values](records.md#retained-payload) and [supplied readings](series.md#endpointreadings).                         |
| Raw comparison     | Two extracted scans                           | [Record write selection](records.md#writes).                                                                                       |
| Product projection | Subject and related values at a selected time | [Typed entity fields](catalog.md#currentmodels), [selected pricing](series.md#endpointprices) and [metadata](catalog.md#metadata). |
| Product comparison | Both sides projected through current code     | Interpreted differences for series and Events selection.                                                                           |

- Keep storage access in callers.
- For fixed rules, supplied scans determine ingestion output independently of wall-clock time,
  preceding stored projections and current cache contents.
- Product projection and raw retention are distinct representations.
- Baseline extraction uses one real scan directly; product starting values use the same projection rules.

**Implementation recommendation:** build on the existing `projections` module and consolidate
normalization currently spread through `v3/public` and CES.

## Product scope

- [Scan loading](scan.md#loaded-dataset) supplies the text-input-and-output scope before provider deduplication.
- Records, Readings, Catalog, Listings, Prices and Change Events consume that same scoped dataset.
- Field selection is separate from scope; the artifact retains the complete captured input.

## Projection fidelity

❓ Settle exact field retention and representation in a focused projection-design session: extracted
`entityRecords` payloads, `metadata` shapes and pricing `overrides` flattening or value restrictions.
The linked schemas are starting proposals; they do not settle which source values may be omitted or
transformed. Include scan-entry fields such as model `variant`, nested values, arrays and key collisions.

Validated entity fields belong at the top level of the owning `current*` schema; metadata contains
the remaining projected facts. This distinction is settled independently of the open fidelity choices.

## Pricing selection

- Produce the [selected quote contract](series.md#endpointprices) from source pricing.
- Use the same selection for historical price rows and current endpoint pricing.
- Share recognized meter meanings, units and display/analysis rules among consumers.
- Consumer interpretation follows the [pricing knowledge base](../openrouter/pricing.md), including
  already-discounted normalized rates and opaque conditional overrides.

## Hydration and comparison

### Hydration

- Project subject and related values supplied for the same observation time.
- Callers use [Records' contextual reads](records.md#reads) to obtain that context.
- Endpoint hydration requires the related model and provider records at the selected context time.
- Models and providers carry their latest known values forward, including while they have no listed endpoints.
- Endpoint availability and relationship intervals come from [Listings](series.md#endpointlistings).
- [Catalog](catalog.md#hydration-and-last-known-state) chooses current/last-known cache context.

### Comparison

1. Include endpoint dependants of changed models/providers among the comparison candidates.
2. Project both sides through the same current code.
3. Compare interpreted values for the consuming module's selection.

A related model/provider change can alter an endpoint's projection while its own raw record stays
unchanged. Conversely, a raw-only `status` change can produce a retained record with zero product
differences. Events owns announcement judgment.

## Evolution

| Change               | Where it takes effect                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Projection code      | New reads use the current interpretation.                                                           |
| Cached projection    | [Catalog refresh](catalog.md#refresh) applies current code to retained sources.                     |
| Event interpretation | [Events](change-events.md#execution) owns its execution and publication lifecycle.                  |
| Raw extraction       | [Scan artifacts](scan.md#artifact-contract) preserve complete inputs for revisiting the derivation. |
