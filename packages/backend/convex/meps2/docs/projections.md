# Projections

`projections` turns two scan artifacts into view writes and series appends. Compare is Map
against Map. Mutation for the view tables happens at write time, not in the file.

## Input maps

Deserialize each artifact into two maps. The same function is used for `before` and `after`.

```ts
type Catalog = {
  models: Map<string, object> // key: model_id
  endpoints: Map<string, object> // key: upstream endpoint id
}
```

- Explode each JSONL row: the `model` payload keyed by row `model_id`; each endpoints-array
  element keyed by its `id`.
- Attach ORCA identity when exploding an endpoint: `model_id` and `variant` from the parent
  row. Do not invent those fields inside the stored file.
- `endpoints: null` contributes the model and zero endpoints.
- 🧭 Apply the modality filter to both maps with the same function. A filter change must not
  look like a mass unlist.
- Drop model rows whose `input_modalities` and `output_modalities` do not both include `text`.
- Drop endpoints whose `model_id` was dropped by that filter.
- Providers are not a third input map. They are derived from `endpoint.provider_info` at
  apply time. See [`views.md`](views.md).

## Compare

`projections/compare` diffs `before` and `after` by id.

- Create: in `after`, not in `before`.
- Absent: in `before`, not in `after`.
- Update: in both, and the skip-aware diff is non-empty.

Compare runs on source-shaped objects (nested fields intact). Flattening is a view-write
concern.

## View writes

The view is a catch-all projection of the source-shaped diff. It is not the change
announcement surface.

- 🧭 A new upstream field, or a change to a field the app does not render, still upserts
  the view. That is the point: upstream schema can move without a meps2 schema change.
- Change events (Monitor, alerts) are a later filter on the record. A view upsert is not
  an announcement.
- Extra view writes from unrendered or newly appeared fields are the cost of that
  flexibility, not a correctness bug.

## Skip lists

Skip lists are an efficiency knob on compare. They do not decide which fields matter.

- Skipping a field avoids a view write when only that field moved. It does not drop the
  field from the artifact.
- `stats` and `statsByTier` are skipped on the endpoint view. They are sampled onto the
  stats series from `after` every scan; a view write would fire on every endpoint every
  hour.
- OpenRouter model `updated_at` is skipped. 🔄 It moves without a meaningful model change.
- Known noisy endpoint fields that can be skipped the same way: `status`, `capacity_tpm`.
  Skipping them is optional.
- Pricing-only diffs still upsert the endpoint view. Skipping `pricing` on the view is the
  same optional efficiency; the pricing series still appends on create or a `pricing` diff.
- Unchanged pricing is not re-sampled.

## Empty views

If a view table has no rows, `projections/apply` rewrites every `after` entity as an upsert.

- Rewrite is not a set of pricing creates. Pricing still follows the artifact-to-artifact
  baseline.
- Rewrite does not unlist. Vanished endpoints are not in `after`; replay-in-order stamps them.
- 🧭 Incomplete `after` must not unlist. Scan never stores a partial artifact, so a stored
  `after` is complete.

## Apply

`projections/apply` writes in chunks.

- Views: upsert / unlist as planned. Stamp `scan_at` on each write.
- Pricing: append on create or pricing change. See [`series.md`](series.md).
- Stats: append every sample present on `after` endpoints. No compare.
- Orchestration fail-fast still applies: an apply exception fails the run. The artifact
  remains. See [`runs.md`](runs.md).
