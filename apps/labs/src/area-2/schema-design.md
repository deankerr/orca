# Area 2 product database schema

## Decision

Area 2 remains a compact current-state projection plus an immutable, generic `json-diff-ts`
changeset journal. The raw bundle archive remains the authoritative evidence and rebuild source.

Pricing history is a first-class query, so the journal additionally writes a small, purpose-built
pricing revision stream. It stores one complete selected `CorePricing` card at each price or
availability transition. This avoids reconstructing chart state from nested generic changesets at
read time without turning every historical event or current catalog field into relational rows.

The persisted product-database version covers this DDL, `area-2-core.ts`, the declared projection
policies, and the diff policy. Any change to those contracts requires a new database and replay.

## Projection policies

`database_metadata` records the projection's declared policies as JSON. The current experiment is
`{ "outputModalities": "text-only", "sampleRate": "daily" }`.

The product database records and validates this identity when opening an existing file. It does not
inspect applied crawls to enforce these policies; Area 2 bundle filtering owns that work.

`text-only` retains endpoints whose materialized, endpoint-embedded model has exactly `['text']`
output modalities. `daily` retains the first usable bundle of each UTC day. The bundle-file
processor uses the persisted cursor to avoid reading files at or before it, and skips later files in
the cursor's UTC day because they cannot affect a first-daily projection.

## Current state and journal

- `crawls` establishes the incremental source cursor.
- `models` and `endpoints` contain the latest selected entity JSON for restoration on the next
  crawl; they are rebuildable serving state.
- `model_changes` and `endpoint_changes` retain the complete raw changeset for every event.
- Lifecycle journal rows retain a complete selected entity context. Direct price updates retain a
  complete post-change pricing context.
- Historical model names and endpoint provider display names are immutable event fields.

The journal is sufficient for Monitor, raw inspection, and future derived projections. It is not a
generic indexed field-history API.

## Pricing revision stream

```sql
CREATE TABLE endpoint_pricing_revisions (
  crawl_id TEXT NOT NULL,
  endpoint_id TEXT NOT NULL,
  model_slug TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_display_name TEXT NOT NULL,
  provider_slug TEXT NOT NULL,
  provider_model_id TEXT NOT NULL,
  revision_kind TEXT NOT NULL CHECK (
    revision_kind IN ('baseline', 'available', 'unavailable', 'pricing')
  ),
  pricing_json TEXT,
  PRIMARY KEY (crawl_id, endpoint_id),
  FOREIGN KEY (crawl_id, endpoint_id) REFERENCES endpoint_changes(crawl_id, endpoint_id),
  CHECK (
    (revision_kind = 'unavailable' AND pricing_json IS NULL) OR
    (revision_kind != 'unavailable' AND pricing_json IS NOT NULL)
  )
) STRICT;

CREATE INDEX endpoint_pricing_revisions_by_model_crawl
  ON endpoint_pricing_revisions(model_slug, crawl_id DESC, endpoint_id);
```

`pricing_json` preserves the selected source representation. Token prices remain decimal strings,
while `discount` remains numeric. A missing component remains absent and is distinct from zero.
The selected `CorePricing` fields include text, cache, reasoning, audio, image, request, web-search,

## Ingestion

Each accepted crawl writes the journal, revision stream, current state, and cursor in one SQLite
transaction. Area 2 bundle-file processing rejects malformed bundles and bundles that produce zero
retained endpoints before they reach this transaction, recording each rejection with `console.warn`.
Filesystem failures are fatal. Write exactly one pricing revision for an endpoint when it is:

- first observed: `baseline` with a full price card;
- re-observed after unavailability: `available` with a full price card;
- removed: `unavailable` with no price card; or
- updated with any nested `pricing` change: `pricing` with the complete post-change price card.

Do not create a revision for unrelated endpoint updates. In particular, route or presentation-only
updates do not create price history rows.

## Pricing history query

For one model, read the indexed revision rows in chronological order and group them by endpoint ID.
Each row becomes a chart state point: every revision except `unavailable` is available and carries
its full price card. The reader appends an in-memory terminal point for each currently available
endpoint at the last crawl, so an unchanged standing rate extends to the database's `asOf` boundary.

This directly serves the pricing-history chart's state-transition model. It retains unavailable
endpoints and their provider identity even after they leave current state, and it has no history
document cap or reverse reconstruction step.

## Deferred work

The following are deliberately not part of this schema:

- Atomized/indexed generic `event_fields`.
- Relational `current_models`, `current_endpoints`, parameter membership, or price-component tables.
- Generic field-history predicates and alerts.
- Pricing revisions for non-pricing route or presentation changes.

Add a separate projection only when a concrete product query requires one of these capabilities.
