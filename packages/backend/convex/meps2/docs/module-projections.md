# Module: Projections

Turns two Catalog maps into view writes and series appends. The caller passes bytes
or maps. Window advance is a separate mutation after apply.

## Explode / compare

JSONL → maps keyed by `model_id` / endpoint `id`. Same explode for `before` and
`after`. Keep models whose `input_modalities` and `output_modalities` both include
`text`; drop their endpoints with them.

- ⚠️ Same filter function on both maps. A filter change must not look like a mass
  unlist.

Compare is a skip-aware id diff on source-shaped objects. Skip `stats`,
`statsByTier`, and model `updated_at`. Keep `status`, `capacity_tpm`, and
`pricing`. Unordered string arrays compare as sets.

Providers are derived from `endpoint.provider_info` at apply. Last-write-wins per
slug inside a scan.

## Views

Current catalog. Listing is `unlisted_at`.

- ⚠️ View `scan_at` is last write. A quiet hour leaves the previous stamp.
- Named identity columns plus a `metadata` bag. Flattening is lossy for nested
  objects and non-string arrays; those values stay on the artifact (and pricing
  extras on the series row).
- Catch-all: a new or unrendered field still upserts. Change event streams are a
  later filter on compare's `IChange` items, not on the view row.
- Empty view: rewrite every `after` entity as upsert. Pricing still follows the
  artifact `before`. Rewrite does not unlist.
- Convex `replace` (not `patch`) clears `unlisted_at` on restore.
- 💤 Provider identity (record slug vs organization `name`) is out of scope.

## Series

Append-only samples, rebuildable from artifacts. Unique key is idempotency.

- Stats from `after` only (`statsByTier`; legacy `stats` → tier `default`).
- Pricing on create or a `pricing` diff. Unchanged pricing is not re-sampled.
- Preserve upstream decimal strings. Unknown extra meters are dropped.
- 💤 Current-sample read path, retention, and chart-gap terminators are out of
  scope.
