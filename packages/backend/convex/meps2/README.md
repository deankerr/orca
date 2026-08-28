# meps2

Core backend rewrite components. Designing in code. They do not need to fit together all at once. Nothing is locked in - we will continue to shift the interfaces and boundaries until we find the best balance.

## Notes

- Deferred:
  - Change Events
  - Availability
  - Workflow exception handling

## Known Gaps

### Scan

- A single endpoint fetch failure fails the whole scan.
- A successful empty endpoint list is an empty Map, not `null`. `null` means the model had no top endpoint.
- Last-write-wins on `model_id` / `endpoint_id` / `provider_id` is sorted for determinism. Disagreeing copies of the same provider are not detected.

### Catalog files

- File encoding / storage optimizations are deferred until core systems are scaffolded. Current records and gzip envelopes are the base form.
- Observation timestamps are not hardened. Stats rows currently use the scan's `started_at`, even though endpoint fetches are staggered.

### Current-view projection

- `status`, `capacity_tpm`, and similar telemetry still live in endpoint metadata and dirty the view on purpose until skip lists are tuned.
- Latest stats are not copied onto the endpoint view. The data grid and public API still need a later path (join history, or a "current sample" projection).
- Pricing-only endpoint diffs still upsert the endpoint view row. Later we can isolate the IChange set so the view is skipped when only `pricing` moved.

### Stats

- Append-only, no comparison. Endpoints with no stats produce no row — a gap in the series, not an explicit empty sample.
- Base table only. Rebuildable from catalog files; not idempotent (re-applying the same scan would insert duplicate samples at the same timestamp).
- Retention / compaction is the real volume knob and is not implemented.
- Legacy observations have `stats` and no `statsByTier`; those are stored under tier `default`.
- `status` is not sampled here.

### Pricing

- Appended when an endpoint is created or when the IChange set includes `pricing`. Unchanged pricing is not re-sampled.
- Meters are extra string keys on the pricing object (validated there, not yet a record on the table). Named table columns are a subset; extra meters such as `internal_reasoning` stay on the file only.
- Top-level `display_pricing`, `tiers`, `pricing_json`, and `pricing_version_id` go through endpoint metadata. Nested objects/arrays that flattenMetadata cannot hold (`display_pricing`, `tiers`) are dropped; `pricing.display_pricing` is kept on the pricing object and table.
- Base table only. Rebuildable from catalog files; not idempotent.

### Workflow

- Exception handling is deferred. The artifact is stored before view/stats projection; if apply fails, the next succeeded run's baseline is the last succeeded artifact. Stats may be missing from the table until replayed from the file.
