# Series

Pricing and stats are append-only samples keyed to a scan. They are rebuildable from scan
artifacts. They are not the view.

## Common

- `scan_at` is the foreign key to the scan artifact and the value shown to users.
- Re-applying the same `scan_at` does not insert a second sample for the same key.
- No terminator row when an endpoint unlists. Chart gaps are deferred.
- Latest samples are not copied onto the endpoint view.
- 💤 How the data grid and public API read a current sample (join this series, or a later
  current-sample projection) is out of scope here.
- 💤 Retention / compaction is the volume knob and is not designed here.

## Stats

- Key: (`endpoint_id`, `scan_at`, `tier`).
- Built from `after` only. No compare.
- `statsByTier` is the source of truth. Each present tier becomes a row.
- Legacy payloads with `stats` and no `statsByTier` store that sample under tier `default`.
- Endpoints with no stats produce no row — a gap, not an explicit empty sample.
- `status` is not sampled here.
- Sample payload is the numeric fields of the upstream stats object, minus `endpoint_id`.

## Pricing

- Key: (`endpoint_id`, `scan_at`).
- Appended when the endpoint is created or the endpoint diff includes `pricing`.
- Unchanged pricing is not re-sampled.
- Named meters on the table match the usual rate fields (`prompt`, `completion`, `discount`,
  optional cache / image / audio / `web_search`).
- Extra meters such as `internal_reasoning` stay as catchall strings on the stored pricing
  object.
- `display_pricing` and `overrides` are stored on the pricing row when present.
- 🧭 Preserve upstream decimal strings. Do not coerce rates to numbers.
- Top-level `pricing_json`, `pricing_version_id`, and `tiers` remain on the endpoint source
  object in the artifact. Nested `tiers.*.display_pricing` is not copied onto this table.
