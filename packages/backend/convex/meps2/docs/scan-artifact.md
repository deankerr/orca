# Scan artifact

A scan artifact is newline-delimited JSON. There is no envelope, no header row, and no `kind`.
The filename and the row shape are the spec.

## Bytes

- UTF-8 JSONL. Each line is one JSON object. The file ends with a newline.
- No pretty-print.
- Rows sorted by `model_id`.
- `endpoints` arrays sorted by upstream endpoint `id`.
- Nested object key order is not a contract. Compare and views read properties, not
  serialization order.
- Encode and parse share `scanArtifactRowSchema`. `scan` encodes. `projections` explode
  parses.

## Row

Every line is a model group. Validated by `scanArtifactRowSchema`:

```ts
type ScanArtifactRow = {
  scan_at: string // ISO UTC, same value on every row
  model_id: string
  variant: string
  model: {
    slug: string
    permaslug: string
    input_modalities: string[]
    output_modalities: string[]
    created_at: string
    name: string
    author_display_name: string
    // remaining catalog fields, extra keys kept
  }
  endpoints:
    | {
        id: string
        provider_slug: string
        provider_info: { slug: string; displayName: string }
        pricing?: { prompt: string; completion: string; discount: number } | null
        // remaining stats-page fields, extra keys kept
      }[]
    | null
}
```

- `scan_at` — identity of this scan. See [`identity.md`](identity.md).
- `model_id` — ORCA model key: nested catalog `endpoint.model_variant_slug` when that object
  existed, otherwise `slug`.
- `variant` — nested catalog `endpoint.variant` when that object existed, otherwise `standard`.
- `model` — the catalog model record with `endpoint` removed. Upstream field names unchanged.
  Identity, modality, and view identity fields (`created_at`, `name`,
  `author_display_name`) are required; everything else is kept.
- `endpoints` — the stats-page array with each element's nested `model` removed, or `null`.
  Each element requires `id`, `provider_slug`, and `provider_info.{slug,displayName}`.
  `pricing` is optional.

```json
{
  "scan_at": "2026-08-30T15:00:21.215Z",
  "model_id": "anthropic/claude-sonnet-4.6",
  "variant": "standard",
  "model": { "slug": "anthropic/claude-sonnet-4.6", "permaslug": "anthropic/claude-sonnet-4.6" },
  "endpoints": [
    {
      "id": "01234567-89ab-cdef-0123-456789abcdef",
      "model_variant_slug": "anthropic/claude-sonnet-4.6",
      "variant": "standard"
    }
  ]
}
```

Payloads keep the rest of the upstream fields. This example is identity only.

## `endpoints`

- `null` — catalog nested `endpoint` was `null`. The stats page was not queried.
- an array — the stats page returned these endpoints, possibly empty.
- 🧭 Do not omit the `endpoints` key.
- ⚠️ `null` is not “this model has no providers.” It is “we did not look.”
- ⚠️ `[]` is “we looked, and the page was empty.” It is not `null`.

## What is not in the file

- No extracted provider rows. `provider_info` stays on each endpoint.
- No flattened metadata bag. Nested objects stay nested. Nulls stay null.
- No `kind`. Every line is the same shape.
- No copy of `model_id` onto each endpoint. The join key is the row. Endpoints keep
  `model_variant_slug`.
- ⚠️ Nested `model` on an endpoint is the standard-variant catalog record, often with the
  wrong `name`, and it embeds another endpoint (stats included). It is discarded.
- ⚠️ Nested `endpoint` on a catalog model is a denormalized top endpoint, not the model's
  inventory. It is discarded after `model_id` / `variant` are copied onto the row.

## Identity on the row

- `model_id` + `variant` live on the envelope because the nested catalog `endpoint` that held
  them is not stored.
- 🧭 Do not parse variant from a `:suffix` on `model_id`.
- Models with `endpoints: null` still have `variant` (typically `standard`).
