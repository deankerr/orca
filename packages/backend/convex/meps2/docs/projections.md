# Projections

`projections` turns two Catalog maps into view writes and series appends. Compare is Map
against Map. This module does not load blobs, register identities, or advance the ingest
window.

## Interface

```ts
type Catalog = {
  models: Map<string, object> // key: model_id
  endpoints: Map<string, object> // key: upstream endpoint id
}

explode(bytes: Uint8Array): Catalog
compare(before: Catalog, after: Catalog): Diff
```

Apply is an action-local walk of the diff plus mutations that write **batches**. The
mutations take `scan_at` and row payloads. They do not take workflow ids, `before` artifact
ids, or ingest window fields.

## Explode

Deserialize JSONL into two maps. The same function is used for `before` and `after`.

- Each line: the `model` payload keyed by row `model_id`; each endpoints-array element
  keyed by its `id`.
- Attach ORCA identity when exploding an endpoint: `model_id` and `variant` from the parent
  row. Do not invent those fields inside the stored file.
- `endpoints: null` contributes the model and zero endpoints.
- `endpoints: []` contributes the model and zero endpoints. Same map effect as `null`;
  the distinction stayed in the file.
- Duplicate `model_id` or endpoint `id` in one file: last line wins. Produce does not
  reject this.
- 🧭 Apply the modality filter to both maps with the same function. A filter change must
  not look like a mass unlist.
- Drop model rows whose `input_modalities` and `output_modalities` do not both include
  `text`.
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

Empty `before` (first ingest, or a caller that passed empty maps): every `after` entity is
a create. That is not a pricing create storm; pricing still follows compare against empty
maps (every `after` endpoint with pricing is a create).

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

## View writes

The view is a catch-all projection of the source-shaped diff. It is not the change
announcement surface.

- 🧭 A new upstream field, or a change to a field the app does not render, still upserts
  the view. That is the point: upstream schema can move without a meps2 schema change.
- Change events (Monitor, alerts) are a later filter on the record. A view upsert is not
  an announcement.

### Empty views

If a view table has no rows, rewrite every `after` entity as an upsert.

- Rewrite is not a set of pricing creates. Pricing still follows the artifact-to-artifact
  baseline passed in as `before`.
- Rewrite does not unlist. Vanished endpoints are not in `after`; replay-in-order stamps
  them.
- 🧭 Incomplete `after` must not unlist. A stored scan artifact is a complete observation.

### Write mutations

Each mutation is one chunk. It receives `scan_at` plus arrays of planned writes. It does
not query `ingest` and does not patch the ingest window.

**Model upsert.** `by_model_id` `.unique()`. Insert, or patch every field including
`scan_at`. Catalog-absent models are not deleted and not unlisted.

**Endpoint upsert.** `by_endpoint_id` `.unique()`. Insert, or patch fields including
`scan_at`. If `unlisted_at` is set, clear it. Do not restamp an already-listed row's
`unlisted_at`.

**Endpoint unlist.** `by_endpoint_id` `.unique()`. If no row, skip. If `unlisted_at` is
already set, skip (do not restamp). Else patch `unlisted_at: scan_at` and `scan_at`.

**Provider upsert.** `by_provider_id` `.unique()`. Insert, or patch including `scan_at`.
Last-write-wins inside one chunk if the same slug appears twice. Catalog-absent providers
are not deleted.

Stamp `scan_at` on every view write (upsert, unlist, empty-view rewrite).

Chunk so one mutation stays inside Convex transaction limits. The apply action walks the
diff and submits chunks in sequence. An exception stops the walk. Already-committed chunks
stay. Replay of the same `after.scan_at` upserts to the same keys.

## Series writes

See [`series.md`](series.md). Mutations:

**Pricing insert.** `by_endpoint_scan_at` `.unique()` on `['endpoint_id', 'scan_at']`. If a
row exists, skip. Else insert. Never patch a pricing row.

**Stats insert.** `by_endpoint_scan_at` `.unique()` on `['endpoint_id', 'scan_at', 'tier']`.
If a row exists, skip. Else insert. Never patch a stats row.

- 🧭 Re-applying the same `scan_at` does not insert a second sample for the same key.
- Stats come from `after` only. No compare.
- Pricing inserts on create or a `pricing` diff. Unchanged pricing is not re-sampled.

## What this module does not do

- It does not call `artifacts.load`. The caller passes bytes into `explode`, or maps into
  `compare` / apply.
- It does not call `ingest.markIngested`. Window advance is a separate mutation after apply
  returns.
- ❓ Apply of an older-than-earliest artifact (reverse-time unlist of the current view) is
  not specified. Do not add a `mode` argument until that rule exists.
