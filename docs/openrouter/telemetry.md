# Endpoint telemetry

OpenRouter endpoint payloads contain volatile routing and performance observations alongside more
durable endpoint configuration.

Observed telemetry families include:

- `stats`
- `statsByTier`
- `status_heuristics`, `status_heuristics_5m`, and `status_heuristics_1d`
- `routing_heuristics_by_tier`
- `status`

`statsByTier.default` and `stats` can describe nearly the same window while being computed at
slightly different instants. Small request-count differences between them are not contradictions.
Endpoints with no recent traffic may have no stats.

## `status`

⚠️ Although `status` appears directly on an endpoint record, its behavior is telemetry-like.
Values of `0`, `-2`, `-3`, and `-5` have been observed. Negative values correlate with a routing
penalty, but ❓ no more specific public meaning has been established.

The safe interpretation is: OpenRouter is currently derating the endpoint. It should not be
treated as a durable capability or lifecycle fact.

**Observed 2026-07-24:** telemetry occupied about 23% of endpoint payload bytes, 131 endpoints had
no stats, and `status` changed on roughly 25–50 endpoints between typical observations.
