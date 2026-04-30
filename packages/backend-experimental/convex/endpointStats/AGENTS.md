# Endpoint Stats

Endpoint stats are OpenRouter rolling-window performance observations. They are
not Catalog content and should not affect endpoint content hashes, snapshots, or
availability history.

## Source Semantics

- Stats come from `/frontend/stats/endpoint` as part of endpoint collection.
- Each stats object describes recent traffic for one endpoint, not durable
  endpoint configuration.
- `window_minutes` is currently `30` when present.
- Historical archives before 2025-12-22 often lacked `window_minutes`, but the
  reporting window appears to have still been 30 minutes.
- Crawls run every 20 minutes, so adjacent samples overlap. Do not sum adjacent
  `requestCount` values as total traffic.
- Percentiles are already computed upstream over the source window. We cannot
  merge samples into true longer-period p50/p95/p99 percentiles without raw
  request data.

## Missing Stats

- Missing `stats` is meaningful data, not just a parser failure.
- The best current interpretation is that the endpoint did not meet
  OpenRouter's internal minimum traffic threshold in the prior window.
- Persist missing observations with `statsObserved: false` so coverage can be
  measured over time.
- Do not carry forward previous numeric stats when the latest observation is
  missing; that would make stale performance data look current.

## Aggregation Rules

- Document rollups as observed rolling-window metrics, but keep field names
  concise. Prefer names such as `p50LatencyAvg`, not
  `observedP50LatencyAvg`.
- Keep `sampleCount`, `statsObservedCount`, `statsMissingCount`, and
  `coverageRatio` as first-class rollup fields.
- Request count is useful for confidence and weighting within one observation
  set, but overlapping windows make long-range traffic totals misleading.
- Rankings should expose or filter by confidence: enough samples, high coverage,
  and meaningful request counts.

## Provider Patterns

Historical analysis showed distinct stats coverage tiers:

- Near-continuous: Groq, Cerebras, DeepInfra, Google Vertex.
- Usually present: Anthropic, Google AI Studio, Fireworks, Chutes.
- Intermittent: OpenAI, Novita, Together.

These tiers are source behavior, not ORCA policy. Treat them as expectations for
analysis and UI confidence, not as hard validation rules.
