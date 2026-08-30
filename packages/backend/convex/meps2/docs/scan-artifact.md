# Scan artifact

A scan artifact is newline-delimited JSON. There is no envelope, no header row, and no `kind`.
The filename and the row shape are the spec.

## Bytes

- UTF-8 JSONL. Each line is one JSON object. The file ends with a newline.
- No pretty-print.
- Uncompressed bytes are what `content_sha256` hashes.
- Rows sorted by `model_id`.
- `endpoints` arrays sorted by upstream endpoint `id`.
- 🧭 Duplicate `model_id` across rows, or duplicate endpoint `id` in the file, is a failed
  scan. The file is not stored.
- Envelope keys are written in this order: `scan_at`, `model_id`, `variant`, `model`, `endpoints`.
- Nested object key order is left as received from the source. We do not recursively sort keys.

## Row

Every line is a model group:

```ts
type ScanArtifactRow = {
  scan_at: string // ISO UTC, same value on every row
  model_id: string
  variant: string
  model: object // catalog model, nested endpoint removed
  endpoints: object[] | null // stats-page endpoints, nested model removed
}
```

- `scan_at` — identity of this scan. See [`identity.md`](identity.md).
- `model_id` — ORCA model key: nested catalog `endpoint.model_variant_slug` when that object
  existed, otherwise `slug`.
- `variant` — nested catalog `endpoint.variant` when that object existed, otherwise `standard`.
- `model` — the catalog model record with `endpoint` removed. Upstream field names unchanged.
- `endpoints` — the stats-page array with each element's nested `model` removed, or `null`.

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
- a non-empty array — the stats page returned these endpoints.
- 🧭 `[]` is not a stored state. An empty stats page fails the scan.
- 🧭 Do not omit the `endpoints` key.
- ⚠️ `null` is not “this model has no providers.” It is “we did not look.”

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
