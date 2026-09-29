# Endpoint telemetry

OpenRouter endpoint payloads contain volatile performance and operational observations.

- `stats` Optional. Absence indicates not enough traffic for an observation.
- `statsByTier` Optional nested stats record for endpoints with tiers like `flex`, `priority` (rare).
  - `statsByTier.default` is equal to `stats` if present.
- `status` 💤
- 🧭 ORCA classifies `capacity_tpm` as telemetry.

## Historical fields

These fields appeared on endpoints for a brief period of time.

- `status_heuristics`, `status_heuristics_5m`, `status_heuristics_1d` 💤
- `routing_heuristics_by_tier` 💤
