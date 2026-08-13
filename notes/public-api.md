# Public API (V2) service

Replace the Convex-backed public preview API with an isolated projection that owns its schema transform, storage, and serve path. Schema-stable external contract; engine only feeds **raw** successful capture payloads.

Related: `notes/engine-sinks.md` (batching + multi-sink). Product objectives: `notes/objectives.md` → ORCA API.

## Why

- Today: Next rewrite → Convex HTTP → full `or_views_endpoints` collect → transform → **~1.4MB** uncompressed JSON every request (~70KB gzip; measured 2026-08 on prod + dev).
- Low traffic still hurts: clients **cannot be trusted to cache** (worst case: React `useEffect` loop, DevTools open, no cache). Origin must be cheap under repeated full GETs.
- Convex I/O for a static dump is the wrong meter. Cloudflare is far cheaper; Promise is **schema stability** and isolation from the rest of the backend rewrite.

## Black box

```
engine (sink fan-out)
  → feed raw observation batches
        │
        ▼
  @orca/public-api-v2 (composed into engine Worker)
        owns: transform, current state (D1), GET
        resources: isolated D1 (not EntityClocks / product tables)
```

- **Input:** raw OpenRouter endpoint observation payloads (same evidence capture already has), not product cards and not V2 JSON.
- **Output:** existing V2 response shape (`updated_at` + `models[]`), assembled from D1 current state.
- Engine does not import V2 schema details. Public API does not import engine modules — **engine passes deps** (D1 SQL, optional config).

## Package shape (not a separate Worker for now)

Prefer **`packages/public-api-v2`** imported by `apps/engine`, bound to **isolated** Alchemy resources owned for this product.

- No shared imports from `apps/engine` into the package.
- Duplication with other projections is OK; do not generalize early.

Separate Worker remains optional later if serve/load isolation demands it; not the default.

## Transform ownership

- Port / re-home logic from `packages/backend/convex/public_api/preview_v2.ts`.
- Prep (hoist model, heal variant, strip nested model) via `@orca/entities` `toModelEndpoints`.
- This package revalidates and maps to the V2 response contract.
- Validation script (`apps/web/scripts/validate-public-api.ts`) should target this schema, not Convex, once cut over.

## State unit: model, not endpoint

One observation scope → one `toModelEndpoints` → one V2 model document (with its full `providers[]`).

- Upsert **whole model** on each successful transform for that scope.
- **No per-endpoint last-seen** in this product (the transform does not allow partial endpoint updates).
- No history, no change log, no tombstones. Unused rows may linger; **read path filters** them out.

## Availability: relative stale-time

Do **not** age models against wall clock.

1. On each successful upsert, store `updated_at` = observation time (`observedAt`, normalized to ISO).
2. **Overall watermark** = `max(models.updated_at)` over the store (derived; no separate write channel required).
3. When serving: include a model iff  
   `overall_updated_at - model.updated_at < THRESHOLD`  
   (default **1 hour** — well above full-sample duration; tune later).
4. Response `updated_at` = overall watermark.
5. Models that fail transform (empty providers, disabled-only, bad shape) are simply not upserted.

**Pipeline freeze:** if capture/sinks stop, the watermark stops advancing → nothing ages out → catalog is **frozen**, not a gradual bleed to empty.

**Partial capture:** watermark advances with live models; stragglers drop after the relative threshold.

**GC / delete of stale rows:** not required for v1. Filter on read only; revisit if storage noise becomes a problem.

## Storage + serve (v1)

| Path      | Behaviour                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Write** | Transform each bank item → `UPSERT` model row (`id`, body JSON, `created_at`, `updated_at`). Prefer newer `updated_at` on conflict. |
| **Read**  | `max(updated_at)` → filter rows within threshold → sort `created_at` desc → optional limit → JSON response.                         |

- **D1 only** as source of truth for current models. Isolated DB from EntityClocks.
- **Prebuilt static blob (R2) is optional** — a later cost/latency hardening if live assemble + cache is not enough. Not required for correctness.
- Edge/CDN headers (`Cache-Control`, Workers Cache API) are welcome extras; assume hostile uncached GETs still hit origin sometimes.
- Rebuild/serve on request from D1; no debounce materializer for v1.

## Sinks relationship

- Public API is a **sink** in the engine sense: best-effort after archive; batch-friendly.
- Banking is engine-level (SinksQueue window); this package upserts per model as items arrive.
- Convex `POST /current/endpoints` remains a separate sink until that product is redesigned — not a dependency of V2.

## Cut-over

1. Sinks + batching in engine (see engine-sinks note).
2. Package + isolated D1 + feed from raw batches; dual-run vs Convex response.
3. Flip Next rewrite (`/api/preview/v2/models`) off Convex HTTP onto this serve path.
4. Retire Convex `public_api` route/query when stable.

External URL stays `https://orca.orb.town/api/preview/v2/models` via rewrite.

## Non-goals

- V3 schema
- Relying on client or browser HTTP cache as the only cost control
- Feeding product-card (`toEndpoint`) shape as the long-term input contract
- Perfect unavailable_at semantics from Convex/current
- Shared projection DB with the endpoints data grid / EntityClocks
- History or change preservation for dropped models
- Mandatory prebuilt R2 artifact

## Success

- Repeated uncached GETs do not touch Convex.
- V2 schema changes only inside this package.
- Dropped upstream models disappear after the **relative** stale threshold without a separate delete channel.
- Full pipeline outage freezes the catalog instead of emptying it.
- Engine only knows “raw batch → this sink’s handle” (+ deps injection).
