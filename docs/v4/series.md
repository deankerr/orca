# Historical series

Prices, Listings and Readings own immutable, time-indexed product data, appended through
[Ingestion](ingestion.md#workflows) and read directly by products.

## `endpointPrices`

One row is a complete selected quote for an endpoint at an observation time.

### Schema

`pricing` is also the stored pricing contract for [current endpoints](catalog.md#currentendpoints).
The starting fields and indexes match V3; override representation remains part of the
[open projection-fidelity question](projections.md#projection-fidelity).

```ts
const pricing = v.object({
  discount: v.number(),
  meters: v.record(v.string(), v.string()),
  overrides: v.optional(
    v.array(
      v.record(
        v.string(),
        v.union(v.boolean(), v.number(), v.null(), v.string(), v.array(v.string())),
      ),
    ),
  ),
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

| Field         | Meaning or constraint                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| `endpoint_id` | Native endpoint UUID.                                                                         |
| `scan_at`     | Observation time of the quote.                                                                |
| `discount`    | Native source discount, retained without applying it to stored meters.                        |
| `meters`      | Selected decimal-string meter values; zero and omitted values retain their supplied meanings. |
| `overrides`   | Optional selected overrides; V3's flattening and value restrictions are a starting proposal.  |

- The selected representation excludes `display_pricing`; full source pricing remains in Records.
- Storage adds no unit fields and performs no unit conversion or conditional-price calculation.
- Consumers decide display/analysis meanings through [shared pricing interpretation](projections.md#pricing-selection).

### Indexes

| Index                        | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `by_endpoint_id_and_scan_at` | Quote history and the applicable quote through a cutoff. |
| `by_scan_at`                 | Observation-time lookup, preserving V3's index contract. |

### Reads and writes

- **Writes:** append the quotes selected by the [price/listing transition matrix](#price-and-listing-transitions).
- **Reads:** carry quotes forward within listed intervals.
- **Catalog relationship:** refresh leaves this history intact; current endpoint pricing is selected
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
- **Catalog relationship:** supply listing transitions for [last-known hydration](catalog.md#hydration-and-last-known-state).
- **Discovery:** endpoint-membership supplement to [Records' complete MEP identity discovery](records.md#identity-discovery).

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

| Observation                                        | Prices output                                             | Listings output                                           |
| -------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| First pair's earlier scan                          | Starting quote for each in-scope endpoint                 | Listed baseline state                                     |
| Appearance/reappearance                            | Current quote, even when repeated                         | Listed state                                              |
| Selected pricing change                            | Complete quote, including observed zero or omitted meters | No transition                                             |
| Model or provider relationship change while listed | Starting quote for the new relationship trace             | One listed row with the later model/provider associations |
| Disappearance from product scope                   | No quote                                                  | Unlisted state with last-known associations               |
| Other entity change                                | No quote                                                  | No transition                                             |

The matrix describes each cause's contribution; a comparison can contain multiple causes, combined
into at most one quote and one listing row per endpoint at the later scan time.

## Write composition

Each module validates and appends prepared rows from Projections. Its writer is callable inside
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
