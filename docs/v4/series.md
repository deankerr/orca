# Historical series

Prices, Listings and Readings own immutable, time-indexed product data, appended through
[Ingestion](ingestion.md#workflows) and read directly by products.

## `endpointPrices`

One row contains complete selected pricing for an endpoint at an observation time.

### Schema

`pricing` is also the stored pricing contract for [current endpoints](catalog.md#currentendpoints).
Meter and discount fields retain V3's representation; complete overrides use JSON text rather than
V3's flattened, restricted metadata representation.

```ts
const pricing = v.object({
  discount: v.number(),
  meters: v.record(v.string(), v.string()),
  overrides_json: v.optional(v.string()),
})

const endpointPrices = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  ...pricing.fields,
})
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
```

### Fields and invariants

| Field            | Meaning or constraint                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `endpoint_id`    | Native endpoint UUID.                                                                         |
| `scan_at`        | Observation time of the pricing.                                                              |
| `discount`       | Native source discount, retained without applying it to stored meters.                        |
| `meters`         | Selected decimal-string meter values; zero and omitted values retain their supplied meanings. |
| `overrides_json` | Complete supplied override array as JSON text, retaining nested conditions and values.        |

- The selected representation excludes `display_pricing`; full source pricing remains in Records.
- Meter maps select string values with database-safe keys; other pricing facts remain in Records.
- Storage adds no unit fields and performs no unit conversion or conditional-price calculation.
- Consumers decide display/analysis meanings through [shared pricing interpretation](projections.md#pricing-selection).
- Overrides are curated pricing data, independent of metadata filtering. Shared interpretation
  validates recognized public-schema structures for rendering; storage preserves the full array.

### Indexes

| Index                        | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `by_endpoint_id_and_scan_at` | Price history and the applicable pricing through a cutoff. |
| `by_scan_at`                 | Observation-time lookup, preserving V3's index contract.   |

### Reads and writes

- **Writes:** append the prices selected by the [price/listing transition matrix](#price-and-listing-transitions).
- **Reads:** carry prices forward within listed intervals.
- **Catalog relationship:** current-row updates leave this history intact; endpoint pricing is selected
  from raw entity values.

## `endpointListings`

One row records an endpoint's listing state and model/provider relationships when any of them changes.

### Schema

```ts
const endpointListings = defineTable({
  scan_at: v.string(),
  endpoint_id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
  state: literals('listed', 'unlisted'),
})
  .index('by_model_id_and_scan_at', ['model_id', 'scan_at'])
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
```

### Fields and invariants

| Field                     | Meaning or constraint                                                        |
| ------------------------- | ---------------------------------------------------------------------------- |
| `scan_at`                 | Observation time of the transition.                                          |
| `endpoint_id`             | Native endpoint UUID.                                                        |
| `model_id`, `provider_id` | Native associations; an unlisted transition retains last-known associations. |
| `state`                   | Availability under the [shared product scope](projections.md#product-scope). |

- Logical uniqueness: one row per `(endpoint_id, scan_at)`.
- Ingestion appends a row whenever listing state, `model_id` or `provider_id` changes.
- A relationship change while listed appends one `listed` row with the new associations.
- Adjacent rows bound each association interval, even when both rows have state `listed`.
- `provider_tag` is mutable endpoint accessor data; changing it alone contributes no listing row.
- Only endpoints have listing state; models and providers remain known regardless of listed membership.
- A gap in the ingestion log alone contributes no transition.

For one endpoint, these observations describe successive relationships:

| Time | State    | Model | Provider |
| ---- | -------- | ----- | -------- |
| T1   | `listed` | A     | P        |
| T2   | `listed` | A     | Q        |
| T3   | `listed` | B     | Q        |

The A/P association lasts from T1 to T2, and A/Q from T2 to T3; the endpoint remains listed throughout.

### Indexes

| Index                        | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `by_model_id_and_scan_at`    | Historical endpoint membership for a model.                 |
| `by_endpoint_id_and_scan_at` | Availability intervals and listing context for an endpoint. |

### Reads and writes

- **Writes:** append transitions from the [shared matrix](#price-and-listing-transitions).
- **Reads:** build availability and relationship intervals from each endpoint's ordered transitions.
- **Model discovery:** use the model index to find candidate endpoints, then read their endpoint
  histories; the next row can close a model association while naming a different model.
- **Catalog relationship:** the same scan pair supplies listing transitions and
  [current endpoint availability](catalog.md#hydration-and-last-known-state).

## `endpointReadings`

One row is a supplied performance sample for one endpoint, scan and tier.

### Schema

The tier/sample shape reuses V3's native stats representation.

```ts
const endpointReadings = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  tier: v.string(),
  sample: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
})
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
```

### Fields and invariants

| Field         | Meaning or constraint                                              |
| ------------- | ------------------------------------------------------------------ |
| `endpoint_id` | Native endpoint UUID.                                              |
| `scan_at`     | Exact observation time of the sample.                              |
| `tier`        | `default` for source `stats`; source tier names for `statsByTier`. |
| `sample`      | Supplied measurement fields in an open number/string/null map.     |

- Logical uniqueness: one row per `(endpoint_id, scan_at, tier)`.
- Repeated measurements at different scans remain separate observations.
- An omitted sample remains absent; previous measurements never carry forward.

### Indexes

| Index                        | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `by_endpoint_id_and_scan_at` | Per-endpoint readings at a time or across history. |
| `by_scan_at`                 | Current stats at the ORCA clock's exact scan.      |

### Reads and writes

- **Extraction:** take `stats` and supplied `statsByTier` samples out of the raw endpoint before
  entity comparison; retain each endpoint/scan/tier once.
- **Writes:** append every supplied sample, including baseline samples and repetitions.
- **Current reads:** read the [ORCA clock](ingestion.md#clock-reads) exactly, including an empty result.
- **History reads:** use the same retained samples for narrow endpoint/time queries.

🚧 A future stats materialization can choose its own window and refresh lifecycle when required.

## Price and listing transitions

Prices and Listings use the same comparison and [product scope](projections.md#product-scope).

| Observation                                        | Prices output                                               | Listings output                                           |
| -------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| First pair's earlier scan                          | Starting pricing for each in-scope endpoint                 | Listed baseline state                                     |
| Appearance/reappearance                            | Current pricing, even when repeated                         | Listed state                                              |
| Selected pricing change                            | Complete pricing, including observed zero or omitted meters | No transition                                             |
| Model or provider relationship change while listed | Starting pricing for the new relationship trace             | One listed row with the later model/provider associations |
| Disappearance from product scope                   | No price row                                                | Unlisted state with last-known associations               |
| Other entity change                                | No price row                                                | No transition                                             |

The matrix describes each cause's contribution; a comparison can contain multiple causes, combined
into at most one price and one listing row per endpoint at the later scan time.

## Write composition

Each module validates and appends prepared rows. Scan supplies extracted readings; Projections
selects entity, pricing and listing changes. Each writer is callable inside
[Ingestion's mutation step](ingestion.md#forward-ingestion), sharing that commit with phase advancement.
Ingestion owns step ordering, completion and [initialization recovery](ingestion.md#initialization).

## Product reads

### Pricing History

- Compose Prices and Listings with endpoint/model/provider discovery from retained relationships or a cache.
- Read through a selected cutoff using endpoint/time indexes.
- Reuse existing trace construction and sampling.
- Listing gaps and model/provider relationship changes break traces; reappearance starts a fresh trace.
- Unavailable meters interrupt their trace.

### Grid and background readers

- The grid combines [Catalog rows](catalog.md#product-reads) with current Readings.
- Consumer interpretation uses current projection code.
- Multi-step background readers select completed observation times explicitly.
- Single-query reads use Convex's transaction guarantees.
