# Endpoint telemetry

OpenRouter endpoint payloads contain volatile performance and operational observations.

- `stats` Optional. Absence indicates not enough traffic for an observation; batch endpoints carried none on 2026-10-23.
- `status` 🚫 numeric; negative codes are undocumented. See `public-api.md`.

## Window and percentile interpretation

Frontend stats objects carry p50, p75, p90, p95, and p99 latency and throughput, `mean_latency`,
`window_minutes`, `throughput_window_minutes`, `request_count`, `latency_request_count`, and
`throughput_request_count`. Latency and throughput windows can differ within one sample.

📊 On 2026-10-23, all 1,518 collected stats objects had a 30-minute latency window; throughput windows
were 30 minutes on 1,289 and 1,440 minutes on 229. Throughput percentiles were null on 240.
Latency request counts ranged from 1 to 3,005,702, with an endpoint median of 951.

OpenRouter's provider-routing guide defines percentile labels by the fraction of requests
performing better than the threshold. Higher throughput percentile labels therefore describe
slower tails. The current public endpoints example also has descending throughput values.
Do not reorder those values to make them ascending or describe p99 as the fastest requests.
The routing guide's rolling five-minute statistics and public fields named `*_last_30m`
describe different scopes; neither establishes a frontend sample's window.

Sources checked 2026-10-23:
`https://openrouter.ai/docs/guides/routing/provider-selection#how-percentiles-work` and
`https://openrouter.ai/docs/api/api-reference/endpoints/list-all-endpoints-for-a-model`.

Listing, disabled/deranked flags, status, and uptime are distinct observations.
Missing performance readings do not establish downtime.

The captured stats example in `catalog-model-and-endpoint-examples.md` repeats an
`endpoint_id` inside `stats` and `statsByTier.default`. Its enclosing endpoint ID
is omitted, so the example cannot establish equality with that outer identity.
The nested endpoint references suggest independently held metrics denormalized into
endpoint responses at query time. This is an inference from the payload, rather
than confirmation of OpenRouter's internal storage or query design.

## Historical fields

These fields appeared on endpoints for a brief period of time.

- `status_heuristics`, `status_heuristics_5m`, `status_heuristics_1d` 💤
- `routing_heuristics_by_tier` 💤
- `statsByTier` 💤

From June 2026 to 2026-08-31, `statsByTier` held `default`, `flex`, and `priority` stats on standard
endpoints, with `default` equal to `stats`. It disappeared with nested `tiers` when tiers became
separate endpoints; see service tiers in `endpoints.md`.
