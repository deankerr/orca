# meps2

Design-in-code rewrite of the core backends components.

- Tables are prefixed with `meps2_`.
- Should not interact with code or data outside of the `meps2` directory.
- Slices may need to be partially built, and sit in an unintegrate state until other slices are ready.
- Nothing is locked in - we will continue to shift the interfaces, boundaries, and data structures until we find the right balance.
- Dev data does not need to be preserved. Now is the time to make breaking schema changes.

The current work deals closely with concepts documented in @docs/openrouter

## Design notes

Observation does not decide which upstream fields matter. Named identity is fixed; everything else from OpenRouter is kept as metadata so a new key is stored and compared without a schema change. App rendering, Monitor notifications, and an admin-only change stream are later filters on that record — not the observation contract. A field that appears on every model is a successful capture; whether it is worth a user-facing event is a downstream choice.

Workflow orchestration, exception handling etc, should remain simple and fail fast at this stage.

## Known Gaps

### Scan

- A single endpoint fetch failure fails the whole scan.
- A model whose list payload has `endpoint: null` is not fetched. That nested object is an observation signal only — it is not stored on the catalog model. Reconstruct “endpoints of model X” with `endpoint.model_id`.
- Last-write-wins on `model_id` / `endpoint_id` / `provider_id` follows observation order. File keys are sorted at serialize. Disagreeing copies of the same provider are not detected.

### Catalog files

- File encoding / storage optimizations are deferred until core systems are scaffolded. Current records and gzip envelopes are the base form.
- Observation timestamps are not hardened. Stats rows currently use the scan's `started_at`, even though endpoint fetches are staggered.

### Current-view projection

- `status`, `capacity_tpm`, and similar telemetry still live in endpoint metadata and dirty the view on purpose until skip lists are tuned (`projections/endpoints.ts`).
- Latest stats are not copied onto the endpoint view. The data grid and public API still need a later path (join history, or a "current sample" projection).
- Pricing-only endpoint diffs still upsert the endpoint view row. Turning that off is `VIEW_SKIP_KEYS` in `projections/endpoints.ts`.
- An empty view table rewrites every row from `after` without treating those rows as pricing creates. Pricing still follows the artifact baseline. Vanished endpoints are not in the latest file, so rewrite cannot stamp or restore them; replay-in-order can.
- Endpoints: catalog-absent stamps `unlisted_at` (scan timestamp) if unset; relist upserts omit it and clear it. Models and providers are retained unstamped. See `docs/orca/availability.md`.
- File-to-file compare only sees the transition scan. Endpoints that vanished while absences were skipped stay listed until replay. Incomplete `after` must not unlist — currently a failed scan stores no artifact.

### Stats

- Append-only, no comparison. Endpoints with no stats produce no row — a gap in the series, not an explicit empty sample.
- Base table only. Rebuildable from catalog files; not idempotent (re-applying the same scan would insert duplicate samples at the same timestamp).
- Retention / compaction is the real volume knob and is not implemented.
- Legacy observations have `stats` and no `statsByTier`; those are stored under tier `default`.
- `status` is not sampled here.

### Pricing

- Appended when an endpoint is created or when the IChange set includes `pricing`. Unchanged pricing is not re-sampled.
- Named meters on the pricing table are optional fields on the pricing object. Extra meters such as `internal_reasoning` stay on the file only (catchall strings).
- Top-level `display_pricing`, `tiers`, `pricing_json`, and `pricing_version_id` go through endpoint metadata. Nested objects/arrays that flattenMetadata cannot hold (`display_pricing`, `tiers`) are dropped; `pricing.display_pricing` is kept on the pricing object and table.
- Base table only. Rebuildable from catalog files; not idempotent.

### Workflow

- Exception handling is deferred. The artifact is stored before view/stats projection; if apply fails, the next succeeded run's baseline is the last succeeded artifact. Stats may be missing from the table until replayed from the file.
