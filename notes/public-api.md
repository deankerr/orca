# Public API (V2) service

Replace the Convex-backed public preview API with an isolated projection that owns its schema transform, storage, and serve path. Schema-stable external contract; engine only feeds **raw** successful capture payloads.

Related: `notes/engine-sinks.md` (batching + multi-sink). Product objectives: `notes/objectives.md` → ORCA API.

## Why

- Today: Next rewrite → Convex HTTP → full `or_views_endpoints` collect → transform → **~2.3MB** every request.
- Low traffic still hurts: clients **cannot be trusted to cache** (worst case: React `useEffect` loop, DevTools open, no cache). Origin must be cheap under repeated full GETs.
- Convex I/O for a static dump is the wrong meter. Promise is **schema stability** and isolation from the rest of the backend rewrite.

## Black box

```
engine (sink fan-out)
  → feed raw observation batches
        │
        ▼
  public-api package (composed into engine Worker)
        owns: transform, current state, materialize, GET
        resources: own D1 / R2 (or equivalent), not shared product tables
```

- **Input:** raw OpenRouter endpoint observation payloads (same evidence capture already has), not product cards and not V2 JSON.
- **Output:** existing V2 response shape (`updated_at` + `models[]` / providers), served as a **prebuilt blob**.
- Engine does not import V2 schema details. Public API does not import engine modules — **engine passes deps** (R2, D1, clock, config). Effect `Service` if it fits; not required for v1.

## Package shape (not a separate Worker for now)

Prefer **`packages/…` (or similar) imported by `apps/engine`**, bound to **isolated** Alchemy resources owned for this product.

- No shared imports from `apps/engine` into the package.
- Duplication with other projections is OK; do not generalize early. Mechanisms here may later move “up” into engine space — or not.

Separate Worker remains optional later if serve/load isolation demands it; not the default.

## Transform ownership

- Port / re-home logic from `packages/backend/convex/public_api/preview_v2.ts`.
- Encapsulate **schema variations** (legacy views vs entities product card vs raw OR rows) **inside this package**. That is the control point for V2 field quirks (tiers, sparse pricing, limits, stats, etc.).
- Validation script (`apps/web/scripts/validate-public-api.ts`) should target this schema, not Convex, once cut over.

## Availability: stale-time, not explicit tombstones

Do **not** depend on a perfect unavailable protocol for the first cut.

- Record **last update time per endpoint** on every successful feed for that endpoint.
- When materializing V2: **omit** endpoints whose last update is older than a threshold (e.g. **1 hour** — align with capture cadence; tune later).
- Models with zero remaining providers are omitted.
- `disabled` (and equivalent) from raw data still excluded when present.

Stale-time is the practical “no longer available” signal given hourly full samples and partial mid-sample updates.

## Materialize + serve

| Path      | Behaviour                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------- |
| **Write** | Apply batch → update per-endpoint state + last-seen → (debounced) rebuild full V2 JSON → store blob |
| **Read**  | Serve the blob only. No live query of the full set on GET.                                          |

- **Prebuilt static artifact** is mandatory, not optional. Edge/CDN headers are nice extras; they are **not** the correctness or cost strategy.
- Rebuild on ingest cadence (after sink batches), not on request. Debounce rebuilds so one sample does not rewrite the blob per scope.
- Gzip / etag / `Cache-Control` optional hardening; assume hostile uncached GETs forever.

## Sinks relationship

- Public API is a **sink** in the engine sense: best-effort after archive; batch-friendly.
- Banking: prefer engine-level batch flush into this sink; this package may still debounce blob rebuild further.
- Convex `POST /current/endpoints` remains a separate sink (product cards) until that product is redesigned — not a dependency of V2.

## Cut-over

1. Sinks + batching in engine (see engine-sinks note).
2. Package + resources + feed from raw batches; dual-run vs Convex response.
3. Flip Next rewrite (`/api/preview/v2/models`) off Convex HTTP onto this serve path.
4. Retire Convex `public_api` route/query when stable.

External URL stays `https://orca.orb.town/api/preview/v2/models` via rewrite.

## Non-goals

- V3 schema
- Relying on client or browser HTTP cache
- Feeding product-card (`toEndpoint`) shape as the long-term input contract
- Perfect unavailable_at semantics from Convex/current
- Shared projection DB with the endpoints data grid

## Success

- Repeated uncached GETs do not touch Convex and do not re-scan all endpoints.
- V2 schema changes only inside this package.
- Dropped upstream endpoints disappear after stale threshold without a separate delete channel.
- Engine only knows “raw batch → this sink’s handle.”
