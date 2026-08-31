# Scan

The `scan` workflow fetches OpenRouter and writes one scan artifact. Failures fail the run.
There is no partial artifact.

## Observation time

- Assign `scan_at` at the start of the attempt, before the first request.
- Every row in the file uses that value.
- Do not record when individual endpoint pages returned.

## Fetch

1. `GET /api/frontend/v1/catalog/models`.
2. Drop models whose `slug` starts with `~`. Their endpoint pages 404 and would fail the scan.
3. For each remaining model whose nested `endpoint` is non-null, `GET /api/frontend/v1/stats/endpoint?permaslug={permaslug}&variant={variant}`.
4. A model whose nested `endpoint` is `null` is stored with `endpoints: null`. It is not fetched.
5. Write the scan artifact. See [`scan-artifact.md`](scan-artifact.md).

- 🧭 Nested `endpoint` on the catalog model is a fetch signal only. It is not stored on the
  model payload.
- 🧭 Any fetch error fails the scan. No artifact is stored.
- 🧭 Partial scans are never stored. `after` is always a complete observation or it does not
  exist.
- 🧭 An endpoint page that returns an empty array is a failed scan, not `endpoints: []`.
- A 404 on a non-`~` endpoint page is an error like any other. Concurrent fetches make that
  outcome rare; rarity is not a reason to store a partial file.
- Modality is not a scan filter. Image-only and other non-text models are stored.

## Membership

- `~` aliases never enter the artifact.
- Text-in/text-out filtering happens in `projections`, not here.
- Reconstruct “endpoints of model X” from the model's row, not from a nested copy.

## Output

- Store as path `scan`, artifact id `scan.{scan_at}.jsonl`.
- The run records that `artifact_id` after a successful store.
- Apply is a later step of the same run. See [`runs.md`](runs.md).
