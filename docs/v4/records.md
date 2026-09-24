# Records

Owns retained MEP values and historical context.

## `entityRecords`

One row records a complete extracted entity value at an observation time.

### Schema

```ts
const entityRecords = defineTable({
  scan_at: v.string(),
  entity_kind: literals('model', 'provider', 'endpoint'),
  entity_id: v.string(),
  model_id: v.optional(v.string()),
  provider_id: v.optional(v.string()),
  raw_json: v.string(),
})
  .index('by_entity_kind_and_entity_id_and_scan_at', ['entity_kind', 'entity_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
```

### Fields and invariants

| Field                      | Meaning or constraint                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `scan_at`                  | Observation time of this value; an ordinary comparison uses its later scan.                |
| `entity_kind`, `entity_id` | Native MEP identity; models/providers use slugs and endpoints use UUIDs.                   |
| `model_id`                 | Endpoint's native model relationship.                                                      |
| `provider_id`              | Endpoint's provider identity, extracted from `provider_info.slug`.                         |
| `raw_json`                 | Complete extracted entity observation as JSON text, including ORCA corrections and extras. |

- Logical uniqueness: `(entity_kind, entity_id, scan_at)` has one owned value.
- Endpoint rows require their model/provider relationships; their payload requires `provider_tag`.
- Rows are immutable. Values stand independently of preceding stored projections.
- A missing row means unavailable local state; retained values carry forward through later omissions.
- Comparison provenance lives in [Ingestion](ingestion.md#ingestions), rather than in each row.

### Entity knowledge and availability

- Once observed, models and providers remain known under their slug identities, including when no
  listed endpoints refer to them.
- Models and providers have no unlisted state; listed endpoint membership supplies availability summaries.
- [Listings](series.md#endpointlistings) owns endpoint availability and model/provider association times.
- Records retains actual values; disappearance produces no tombstone or deletion.

### Retained payload

The payload follows [Scan's extraction contract](scan.md#extraction). `raw_json` means the retained
input to the product lens, rather than an untouched upstream body. Together with related records,
it contains everything needed for projection without consulting a current cache.

| Input                    | Retained representation                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Model                    | Extracted model facts and scan-derived extras, including variant when supplied.                                |
| Provider                 | Selected `provider_info` object, keyed by its `slug`.                                                          |
| Endpoint                 | Extracted endpoint facts without related entity bodies or readings; `provider_slug` renamed to `provider_tag`. |
| Source pricing           | Retained in full on the endpoint, including presentation fields.                                               |
| Performance measurements | Stored by [Readings](series.md#endpointreadings), so measurement churn avoids full endpoint revisions.         |

**Provider selection:** after [Scan's text-model filter](scan.md#loaded-dataset), the last provider
occurrence in the admitted scan encounter order wins. Extraction precedes comparison and field
interpretation. Endpoint-local names and policies remain with the endpoint; provider-owned context
comes from the provider record.

**Validation:** extraction validates the deliberately required entity contract before storage.
JSON text preserves arbitrary upstream keys and nested values. Optional product facts are decoded
by the shared lens when used, rather than becoming additional ingestion prerequisites.

### Indexes

| Index                                      | Purpose                                             |
| ------------------------------------------ | --------------------------------------------------- |
| `by_entity_kind_and_entity_id_and_scan_at` | Historical entity lookup.                           |
| `by_scan_at`                               | Inspect the retained output at an observation time. |

### Writes

| Input condition                             | Output                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| Baseline population                         | Complete extracted values at the baseline's real scan time.    |
| Appearance/reappearance                     | Complete later value and native relationships.                 |
| Raw value or source relationship changes    | Complete later value and native relationships.                 |
| Entity omitted from a later scan            | No new record; endpoint disappearance is recorded in Listings. |
| Extracted value and relationships unchanged | No new record.                                                 |

- Writers append prepared rows under [Ingestion's mutation-step protocol](ingestion.md#forward-ingestion).
- A later change can populate an entity omitted from the starting state. This explains partial
  coverage; complete captured inputs remain in [Scan artifacts](scan.md#artifact-contract).

### Reads

| Read              | Result                                                                         |
| ----------------- | ------------------------------------------------------------------------------ |
| `recordAt`        | Latest retained record through the selected cutoff.                            |
| `contextAt`       | Subject and related model/provider records resolved at the same selected time. |
| Last-known lookup | Earlier retained context needed to represent an unlisted endpoint.             |

- Ordinary cutoffs are capped at the [ORCA clock](ingestion.md#clock-reads).
- State reads carry forward retained values; gaps add no transition or coverage check.
- Endpoint contextual reads include the required model and provider records for
  [Projections](projections.md#hydration-and-comparison) to hydrate complete entity fields.
- Native relationships support historical hydration, new projections and model/provider dependant
  discovery; Listings supplies their availability intervals.
