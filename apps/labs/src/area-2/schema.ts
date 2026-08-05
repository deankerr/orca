import type { Database } from 'bun:sqlite'

// Bump this when the persisted schema, materialization selection, or diff policy changes.
export const PRODUCT_DATABASE_VERSION = 'area-2-v2'

const statements = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  `CREATE TABLE IF NOT EXISTS database_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS crawls (
    crawl_id TEXT PRIMARY KEY,
    previous_crawl_id TEXT,
    processed_at TEXT NOT NULL,
    FOREIGN KEY (previous_crawl_id) REFERENCES crawls(crawl_id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS models (
    slug TEXT PRIMARY KEY,
    state_json TEXT NOT NULL,
    observed_crawl_id TEXT NOT NULL,
    FOREIGN KEY (observed_crawl_id) REFERENCES crawls(crawl_id)
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS endpoints (
    id TEXT PRIMARY KEY,
    model_slug TEXT NOT NULL,
    provider_name TEXT,
    provider_slug TEXT,
    state_json TEXT NOT NULL,
    observed_crawl_id TEXT NOT NULL,
    FOREIGN KEY (observed_crawl_id) REFERENCES crawls(crawl_id)
  ) STRICT`,
  'CREATE INDEX IF NOT EXISTS endpoints_by_model ON endpoints(model_slug)',
  'CREATE INDEX IF NOT EXISTS endpoints_by_provider ON endpoints(provider_slug)',
  `CREATE TABLE IF NOT EXISTS model_changes (
    crawl_id TEXT NOT NULL,
    previous_crawl_id TEXT,
    model_slug TEXT NOT NULL,
    change_kind TEXT NOT NULL CHECK (change_kind IN ('baseline', 'available', 'unavailable', 'updated')),
    changeset_json TEXT NOT NULL,
    context_kind TEXT NOT NULL CHECK (context_kind IN ('entity', 'none')),
    context_json TEXT,
    PRIMARY KEY (crawl_id, model_slug),
    FOREIGN KEY (crawl_id) REFERENCES crawls(crawl_id),
    FOREIGN KEY (previous_crawl_id) REFERENCES crawls(crawl_id),
    CHECK (
      (context_kind = 'none' AND context_json IS NULL) OR
      (context_kind = 'entity' AND context_json IS NOT NULL)
    )
  ) STRICT`,
  'CREATE INDEX IF NOT EXISTS model_changes_by_crawl ON model_changes(crawl_id DESC)',
  `CREATE TABLE IF NOT EXISTS endpoint_changes (
    crawl_id TEXT NOT NULL,
    previous_crawl_id TEXT,
    endpoint_id TEXT NOT NULL,
    model_slug TEXT NOT NULL,
    provider_name TEXT,
    provider_slug TEXT,
    change_kind TEXT NOT NULL CHECK (change_kind IN ('baseline', 'available', 'unavailable', 'updated')),
    changeset_json TEXT NOT NULL,
    context_kind TEXT NOT NULL CHECK (context_kind IN ('entity', 'none', 'pricing')),
    context_json TEXT,
    PRIMARY KEY (crawl_id, endpoint_id),
    FOREIGN KEY (crawl_id) REFERENCES crawls(crawl_id),
    FOREIGN KEY (previous_crawl_id) REFERENCES crawls(crawl_id),
    CHECK (
      (context_kind = 'none' AND context_json IS NULL) OR
      (context_kind IN ('entity', 'pricing') AND context_json IS NOT NULL)
    )
  ) STRICT`,
  'CREATE INDEX IF NOT EXISTS endpoint_changes_by_crawl ON endpoint_changes(crawl_id DESC)',
  'CREATE INDEX IF NOT EXISTS endpoint_changes_by_model_crawl ON endpoint_changes(model_slug, crawl_id DESC)',
  'CREATE INDEX IF NOT EXISTS endpoint_changes_by_provider_crawl ON endpoint_changes(provider_slug, crawl_id DESC)',
] as const

/** Initializes the compact current-state and changeset schema for the Area 2 experiment. */
export const initializeProductDatabase = (database: Database) => {
  for (const statement of statements) {
    database.run(statement)
  }

  const metadata = database
    .query<{ readonly value: string }, [string]>(
      'SELECT value FROM database_metadata WHERE key = ?',
    )
    .get('schema_version')
  if (metadata === null) {
    database
      .query('INSERT INTO database_metadata (key, value) VALUES (?, ?)')
      .run('schema_version', PRODUCT_DATABASE_VERSION)
    return
  }
  if (metadata.value !== PRODUCT_DATABASE_VERSION) {
    throw new Error(
      `unsupported product database version ${metadata.value}; expected ${PRODUCT_DATABASE_VERSION}`,
    )
  }
}
