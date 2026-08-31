# Scan

`scan` fetches OpenRouter and serializes one scan artifact. It does not persist. Failures
throw; there is no partial artifact.

## Observation time

- The caller assigns `scan_at` and passes it in, before the first request.
- Every row in the file uses that value.
- Do not record when individual endpoint pages returned.
- 🧭 `scan` does not mint `scan_at` on retry. See [`identity.md`](identity.md).

## Fetch

1. `GET /api/frontend/v1/catalog/models`.
2. Drop models whose `slug` starts with `~`. Their endpoint pages 404.
3. For each remaining model whose nested `endpoint` is non-null, `GET /api/frontend/v1/stats/endpoint?permaslug={permaslug}&variant={variant}`.
4. A model whose nested `endpoint` is `null` is serialized with `endpoints: null`. It is
   not fetched.
5. Return uncompressed JSONL bytes and the scan artifact identity. See
   [`scan-artifact.md`](scan-artifact.md).

- 🧭 Nested `endpoint` on the catalog model is a fetch signal only. It is not stored on the
  model payload.
- 🧭 Any fetch error fails the scan. No bytes are returned. `up-fetch` errors propagate
  unchanged.
- 🧭 Partial scans are never returned.
- An empty stats page is serialized as `endpoints: []`.
- A 404 on a non-`~` endpoint page is an error like any other.
- Modality is not a scan filter. Image-only and other non-text models are stored.
- Missing fields needed to fetch or write a row (`slug`, `permaslug`, nested
  `model_variant_slug` / `variant`) throw `ConvexError`.

## Membership

- `~` aliases never enter the artifact.
- Text-in/text-out filtering happens in `projections`, not here.
- Reconstruct “endpoints of model X” from the model's row, not from a nested copy.

## Output

```ts
scan({ scan_at: string }): Promise<{
  path: 'scan'
  artifact_id: string // scan.{scan_at}.jsonl
  scan_at: string
  bytes: Uint8Array // uncompressed UTF-8 JSONL
}>
```

- 🧭 `scan` does not call `artifacts.store`, `ingest.register`, or `projections`.
- Duplicate `model_id` or endpoint `id` in the file is not rejected here.
