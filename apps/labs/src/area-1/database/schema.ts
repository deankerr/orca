import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

const statements = [
  `CREATE TABLE database_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`,
  `CREATE TABLE crawls (crawl_id TEXT PRIMARY KEY, previous_crawl_id TEXT, processed_at TEXT NOT NULL) STRICT`,
  `CREATE TABLE models (slug TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_crawl_id TEXT NOT NULL) STRICT`,
  `CREATE TABLE endpoints (id TEXT PRIMARY KEY, model_slug TEXT NOT NULL, provider_name TEXT NOT NULL, provider_slug TEXT NOT NULL, state_json TEXT NOT NULL, updated_crawl_id TEXT NOT NULL) STRICT`,
  `CREATE INDEX endpoints_by_model ON endpoints(model_slug)`,
  `CREATE INDEX endpoints_by_provider ON endpoints(provider_name)`,
  `CREATE TABLE endpoint_metrics (endpoint_id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, p50_latency REAL, p50_throughput REAL) STRICT`,
  `CREATE TABLE entity_events (event_id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, previous_crawl_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT NOT NULL, model_slug TEXT NOT NULL, provider_name TEXT, provider_slug TEXT, context_json TEXT NOT NULL) STRICT`,
  `CREATE INDEX events_by_crawl ON entity_events(crawl_id DESC)`,
  `CREATE INDEX events_by_model_crawl ON entity_events(model_slug, crawl_id DESC)`,
  `CREATE INDEX events_by_provider_crawl ON entity_events(provider_name, crawl_id DESC)`,
  `CREATE TABLE event_fields (event_id TEXT NOT NULL, ordinal INTEGER NOT NULL, path TEXT NOT NULL, before_present INTEGER NOT NULL, before_json TEXT, after_present INTEGER NOT NULL, after_json TEXT, PRIMARY KEY(event_id, ordinal), FOREIGN KEY(event_id) REFERENCES entity_events(event_id)) STRICT`,
  `CREATE INDEX event_fields_by_path ON event_fields(path, event_id)`,
] as const

export const initializeDatabase = Effect.fn('labs.initializeProductDatabase')(
  function* initializeDatabase() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`PRAGMA foreign_keys = ON`
    yield* sql`PRAGMA synchronous = NORMAL`
    for (const statement of statements) {
      yield* sql.unsafe(statement)
    }
  },
)
