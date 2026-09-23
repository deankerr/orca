# Catalog

Owns current/last-known MEP caches, their shared refresh and product-facing reads.

## `currentModels`

One row is the current or useful last-known projection of a model.

### Schema

Validated entity fields are top-level fields on their owning current table, using the existing
projection names where applicable. `metadata` contains the remaining projected facts and shares a
container validator across all three tables.

```ts
const metadata = v.record(v.string(), v.any())

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
  metadata,
}).index('by_model_id', ['model_id'])
```

### Fields and invariants

| Field                                   | Meaning or constraint                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `model_id`                              | Model identity from the scan entry, including its variant suffix; one cache row per model.        |
| `scan_at`                               | Hydrated source-context time under the [shared hydration rules](#hydration-and-last-known-state). |
| `slug`                                  | Source model's base slug, retained separately from the variant-aware `model_id`.                  |
| `permaslug`                             | Source model's versioned identifier.                                                              |
| `variant`                               | Validated model variant supplied by the scan entry.                                               |
| `display_name`                          | Source `short_name`.                                                                              |
| `or_created_at`                         | Source `created_at`, distinct from observation time.                                              |
| `input_modalities`, `output_modalities` | Validated source modality lists.                                                                  |
| `metadata`                              | Remaining projected model facts under the metadata contract below.                                |

### Metadata

The same contract applies to model, provider and endpoint metadata:

- Additional capabilities, limits, policies and other facts not represented by typed entity fields live here.
- Keys are storage-safe; Projections validates native facts and defines recognized meanings.
- Every metadata fact is optional; missing, `false`, zero and explicit `null` retain distinct meanings.
- Consumers decode recognized metadata keys; validated entity fields retain their top-level types.
- Exact value shapes and field retention remain an [open projection question](projections.md#projection-fidelity).

### Indexes

| Index         | Purpose                                           |
| ------------- | ------------------------------------------------- |
| `by_model_id` | Model identity lookup and refresh reconciliation. |

## `currentProviders`

One row is the current or useful last-known projection of a provider.

### Schema

```ts
const currentProviders = defineTable({
  provider_id: v.string(),
  scan_at: v.string(),
  display_name: v.string(),
  metadata,
}).index('by_provider_id', ['provider_id'])
```

### Fields and invariants

| Field          | Meaning or constraint                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `provider_id`  | Native provider identity from [Records' extraction](records.md#retained-payload); one cache row per provider. |
| `scan_at`      | Hydrated source-context time under the [shared hydration rules](#hydration-and-last-known-state).             |
| `display_name` | Validated source `provider_info.displayName`.                                                                 |
| `metadata`     | Remaining projected provider facts under the [shared metadata contract](#metadata).                           |

### Indexes

| Index            | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `by_provider_id` | Provider identity lookup and refresh reconciliation. |

## `currentEndpoints`

One row is a hydrated current or last-known endpoint, including relationships, pricing and listing state.

### Schema

`pricing` uses the [Prices validator](series.md#endpointprices); `metadata` uses the contract above.

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
  metadata,
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
| `scan_at`                                                      | Hydrated source-context time, which can differ from the refresh target.                  |
| `unlisted_at`                                                  | Disappearance time from the listing transition; absent for a listed endpoint.            |
| `model_display_name`, `model_permaslug`, `model_or_created_at` | Typed facts from the related model at the hydrated context time.                         |
| `input_modalities`, `output_modalities`                        | Typed modality lists from the related model.                                             |
| `provider_display_name`                                        | Typed display name from the related provider.                                            |
| `pricing`                                                      | Selected directly from raw endpoint values using the shared Prices contract.             |
| `metadata`                                                     | Remaining endpoint/model/provider facts under the [shared metadata contract](#metadata). |

Every endpoint has its required model/provider context. These fields stay top-level, typed and
required, including for last-known endpoints.

### Indexes

| Index                         | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `by_endpoint_id`              | Endpoint lookup and refresh reconciliation.      |
| `by_model_id`                 | Model endpoint discovery.                        |
| `by_provider_id_and_model_id` | Provider/model discovery.                        |
| `by_unlisted_at`              | The grid's listed/recently-unlisted working set. |

## Hydration and last-known state

All three tables are cumulative, mutable projections of retained history:

- A row can combine facts supplied by several ingestions; `scan_at` describes source context, rather
  than an ingestion that owns the row.
- Retain known models and providers even when they have no listed endpoints, following
  [Records' entity-knowledge policy](records.md#entity-knowledge-and-availability).
- Retain last-known endpoint values after unlisting.
- Hydrate an absent endpoint at its last listed context, including related entities resolved then.
- Apply current [Projections](projections.md#hydration-and-comparison) to the available context.
- Resolve listing context through [Listings](series.md#endpointlistings).

**Example:** an endpoint last changes at A, its provider changes at B, and it disappears at C.
Last-known endpoint hydration includes B's provider facts, even though its own raw revision is at A.

## Refresh

One operation handles forward updates, cold rebuilds, projection changes and interrupted refreshes.

### Contract

- Produce the complete desired projection through the selected completed time and current code.
- Start from any cache state: empty, stale, partially written or previously projected.
- Derive correctness from retained Records and required series; existing cache rows offer optional
  acceleration only.
- Partial source coverage remains partial after rebuilding. Historical series stay intact.
- Use the [shared claim protocol](ingestion.md#downstream-concurrency) whether called directly from
  an ingestion action or by an independent runner.

### Steps

1. Claim the latest completed ingestion and pin its `scan_at` as target T.
2. Use [Records' identity discovery](records.md#identity-discovery) to enumerate all retained MEPs.
3. Hydrate and project the complete desired contents of all three tables through T.
4. Reconcile rows by native identity using the write rules below.
5. Finish after all three caches and cleanup complete, using the [request handoff](#refresh-requests).

Discovery, hydration, writes and cleanup use bounded batches. A later forward ingestion can complete
while this run remains pinned to T.

### Write rules

| Existing row versus desired result | Action                                           |
| ---------------------------------- | ------------------------------------------------ |
| Missing                            | Insert the desired row.                          |
| Different                          | Replace the full row, clearing obsolete facts.   |
| Equal                              | Leave untouched, avoiding reactive invalidation. |
| Outside the complete desired set   | Delete the cache-only row.                       |

- Compare stored content, excluding Convex system fields.
- Absence from one batch is insufficient grounds for deletion.

### Completion and retry

- Convex mutations provide transaction boundaries; a batched run can expose mixed freshness.
- Interruption can leave partial cache updates. Restart derives the desired result again and repairs
  them independently of the previous cache state.
- Cache failure leaves the source ingestion complete.
- The process outcome records the run against its anchor; only that ingestion receives the outcome.

🚧 Add durable refresh cursors only if restart cost justifies them.

🚧 Add ingestion-assisted deltas when caches reliably represent a compatible starting projection.
Include model/provider dependants and keep the full-refresh fallback. Extra discovery indexes or an
identity inventory follow measured read costs.

🚧 Whole-catalog publication can follow a product requirement: stage a generation and switch its
selected pointer. The starting design uses no generations, build history or `discarded` state.

## Refresh requests

| Situation                                  | Behavior                                         |
| ------------------------------------------ | ------------------------------------------------ |
| Ingestion completes                        | Request refresh.                                 |
| Several requests accumulate                | Coalesce onto the latest completed ingestion.    |
| Request arrives during refresh             | Let the active run finish its pinned target.     |
| Refresh finishes with newer completed work | Request the next refresh in the finish mutation. |
| Forward ingestion remains active at finish | Its completion supplies the next request.        |

**Finish commit:** record the outcome, release the claim and perform the request handoff together.
Intermediate ingestions can be skipped; they incur no per-ingestion Catalog obligation.

## Product reads

Ordinary cutoffs use the [ORCA clock](ingestion.md#clock-reads), including during mixed-freshness
refreshes. Cache rows retain their own context times.

| Consumer      | Read behavior                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Grid          | Listed endpoints plus those unlisted within 30 days of the ORCA clock; browser filtering and sorting use that working set. |
| Overview/API  | Identity lookup, including available last-known facts and optional metadata.                                               |
| Discovery     | Native model/provider/endpoint identity lookups.                                                                           |
| History/stats | Compose cache reads with the [series modules](series.md#product-reads).                                                    |

The grid's query-time window leaves older last-known rows retained.

🚧 Use Records for historical inspection first. Add selected-time materializations when repeated
historical queries justify their own cache.
