# Endpoint telemetry

OpenRouter endpoint payloads contain volatile performance and operational observations.

- `stats` Optional. Absence indicates not enough traffic for an observation.
- `statsByTier` Optional nested stats record for endpoints with tiers like `flex`, `priority` (rare).
- `statsByTier.default` is equal to `stats` if present.
- `status` 💤

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
