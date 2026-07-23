# Current System — Analysis & Statistics

Measured July 2026 against the live deployment and two sample bundles 12 hours apart
(see `packages/processes/src/unbundle.ts` for the experiment that framed this).

## Pipeline today

Four stages chained via the scheduler, 3×/hour (`convex/crons.ts`):

1. **Crawl** (`snapshots/crawl/main.ts`) — serial per-model fetch loop (~800 sequential requests),
   bundles everything into one JSON blob, gzips it into Convex file storage, metadata row in
   `snapshot_crawl_archives`.
2. **Materialize** (`snapshots/materialize/`) — gunzips the bundle, runs each endpoint through a
   large zod transform, upserts the `or_views_*` tables.
3. **Materialized changes** (`snapshots/materializedChanges/`) — re-materializes _pairs_ of bundles
   and diffs them (json-diff-ts) into per-field rows in `or_views_changes`.
4. **Alerts** (`alerts/dispatcher.ts`) — Discord dispatch from the projected change batch.

## The numbers

| Metric                                         | Value                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Crawl cadence                                  | every 20 min (72/day)                                                              |
| Raw bundle                                     | ~10.8 MB minified, ~0.9 MB gzipped                                                 |
| Archives accumulated                           | ~12–13k since Aug 2025; ~11 GB+ in Convex file storage, +~2 GB/month, no retention |
| Deduped catalog state (the actual information) | 3.85 MB minified, **0.33 MB gzipped**                                              |
| Change rows produced                           | **~200/day**                                                                       |
| Entities touched in a sample 12 h changeset    | 12 of ~1,850 (90 atomic changes)                                                   |

Information-to-storage ratio is roughly 1:10,000.

Bundle composition: ~35% of endpoint bytes are the embedded `model` record (repeated per endpoint),
~14% embedded `provider_info`, ~13% ephemeral telemetry (`stats`, `statsByTier`,
`status_heuristics_*`) that is _discarded_ at materialization — despite being the one signal
(p50 latency/throughput) the product would like history for.

Change composition: ~86% of change rows are `pricing.*`; ~60% of those are sub-5% float drift
(`discount` flapping 0.413↔0.414 every crawl). Each real pricing change is recorded 3–4× via its
mirrors (`display_pricing`, `pricing_json`, `pricing_version_id`).

## Friction points

- **Raw data is write-only.** Bundles are opaque gzip blobs; inspecting one entity means
  downloading and decompressing ~20 MB. No as-of queries, no field archaeology.
- **The projected schema is load-bearing in ~6 places.** A pricing field rename touches: the table
  validator, the zod transform, the catalog projection, the diff engine's `keysToSkip`,
  `PATH_REWRITES` (changes), `PRICING_PATHS` (pricing history), and the deliberately duplicated
  `public_api` transform. Deprecated fields can't be dropped and are re-filtered at every seam.
- **Schema drift is real and silent.** The source schema has grown many keys since the project
  started; fields die without announcement (`variable_pricings` quietly emptied out). This is
  _why_ the projection layer exists — and why naive field-level dedupe of stored data is risky.
- **Pricing history is reconstructed backwards** from current state through the change log
  (`endpointPricingHistory/reconstruct.ts`): ~260 lines of reverse replay, a 20,000-doc cap with
  silent truncation, and a forget-prices-on-create hack because no snapshot exists at
  availability boundaries.
- **A crawl is treated as atomic when it isn't.** Hundreds of independent requests are bundled as
  one unit; per-request failures are patched around (`failedModelKeys`) rather than modeled.
- **Validation strictness mismatch.** Materialize tolerates per-endpoint parse failures;
  materializedChanges throws on the same input — drift can keep the catalog updating while
  silently stalling the change feed and alerts.
- **Repeated re-derivation under memory ceilings.** Bundles are decompressed and re-materialized
  up to 3× per crawl, with a two-bundle in-memory limit and 500-pair continuation loops.

## What the app actually needs

- **Current catalog, live** — the grid ships the whole `or_views_endpoints` table to the client;
  small and a good fit for Convex reactivity. Works well.
- **Immutable per-crawl change batches** — monitor fetches them once, caches forever.
- **Time series** — pricing history today; latency/throughput and richer analytics wanted.
  History is the product's promise and the thing the current model serves worst.
