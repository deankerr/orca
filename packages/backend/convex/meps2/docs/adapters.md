# Adapters

Anything that becomes a scan artifact implements the same row contract
([`scan-artifact.md`](scan-artifact.md)). Live `scan` is one producer. Historical archives
are another. Adapters do not store, register, or apply.

## Contract

An adapter yields `ScanArtifactRow` values for one `scan_at`, then the same JSONL bytes and
identity `scan` would return.

- Strip nested catalog `endpoint` from each model after copying `model_id` and `variant`.
- Strip nested `model` from each endpoint.
- Preserve upstream field names and nulls on the payloads.
- Do not flatten metadata.
- Do not extract providers.
- Do not apply the text-modality filter. That belongs to `projections`.
- Drop `~` slugs if the source still contains them.
- 🧭 `scan_at` comes from the source observation (`crawl_at` for `model-endpoints-v1`), not
  from `Date.now()`.

## Live scan

`scan` fetches OpenRouter and writes rows directly. It is not a conversion of some other file.

## `model-endpoints-v1`

Grouped entries `{ model_id, variant, model, endpoints }` with embeddings already stripped.

- `scan_at` is the bundle's `crawl_at` ISO string.
- Drop `bundle_format`, `crawl_id`, and the outer `data` array wrapper.
- Row payloads are otherwise the entries as stored.

## Raw crawl archives

A raw crawl still has nested copies and extra collections.

- Drop `~` slugs.
- Drop nested `endpoint` from each model after copying identity onto the row.
- Drop nested `model` from each endpoint.
- A nested catalog `endpoint` of `null` becomes `endpoints: null`.
- A missing or error endpoint page is not a scan artifact. That source observation is
  unusable as `after`.
- 💤 Deprecated crawl collections (`uptimes`, `apps`, `analytics`, top-level `providers`)
  are not copied.

## Backfill

Dev meps2 artifacts are wiped, not converted.

- A converted archive is stored and registered like any other scan artifact. `ingest`
  refuses a `scan_at` strictly inside the ingested window. See [`ingest.md`](ingest.md).
- 🧭 Feed nearest-older-first when the window is already non-empty: the predecessor of
  earliest ingested, then the next predecessor. Registering the oldest first makes every
  intervening `scan_at` interior.
- ❓ When and in what order production crawl archives are rewritten into scan artifacts
  stays open until the first adapter iteration exists. The adapter contract is the seam
  that lets that happen without changing `projections`.
