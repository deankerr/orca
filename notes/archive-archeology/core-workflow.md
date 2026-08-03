# Core data workflow

This is the current core-data direction under the product objectives in
[`notes/objectives.md`](../objectives.md). The archive gives the environment direct historical
access, but the workflow is not historical-only: the same contracts must process replayed bundles
and active captures into product artifacts.

The immediate objective is a production path for Monitor and constrained Pricing History, backed by
the same current projection that can subsequently supply the ORCA API and endpoints grid. It is not
a comprehensive model of every property OpenRouter has ever exposed.

The exhaustive observations in [schema-story.md](schema-story.md) are supporting diagnostics. They
help disprove assumptions when needed, but their long tail does not belong in the core schema by
default.

## Scope rule

A field enters the core only when it has a concrete consumer or is necessary for stable identity,
joining, availability, or a core calculation. Upstream novelty is not sufficient.

- Preserve upstream field names and value representations.
- Normalize embedded entity copies; do not denormalize model/provider fields into endpoints.
- Ignore excess upstream properties at the selection boundary.
- Keep volatile measurements separate from entity state.
- Add a new scope deliberately, with a consumer and corpus evidence, when it becomes valuable.

The selection schemas live in `packages/schema/src/archive-core.ts`. They currently cover:

- model identity and display fields, modalities, context, creation time, and reasoning/message fields
  needed by the grid or Monitor;
- endpoint identity and joins, provider identity, context/output limits, quantization, supported
  parameters, product capability/status booleans, data policy, and basic `pricing`;
- no `pricing_json`, `display_pricing`, tier structures, routing heuristics, internal adapter state,
  or other speculative fields.

`stats.p50_latency` and `stats.p50_throughput` are selected into a separate metrics table because the
current grid displays them. They are not endpoint entity fields and should not generate endpoint
revision history.

## First SQL experiment

Materialize one extracted crawl into a normalized SQLite database:

```bash
bun run archive sqlite 1785591004186
sqlite3 .archive-work/sql/core-1785591004186.sqlite
```

The database contains:

- `batch`: source crawl and fetch-failure count;
- `models`: one selected raw-name model row per `slug`;
- `endpoints`: one selected raw-name endpoint row per `id`, joined to `models` by `model_slug`;
- `endpoint_metrics`: volatile latency/throughput observations kept outside endpoint state.

Arrays and opted-in nested objects remain JSON text in SQLite. Basic pricing remains a JSON object of
upstream decimal strings, so SQL can query exact text or explicitly cast for numeric ordering:

```sql
SELECT
  model_slug,
  provider_display_name,
  json_extract(pricing, '$.prompt') AS prompt
FROM endpoints
WHERE CAST(json_extract(pricing, '$.prompt') AS REAL) > 0
ORDER BY CAST(json_extract(pricing, '$.prompt') AS REAL);
```

Measured against the archive:

| Crawl               | Models | Text endpoints | Metric rows |
| ------------------- | -----: | -------------: | ----------: |
| 2025-08-13 (first)  |    265 |            734 |         676 |
| 2026-08-01 (latest) |    298 |            931 |         879 |

The latest database is about 1.2 MB. The same core schema validated both boundary crawls without an
era-specific decoder.

SQLite is an experiment artifact, not an architecture decision. It is useful now because it is
local, dependency-free in Bun, transactional, indexed, and directly queryable. A later processor can
write the same selected rows to Parquet without changing the core entity boundary.

## Local executable specification: SQLite

The repeatable local build will hold two rebuildable products of the processor:

- a selected current model/endpoint view, updated after each successfully processed crawl;
- immutable, queryable core change events for Monitor, Pricing History, and later live Alerts.

Raw artifacts remain outside SQLite and are the rebuild source. This avoids persisting all 15.7 million
endpoint observations as product revisions or treating a product database as the archive. D1 is a
later deployment option, not part of proving the data model. Retain an explicit store interface and
measure database size, rebuild time, event volume, and product query latency.

Metrics remain separate observations and do not generate endpoint state changes. Fetch failures must
remain explicit and must never create false endpoint removals.

The immediate implementation sequence is:

1. Define a deterministic change-event contract and a store-neutral current/event write contract.
2. Prove it with a two-crawl diff and existing Monitor/Pricing History query requirements.
3. Replay the entire archive forward into a fresh `bun:sqlite` database as many times as needed,
   suppressing alert delivery and verifying deterministic output.
4. Prove product-shaped Monitor and Pricing History queries against the rebuilt database.
5. Only then run the live processor from a recorded cutover crawl, compare its current view with the
   local terminal view, and run the new product reads in shadow.

Snapshot partitions and validity intervals remain useful analytical or future projection layouts;
they are no longer prerequisites for this production slice.
