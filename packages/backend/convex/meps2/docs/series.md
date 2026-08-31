# Series

Pricing and stats are append-only samples keyed to a scan. They are rebuildable from scan
artifacts. They are not the view.

## Common

- `scan_at` is the foreign key to the scan artifact and the value shown to users.
- Re-applying the same `scan_at` does not insert a second sample for the same key.
- No terminator row when an endpoint unlists. Chart gaps are deferred.
- Latest samples are not copied onto the endpoint view.
- 🧭 Insert mutations look up the unique key first. If a row exists, they return without
  writing. They never patch an existing sample.
- 💤 How the data grid and public API read a current sample (join this series, or a later
  current-sample projection) is out of scope here.
- 💤 Retention / compaction is the volume knob and is not designed here.

## Stats

- Key: (`endpoint_id`, `scan_at`, `tier`).
- Index `by_endpoint_scan_at` on `['endpoint_id', 'scan_at', 'tier']`. Lookups use
  `.unique()`.
- Index `by_scan_at` on `['scan_at']` for per-scan maintenance, not for compare.
- Built from `after` only. No compare.
- `statsByTier` is the source of truth. Each present tier becomes a row.
- Legacy payloads with `stats` and no `statsByTier` store that sample under tier `default`.
- Endpoints with no stats produce no row — a gap, not an explicit empty sample.
- `status` is not sampled here.
- Sample payload is the numeric fields of the upstream stats object, minus `endpoint_id`.

## Pricing

- Key: (`endpoint_id`, `scan_at`).
- Index `by_endpoint_scan_at` on `['endpoint_id', 'scan_at']`. Lookups use `.unique()`.
- Index `by_scan_at` on `['scan_at']` for per-scan maintenance, not for compare.
- Appended when the endpoint is created or the endpoint diff includes `pricing`.
- Unchanged pricing is not re-sampled.
- Named meters are first-class columns: `prompt`, `completion`, `discount`, optional
  cache / image / audio / `web_search`, plus `internal_reasoning`, `image_token`,
  `audio_output` when present.
- 🧭 Unknown extra meters are dropped at write. Same lossiness as the view metadata bag.
  A new named column is a schema change; there is no catchall on the row.
- `display_pricing` and `overrides` are stored on the pricing row when present.
- 🧭 Preserve upstream decimal strings. Do not coerce rates to numbers.
- Top-level `pricing_json`, `pricing_version_id`, and `tiers` remain on the endpoint source
  object in the artifact. Nested `tiers.*.display_pricing` is not copied onto this table.
