# Views

View tables are the current catalog as of applied scans. They are not the archive. Product
listing rules live in `docs/orca/availability.md`; this note is the meps2 shape those rules
use.

## Common

- Rows are upserted by entity id (`model_id`, endpoint UUID, `provider_id`).
- `scan_at` on a view row is the scan that last **wrote** it (diff upsert, unlist, or empty
  view rewrite).
- ⚠️ `scan_at` is not “this entity was seen in the latest applied scan.” A quiet hour leaves
  the previous `scan_at` in place.
- There is no `updated_at`.
- Named identity fields are first-class columns. Remaining source fields are flattened into
  a `metadata` bag at write time.
- ⚠️ Flattening is lossy for nested objects and non-string arrays the bag cannot hold. Those
  values remain on the scan artifact and, for pricing, on the series table. They are not on
  the view row.

## Models

- Key: `model_id`.
- Also stored: `variant`, `permaslug`, `input_modalities`, `output_modalities`,
  `or_created_at` (OpenRouter `created_at`), `display_name` (OpenRouter `name`),
  `author_display_name`, `metadata`.
- Catalog-absent models are retained and unstamped. No `unlisted_at`.

## Endpoints

- Key: `endpoint_id` (upstream `id`).
- Also stored: `model_id`, `variant`, `provider_tag` (upstream `provider_slug`), `provider_id`
  (upstream `provider_info.slug`), `metadata`.
- `unlisted_at` is optional `scan_at`.
  - Unset — listed in the latest complete applied scan.
  - Set — start of **this** absence (the scan that first observed it gone).
  - Cleared by the upsert that restores the row.
  - Later scans do not restamp an already-unlisted row.
- 🧭 Incomplete `after` must not set `unlisted_at`. Scan never stores a partial artifact.
- `disabled` is an upstream field and a different state. It is not unlist.

## Providers

- Derived from `endpoint.provider_info` while exploding `after`.
- Key: `provider_id` (`provider_info.slug`).
- Also stored: `display_name` (`provider_info.displayName`), `metadata`.
- Last-write-wins when copies of the same slug disagree inside one scan. The artifact keeps
  every copy; the view does not. Disagreements are not detected.
- Catalog-absent providers are retained and unstamped.
- 💤 Provider identity (record slug vs organization `name`) is unresolved and out of scope
  for this view.

## Signal

- Adjacent complete artifacts: previous file has the id, this file does not.
- Return is “not in `before`, in `after`” against a retained view row.
- History of list/unlist flips is not stored on the view. That belongs to a later change
  stream.
