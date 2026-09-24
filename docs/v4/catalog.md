# Catalog

Owns cumulative current/last-known MEP tables, ingestion-time writes and product-facing reads.

> ⚠️ These tables never forget an entity. Although sometimes called caches, their rows are retained
> and only overwritten with new information. Models/providers remain known; endpoints become
> unlisted rather than being deleted. Missing from a scan never means delete from Catalog.

## `currentModels`

One row is the current or useful last-known projection of a model.

### Schema

Validated entity fields are top-level fields on their owning current table, using the existing
projection names where applicable. `metadata_json` contains remaining projected facts as JSON text
across all three tables.

```ts
const metadata_json = v.string()

const currentModels = defineTable({
  model_id: v.string(),
  scan_at: v.string(),
  slug: v.string(),
  permaslug: v.string(),
  variant: v.string(),
  display_name: v.string(),
  or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  metadata_json,
}).index('by_model_id', ['model_id'])
```

### Fields and invariants

| Field                                   | Meaning or constraint                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `model_id`                              | Model identity from the scan entry, including its variant suffix; one cache row per model. |
| `scan_at`                               | Observation that last updated this row; unchanged observations leave it untouched.         |
| `slug`                                  | Source model's base slug, retained separately from the variant-aware `model_id`.           |
| `permaslug`                             | Source model's versioned identifier.                                                       |
| `variant`                               | Validated model variant supplied by the scan entry.                                        |
| `display_name`                          | Source `short_name`.                                                                       |
| `or_created_at`                         | Source `created_at`, distinct from observation time.                                       |
| `input_modalities`, `output_modalities` | Validated source modality lists.                                                           |
| `metadata_json`                         | Remaining projected model facts under the metadata contract below.                         |

### Metadata

The same contract applies to model, provider and endpoint metadata:

- Additional capabilities, limits, policies and other facts not represented by typed entity fields live here.
- JSON text preserves arbitrary keys and nested values without database key restrictions.
- Every metadata fact is optional; missing, `false`, zero and explicit `null` retain distinct meanings.
- Consumers decode recognized metadata keys; validated entity fields retain their top-level types.
- Projections supplies shared decoders for recognized facts, including historical absence or invalid
  values. Product reads return validated fields or JSON text, not arbitrary decoded Convex objects.
- Model/provider metadata contains their remaining facts directly. Endpoint metadata groups remaining
  facts under `endpoint`, `model` and `provider`, preserving ownership without source-key collisions.

### Indexes

| Index         | Purpose                                      |
| ------------- | -------------------------------------------- |
| `by_model_id` | Model identity lookup and ingestion upserts. |

## `currentProviders`

One row is the current or useful last-known projection of a provider.

### Schema

```ts
const currentProviders = defineTable({
  provider_id: v.string(),
  scan_at: v.string(),
  display_name: v.string(),
  metadata_json,
}).index('by_provider_id', ['provider_id'])
```

### Fields and invariants

| Field           | Meaning or constraint                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `provider_id`   | Native provider identity from [Scan extraction](scan.md#extraction); one cache row per provider. |
| `scan_at`       | Observation that last updated this row; unchanged observations leave it untouched.               |
| `display_name`  | Validated source `provider_info.displayName`.                                                    |
| `metadata_json` | Remaining projected provider facts under the [shared metadata contract](#metadata).              |

### Indexes

| Index            | Purpose                                         |
| ---------------- | ----------------------------------------------- |
| `by_provider_id` | Provider identity lookup and ingestion upserts. |

## `currentEndpoints`

One row is a hydrated current or last-known endpoint, including relationships, pricing and listing state.

### Schema

`pricing` uses the [Prices validator](series.md#endpointprices); `metadata_json` uses the contract above.

```ts
const currentEndpoints = defineTable({
  endpoint_id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
  provider_tag: v.string(),
  variant: v.string(),
  scan_at: v.string(),
  unlisted_at: v.optional(v.string()),
  model_display_name: v.string(),
  model_permaslug: v.string(),
  model_or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  provider_display_name: v.string(),
  pricing,
  metadata_json,
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_model_id', ['model_id'])
  .index('by_provider_id_and_model_id', ['provider_id', 'model_id'])
  .index('by_unlisted_at', ['unlisted_at'])
```

### Fields and invariants

| Field                                                          | Meaning or constraint                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `endpoint_id`                                                  | Native UUID; one cache row per endpoint.                                                 |
| `model_id`, `provider_id`                                      | Native model/provider relationships from the endpoint.                                   |
| `provider_tag`                                                 | Validated `provider_slug` accessor value; mutable endpoint data, not an identity.        |
| `variant`                                                      | Validated endpoint variant.                                                              |
| `scan_at`                                                      | Observation that last updated this row, including listing-state changes.                 |
| `unlisted_at`                                                  | Disappearance time from the listing transition; absent for a listed endpoint.            |
| `model_display_name`, `model_permaslug`, `model_or_created_at` | Typed facts from the related model at the hydrated context time.                         |
| `input_modalities`, `output_modalities`                        | Typed modality lists from the related model.                                             |
| `provider_display_name`                                        | Typed display name from the related provider.                                            |
| `pricing`                                                      | Selected directly from raw endpoint values using the shared Prices contract.             |
| `metadata_json`                                                | Remaining endpoint/model/provider facts under the [shared metadata contract](#metadata). |

Every endpoint has its required model/provider context. These fields stay top-level, typed and
required, including for last-known endpoints.

### Indexes

| Index                         | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `by_endpoint_id`              | Endpoint lookup and ingestion upserts.           |
| `by_model_id`                 | Model endpoint discovery.                        |
| `by_provider_id_and_model_id` | Provider/model discovery.                        |
| `by_unlisted_at`              | The grid's listed/recently-unlisted working set. |

## Hydration and last-known state

All three tables accumulate the output of the baseline and every subsequent forward ingestion:

- Project both scans through the shared lens, including endpoint model/provider context.
- Select changed product rows, ignoring `scan_at` when comparing values.
- Related model/provider changes update listed endpoints even when their own raw values are unchanged.
- Models/providers omitted from the later scan keep their stored rows.
- Disappearing endpoints retain the earlier scan's complete projection and gain `unlisted_at`.
- Reappearing endpoints receive their complete later projection, clearing `unlisted_at`.
- `scan_at` dates the observation that updated the row, matching V3's last-write meaning. An
  unlisting update dates the new availability information; its entity facts are last-known values.

**Example:** an endpoint last changes at A, its provider changes at B, and it disappears at C.
The update at C retains B's provider facts and records C as both `scan_at` and `unlisted_at`.

## Ingestion writes

Forward-only, connected ingestion makes the current tables the cumulative product of all preceding
ingestions. The main action already has the source pair and prepares only its changed product rows.

1. Populate all three current tables during baseline ingestion.
2. Prepare subsequent changes from the real scan pair, including related-entity changes and unlisting.
3. Run one mutation per current table: models, providers, then endpoints.
4. For each supplied row, look up its native identity and insert or replace the complete row.
5. Commit each table's writes and ingestion phase advancement together, including empty steps.

The final endpoint phase completes ingestion. Catalog has no separate runner, claim or lock field.
An interrupted run resumes its stored phase before a later pair is admitted. Catalog failure leaves
ingestion unfinished; committed table phases are skipped on retry.

Routine ingestion assumes the tables represent the preceding ingestions. Rebuilding after a
projection change, repairing an arbitrary state and processing out-of-order history are non-routine
operations to design when needed, not requirements of this write path.

## Product reads

Ordinary time windows use the [ORCA clock](ingestion.md#clock-reads). Current rows update per table
mutation and can expose mixed observation times while ingestion is in progress; they are not a
historical snapshot of the completed clock. Completion establishes that all table phases succeeded.

| Consumer      | Read behavior                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Grid          | Listed endpoints plus those unlisted within 30 days of the ORCA clock; browser filtering and sorting use that working set. |
| Overview/API  | Identity lookup, including available last-known facts and optional metadata.                                               |
| Discovery     | Native model/provider/endpoint identity lookups.                                                                           |
| History/stats | Compose cache reads with the [series modules](series.md#product-reads).                                                    |

The grid's query-time window leaves older last-known rows retained.

🚧 Use Records for historical inspection first. Add selected-time materializations when repeated
historical queries justify their own cache.
