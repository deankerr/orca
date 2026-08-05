# Area 2 product database schema

## Decision

Area 2 is a query-oriented product projection, not a generic changeset journal.

- Materialized crawls are the only input to `ProductDatabase`.
- `json-diff-ts` is the in-process comparison implementation. Its nested changeset format is not
  persisted.
- The immutable history is an event ledger with indexed field facts.
- Lifecycle events retain a complete selected entity snapshot.
- Pricing revisions retain every selected `CorePricing` component as query rows.
- Current catalog rows are relational serving state, not JSON documents with incidental indexes.
- The raw bundle archive remains the authoritative evidence and rebuild source.

This supersedes the Area 2 v2 changeset-journal experiment. A new persisted product-database version
is required when this schema is implemented.

## Schema

The DDL below is the intended contract. Exact helper names and statement ordering are implementation
details.

```sql
CREATE TABLE database_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

-- `crawl_no` is the local monotonic query cursor. `crawl_id` remains the source/archive identifier.
CREATE TABLE crawls (
  crawl_no INTEGER PRIMARY KEY,
  crawl_id TEXT NOT NULL UNIQUE,
  previous_crawl_no INTEGER REFERENCES crawls(crawl_no),
  observed_at TEXT NOT NULL,
  materialized_sha256 TEXT NOT NULL
) STRICT;

CREATE TABLE current_models (
  slug TEXT PRIMARY KEY,
  permaslug TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  context_length INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  hf_slug TEXT,
  instruct_type TEXT,
  reasoning_config_json TEXT,
  supports_reasoning INTEGER,
  promotion_message TEXT,
  warning_message TEXT,
  observed_crawl_no INTEGER NOT NULL REFERENCES crawls(crawl_no)
) STRICT;

CREATE TABLE current_model_modalities (
  model_slug TEXT NOT NULL REFERENCES current_models(slug),
  direction TEXT NOT NULL CHECK (direction IN ('input', 'output')),
  modality TEXT NOT NULL,
  PRIMARY KEY (model_slug, direction, modality)
) STRICT;

CREATE TABLE current_endpoints (
  id TEXT PRIMARY KEY,
  model_slug TEXT NOT NULL REFERENCES current_models(slug),
  model_variant_slug TEXT NOT NULL,
  model_variant_permaslug TEXT NOT NULL,
  variant TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_display_name TEXT NOT NULL,
  provider_slug TEXT NOT NULL,
  provider_model_id TEXT NOT NULL,
  provider_region TEXT,
  context_length INTEGER NOT NULL,
  max_prompt_tokens INTEGER,
  max_completion_tokens INTEGER,
  quantization TEXT,
  supports_reasoning INTEGER NOT NULL,
  supports_tool_parameters INTEGER NOT NULL,
  has_chat_completions INTEGER NOT NULL,
  has_completions INTEGER NOT NULL,
  moderation_required INTEGER NOT NULL,
  is_free INTEGER NOT NULL,
  is_deranked INTEGER NOT NULL,
  is_disabled INTEGER NOT NULL,
  data_policy_training INTEGER,
  data_policy_retains_prompts INTEGER,
  data_policy_can_publish INTEGER,
  data_policy_retention_days INTEGER,
  data_policy_requires_user_ids INTEGER,
  supports_implicit_caching INTEGER,
  supports_native_web_search INTEGER,
  observed_crawl_no INTEGER NOT NULL REFERENCES crawls(crawl_no)
) STRICT;

CREATE INDEX current_endpoints_by_model ON current_endpoints(model_slug);
CREATE INDEX current_endpoints_by_provider_name ON current_endpoints(provider_name);
CREATE INDEX current_endpoints_by_provider_slug ON current_endpoints(provider_slug);

-- JSON preserves the selected source representation: price components are mostly decimal strings,
-- while `discount` is numeric. Missing components have no row rather than a synthetic zero/null.
CREATE TABLE current_endpoint_prices (
  endpoint_id TEXT NOT NULL REFERENCES current_endpoints(id),
  component TEXT NOT NULL CHECK (component IN (
    'prompt', 'completion', 'input_cache_read', 'input_cache_write',
    'input_cache_write_1h', 'internal_reasoning', 'request', 'web_search', 'discount'
  )),
  value_json TEXT NOT NULL,
  PRIMARY KEY (endpoint_id, component)
) STRICT;

-- `endpoint` is the top-level array; `feature` is features.supported_parameters.
CREATE TABLE current_endpoint_parameters (
  endpoint_id TEXT NOT NULL REFERENCES current_endpoints(id),
  source TEXT NOT NULL CHECK (source IN ('endpoint', 'feature')),
  parameter TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  PRIMARY KEY (endpoint_id, source, parameter)
) STRICT;

CREATE INDEX current_endpoint_parameters_by_parameter
  ON current_endpoint_parameters(source, parameter, enabled, endpoint_id);

-- Stats are deliberately outside configuration history. A missing row means no current observation,
-- rather than a stale value from an earlier crawl.
CREATE TABLE current_endpoint_metrics (
  endpoint_id TEXT PRIMARY KEY REFERENCES current_endpoints(id),
  observed_crawl_no INTEGER NOT NULL REFERENCES crawls(crawl_no),
  p50_latency REAL NOT NULL,
  p50_throughput REAL NOT NULL
) STRICT;

CREATE TABLE events (
  event_id INTEGER PRIMARY KEY,
  crawl_no INTEGER NOT NULL REFERENCES crawls(crawl_no),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('model', 'endpoint')),
  entity_id TEXT NOT NULL,
  event_kind TEXT NOT NULL
    CHECK (event_kind IN ('baseline', 'available', 'unavailable', 'updated')),

  -- Event dimensions describe the post-state, except an unavailable event describes its last state.
  context_side TEXT NOT NULL CHECK (
    (event_kind = 'unavailable' AND context_side = 'before') OR
    (event_kind != 'unavailable' AND context_side = 'after')
  ),
  model_slug TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider_name TEXT,
  provider_slug TEXT,
  provider_display_name TEXT,

  CHECK (
    (entity_type = 'model' AND entity_id = model_slug
      AND provider_name IS NULL AND provider_slug IS NULL AND provider_display_name IS NULL) OR
    entity_type = 'endpoint'
  ),
  UNIQUE (crawl_no, entity_type, entity_id)
) STRICT;

CREATE INDEX events_by_crawl ON events(crawl_no DESC, event_id);
CREATE INDEX events_by_model_crawl ON events(model_slug, crawl_no DESC, event_id);
CREATE INDEX events_by_provider_name_crawl
  ON events(provider_name, crawl_no DESC, event_id);
CREATE INDEX events_by_model_provider_name_crawl
  ON events(model_slug, provider_name, crawl_no DESC, event_id);
CREATE INDEX events_by_provider_slug_crawl
  ON events(provider_slug, crawl_no DESC, event_id);

-- Rows exist only for `updated` events. Lifecycle is represented by event kind plus a snapshot,
-- not as an unhelpful add/remove of every selected leaf.
CREATE TABLE event_fields (
  event_id INTEGER NOT NULL REFERENCES events(event_id),
  ordinal INTEGER NOT NULL,
  field_family TEXT NOT NULL,
  field_path TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('add', 'remove', 'update')),
  before_present INTEGER NOT NULL CHECK (before_present IN (0, 1)),
  before_json TEXT,
  after_present INTEGER NOT NULL CHECK (after_present IN (0, 1)),
  after_json TEXT,
  PRIMARY KEY (event_id, ordinal),
  UNIQUE (event_id, field_path),
  CHECK (
    (before_present = 0 AND before_json IS NULL) OR
    (before_present = 1 AND before_json IS NOT NULL)
  ),
  CHECK (
    (after_present = 0 AND after_json IS NULL) OR
    (after_present = 1 AND after_json IS NOT NULL)
  ),
  CHECK (
    (operation = 'add' AND before_present = 0 AND after_present = 1) OR
    (operation = 'remove' AND before_present = 1 AND after_present = 0) OR
    (operation = 'update' AND before_present = 1 AND after_present = 1)
  )
) STRICT;

CREATE INDEX event_fields_by_family_path_event
  ON event_fields(field_family, field_path, event_id);

-- A full CoreModel or CoreEndpoint selected state. The event provides the small associated model/
-- provider display slice for endpoint snapshots.
CREATE TABLE event_lifecycle_snapshots (
  event_id INTEGER PRIMARY KEY REFERENCES events(event_id),
  state_json TEXT NOT NULL
) STRICT;

-- One full price card for a baseline, availability, price change, or route/presentation boundary.
CREATE TABLE event_pricing_revisions (
  event_id INTEGER PRIMARY KEY REFERENCES events(event_id),
  revision_kind TEXT NOT NULL CHECK (
    revision_kind IN ('baseline', 'available', 'pricing', 'route')
  )
) STRICT;

CREATE TABLE event_pricing_values (
  event_id INTEGER NOT NULL REFERENCES event_pricing_revisions(event_id),
  component TEXT NOT NULL CHECK (component IN (
    'prompt', 'completion', 'input_cache_read', 'input_cache_write',
    'input_cache_write_1h', 'internal_reasoning', 'request', 'web_search', 'discount'
  )),
  value_json TEXT NOT NULL,
  PRIMARY KEY (event_id, component)
) STRICT;
```

## Diff-to-ledger mapping

The writer continues to diff models as `CoreModel` documents and endpoints as
`{ endpoint: CoreEndpoint, model_slug }` documents with Area 2's value-keyed array policy.

1. Compare adjacent complete materialized crawls with `json-diff-ts`.
2. Classify each entity as baseline, available, unavailable, or updated.
3. For updated entities, atomize the changeset and normalize paths. For endpoints,
   `$.endpoint.pricing.prompt` becomes `pricing.prompt`.
4. Group atomic set-member changes back to their selected array path. For example, all
   `supported_parameters` member operations become one field row holding the complete before and
   after arrays. A reorder remains no change.
5. Write one `event_fields` row per normalized path with explicit presence and canonical JSON values.
6. Do not write field rows for lifecycle events; write one complete lifecycle snapshot instead.
7. Write a complete pricing revision for baseline and available endpoint events, for updated events
   touching `pricing`, and for model/provider route or presentation changes. The latter begins a new
   correctly labelled pricing period even when its numeric rates did not change.
8. Do not write a pricing revision for unavailable. The lifecycle snapshot describes the last state
   and the pricing query closes the existing period at that event.

`field_family` is the first path segment, such as `pricing`, `data_policy`, or `features`; a root
scalar uses its own name. This supports indexed family queries without prefix-matching JSON paths.

## Query contracts

### Monitor

The filter discovers crawl numbers from `events` using the matching composite index. The page then
fetches every event and event field from each selected crawl. A model/provider filter therefore
selects batches but does not hide other events that occurred in a returned batch.

Historical Monitor labels always come from the immutable event columns, never from current catalog
rows. `provider_name` is the organization filter; `provider_slug` remains available for targeting-key
filters.

### Field history

`event_fields` supports a query by field family/path and joins to `events` for model, provider, and
crawl dimensions. `before_present`/`after_present` distinguish absent properties from JSON `null`.

### Pricing history

Read endpoint lifecycle events and pricing revisions in crawl order for the selected model. A
baseline, available, or route revision starts a period with a complete price card; a `pricing`
revision contributes a complete new price card; an unavailable event closes the period. All nine
selected `CorePricing` components are retained, while a chart can choose its displayed subset.

### Current catalog

Grid queries read only `current_*` tables and their indexes. `reasoning_config` is the intentional
opaque JSON field; every other selected scalar is relational, and selected sets are membership rows.

## Ingestion and integrity

- `ProductDatabase` accepts only complete materialized crawls. Archive reading, acceptance policy,
  and playback remain outside the database boundary.
- One SQLite transaction inserts the crawl, appends immutable history, replaces current catalog and
  metric rows, and advances the cursor.
- Reapplying an existing crawl ID with the same materialized digest is a no-op. A different digest or
  a missing older crawl is rejected.
- An accepted no-change crawl is still recorded, advances the cursor, and refreshes current metrics.
- No history table is updated or deleted through the product-database API. The current tables are
  rebuildable serving state.
- The persisted database version covers this DDL, `area-2-core.ts`, path normalization, and the diff
  options. A change to any of them requires a new database/rebuild.
