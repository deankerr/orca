-- * The normalized store, SCD Type 2. See notes/data-architecture/normalized-store.md.
-- *
-- * Every versioned table has the same three lifecycle columns:
-- *   valid_from  the captured_at of the pass where this value was first seen
-- *   valid_to    the captured_at where it changed or disappeared (exclusive; NULL = current)
-- *   hash        sha256 of the entity's own columns — ingest is one comparison
-- *
-- * There is deliberately no `last_observed_at` column: validity and observation are
-- * different facts, and observation is already recorded in `observations`. Staleness is
-- * derived by joining, not synced on every pass (see src/ingest.ts).
-- *
-- * The primary key is (natural key, valid_from) so re-ingesting a pass is a no-op, and the
-- * partial unique index is what actually stops overlapping validity intervals — the one
-- * temporal constraint SQLite can enforce (Postgres range exclusion would do the rest).

-- * What we saw and when. Append-only, never versioned, and the only evidence that lets a
-- * version be closed out. `status` is whatever HTTP status the scope returned (404 = "zero
-- * endpoints right now", which IS evidence); `error` is a transport failure, which is not.
CREATE TABLE observations (
  captured_at TEXT NOT NULL,
  slug        TEXT NOT NULL,
  permaslug   TEXT NOT NULL,
  variant     TEXT NOT NULL,
  status      INTEGER,
  error       TEXT,
  PRIMARY KEY (captured_at, permaslug, variant)
);
CREATE INDEX observations_scope ON observations (permaslug, variant);

-- * One row per ingested pass. `transitions` is the summary of what ingest did — a derived
-- * convenience for /passes, never read as a fact by anything.
CREATE TABLE passes (
  captured_at TEXT PRIMARY KEY,
  ingested_at TEXT NOT NULL,
  scopes      INTEGER NOT NULL,
  observed    INTEGER NOT NULL,
  errored     INTEGER NOT NULL,
  transitions TEXT NOT NULL
);

-- * Models are keyed by base slug; variants live on endpoints. `or_` prefixes upstream's own
-- * timestamps so they can't be confused with this row's validity.
CREATE TABLE model_versions (
  slug              TEXT NOT NULL,
  valid_from        TEXT NOT NULL,
  valid_to          TEXT,
  hash              TEXT NOT NULL,
  permaslug         TEXT NOT NULL,
  name              TEXT NOT NULL,
  short_name        TEXT NOT NULL,
  author            TEXT NOT NULL,
  tokenizer         TEXT NOT NULL,
  context_length    INTEGER NOT NULL,
  input_modalities  TEXT NOT NULL,
  output_modalities TEXT NOT NULL,
  default_order     TEXT NOT NULL,
  supports_reasoning INTEGER NOT NULL,
  instruct_type     TEXT,
  warning_message   TEXT,
  or_created_at     TEXT NOT NULL,
  or_updated_at     TEXT NOT NULL,
  PRIMARY KEY (slug, valid_from)
);
CREATE UNIQUE INDEX model_versions_open ON model_versions (slug) WHERE valid_to IS NULL;
CREATE INDEX model_versions_from ON model_versions (valid_from);
CREATE INDEX model_versions_to ON model_versions (valid_to);

-- * Only facts we're prepared to claim about a provider: identity, location, policy documents.
-- * Behavioural policy (training, retention) is deliberately absent — endpoints override it,
-- * so a provider-level claim is never trustworthy. See notes/.../provider-identity.md.
CREATE TABLE provider_versions (
  slug                 TEXT NOT NULL,
  valid_from           TEXT NOT NULL,
  valid_to             TEXT,
  hash                 TEXT NOT NULL,
  name                 TEXT NOT NULL,
  headquarters         TEXT,
  datacenters          TEXT NOT NULL,
  status_page_url      TEXT,
  privacy_policy_url   TEXT,
  terms_of_service_url TEXT,
  moderation_required  INTEGER NOT NULL,
  byok_enabled         INTEGER NOT NULL,
  PRIMARY KEY (slug, valid_from)
);
CREATE UNIQUE INDEX provider_versions_open ON provider_versions (slug) WHERE valid_to IS NULL;
CREATE INDEX provider_versions_from ON provider_versions (valid_from);
CREATE INDEX provider_versions_to ON provider_versions (valid_to);

-- * Endpoints carry no denormalized model or provider copy — only the join keys. provider_name
-- * is the ONLY reliable join to provider_versions.slug; provider_slug is an endpoint-level
-- * targeting tag that may match no provider record at all.
-- *
-- * (model_variant_permaslug, variant) is this endpoint's observation scope: the pair that
-- * `observations` is keyed by, and therefore the pair that decides whether it may be closed
-- * out. This is the modelled version of the current pipeline's `failedModelKeys` patch.
CREATE TABLE endpoint_versions (
  id                       TEXT NOT NULL,
  valid_from               TEXT NOT NULL,
  valid_to                 TEXT,
  hash                     TEXT NOT NULL,
  model_variant_slug       TEXT NOT NULL,
  model_variant_permaslug  TEXT NOT NULL,
  variant                  TEXT NOT NULL,
  provider_name            TEXT NOT NULL,
  provider_slug            TEXT NOT NULL,
  provider_region          TEXT,
  context_length           INTEGER NOT NULL,
  quantization             TEXT NOT NULL,
  max_prompt_tokens        INTEGER,
  max_completion_tokens    INTEGER,
  limit_rpm                INTEGER,
  limit_rpd                INTEGER,
  capacity_tpm             INTEGER,
  supported_parameters     TEXT NOT NULL,
  supports_reasoning       INTEGER NOT NULL,
  can_abort                INTEGER NOT NULL,
  is_disabled              INTEGER NOT NULL,
  is_deranked              INTEGER NOT NULL,
  or_status                INTEGER NOT NULL,
  policy_training          INTEGER NOT NULL,
  policy_retains_prompts   INTEGER NOT NULL,
  policy_retention_days    INTEGER,
  policy_can_publish       INTEGER NOT NULL,
  policy_requires_user_ids INTEGER,
  pricing_version_id       TEXT NOT NULL,
  PRIMARY KEY (id, valid_from)
);
CREATE UNIQUE INDEX endpoint_versions_open ON endpoint_versions (id) WHERE valid_to IS NULL;
CREATE INDEX endpoint_versions_from ON endpoint_versions (valid_from);
CREATE INDEX endpoint_versions_to ON endpoint_versions (valid_to);
CREATE INDEX endpoint_versions_scope ON endpoint_versions (model_variant_permaslug, variant);

-- * Pricing is ~86% of change volume and `pricing_json` is an open dictionary (203 distinct SKU
-- * keys across 1,053 endpoints), so it gets its own versioned child table: one row per
-- * (endpoint, SKU). One price change stops producing an endpoint version, and "history of one
-- * price" becomes a single ordered SELECT instead of a reverse replay.
-- * `value` is TEXT because upstream ships decimal strings (and a few adapters ship numbers).
CREATE TABLE endpoint_pricing (
  endpoint_id TEXT NOT NULL,
  sku         TEXT NOT NULL,
  valid_from  TEXT NOT NULL,
  valid_to    TEXT,
  hash        TEXT NOT NULL,
  value       TEXT NOT NULL,
  PRIMARY KEY (endpoint_id, sku, valid_from)
);
CREATE UNIQUE INDEX endpoint_pricing_open ON endpoint_pricing (endpoint_id, sku) WHERE valid_to IS NULL;
CREATE INDEX endpoint_pricing_from ON endpoint_pricing (valid_from);
CREATE INDEX endpoint_pricing_to ON endpoint_pricing (valid_to);
