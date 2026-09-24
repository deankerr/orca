# Projections

Owns the pure projection lens, selection and interpretation shared by ingestion, products and Events.

Events is a future consumer whose full design is deferred by the [implementation stages](stages.md).

## Transform contracts

| Transform          | Input                                         | Output contract                                                                                                                    |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Entity comparison  | Two extracted observations                    | [Record write selection](records.md#writes).                                                                                       |
| Product projection | Subject and related values at a selected time | [Typed entity fields](catalog.md#currentmodels), [selected pricing](series.md#endpointprices) and [metadata](catalog.md#metadata). |
| Product comparison | Both sides projected through current code     | Interpreted differences for series and Events selection.                                                                           |

- Keep storage access in callers.
- For fixed rules, supplied scans determine ingestion output independently of wall-clock time,
  preceding stored projections and current cache contents.
- Product projection and raw retention are distinct representations.
- Baseline population uses one extracted observation directly; product starting values use the same lens.
- Scan owns extraction. Projection consumes its entity contract, whether supplied directly by Scan
  or decoded from Records; it never reinterprets upstream entity nesting.

**Implementation recommendation:** build on the existing `projections` module and consolidate
normalization currently spread through `v3/public` and CES.

## Product scope

- [Scan loading](scan.md#loaded-dataset) supplies the text-input-and-output scope before provider deduplication.
- Records, Readings, Catalog, Listings, Prices and Change Events consume that same scoped dataset.
- Field selection is separate from scope; the artifact retains the complete captured input.

## Representation and validation

- Deliberately required entity fields have typed product contracts; their validation failures mean
  the observation cannot be interpreted correctly.
- Remaining upstream facts retain nested JSON structure. Records stores the extracted payload;
  Catalog stores extensible projected facts in `metadata_json`.
- Metadata can be parsed inside the pure lens. Encode arbitrary content as JSON text when crossing
  Convex storage or function seams; decoding alone does not make arbitrary keys Convex-safe.
- Recognized optional facts have shared decoders that handle historical absence and invalid values
  as unavailable. Consumers select these meanings rather than implementing their own era handling.
- Preserve distinctions between absent, explicit null, false and zero. Unknown facts acquire no
  product meaning simply because they were retained.
- Flattening is a consumer convenience, not a persistence rule. Preserve nested structures and
  literal keys in stored JSON rather than resolving collisions or dropping unsupported leaves.

## Pricing selection

- Produce the [selected pricing contract](series.md#endpointprices) from source pricing.
- Use the same selection for historical price rows and current endpoint pricing.
- Preserve complete selected overrides as JSON text, independently of metadata processing.
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

| Change               | Where it takes effect                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Projection code      | New reads use the current interpretation.                                                                          |
| Current Catalog      | [Ingestion writes](catalog.md#ingestion-writes) apply changes from each pair; broader reprojection is non-routine. |
| Event interpretation | [Events](change-events.md) design and implementation are deferred.                                                 |
| Raw extraction       | [Scan artifacts](scan.md#artifact-contract) preserve complete inputs for revisiting the derivation.                |

Changing display or interpretation rules uses retained data directly. Changing which facts were
selected into historical series can require rebuilding those series; routine ingestion does not do so.
