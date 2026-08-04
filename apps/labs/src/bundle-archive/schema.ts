import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

const numericCrawlIndex = `CREATE INDEX IF NOT EXISTS bundles_crawl_id_integer
  ON bundles(CAST(crawl_id AS INTEGER))`

const statements = [
  `CREATE TABLE archive_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`,
  `CREATE TABLE bundles (
    crawl_id TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('convex', 'snapshot')),
    source_ref TEXT NOT NULL,
    source_metadata_json TEXT NOT NULL,
    source_compressed_bytes INTEGER NOT NULL CHECK (source_compressed_bytes >= 0),
    source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
    raw_bytes INTEGER NOT NULL CHECK (raw_bytes >= 0),
    raw_sha256 TEXT NOT NULL CHECK (length(raw_sha256) = 64),
    compression_level INTEGER NOT NULL,
    compressed_bytes INTEGER NOT NULL CHECK (compressed_bytes >= 0),
    payload_zstd BLOB NOT NULL
  ) STRICT`,
  numericCrawlIndex,
  `CREATE TRIGGER bundles_are_immutable_before_update
    BEFORE UPDATE ON bundles BEGIN
      SELECT RAISE(ABORT, 'bundle archive rows are immutable');
    END`,
  `CREATE TRIGGER bundles_are_immutable_before_delete
    BEFORE DELETE ON bundles BEGIN
      SELECT RAISE(ABORT, 'bundle archive rows are immutable');
    END`,
] as const

/** Adds compatible derived indexes to an existing version-one archive. */
export const ensureBundleArchiveIndexes = Effect.fn('labs.ensureBundleArchiveIndexes')(
  function* ensureBundleArchiveIndexes() {
    const sql = yield* SqlClient.SqlClient
    yield* sql.unsafe(numericCrawlIndex)
  },
)

/** Initializes an empty version-one raw bundle archive and its immutable row guards. */
export const initializeBundleArchive = Effect.fn('labs.initializeBundleArchive')(
  function* initializeBundleArchive() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`PRAGMA synchronous = NORMAL`
    for (const statement of statements) {
      yield* sql.unsafe(statement)
    }
    yield* sql`INSERT INTO archive_metadata ${sql.insert([
      { key: 'codec', value: 'zstd' },
      { key: 'format', value: 'orca-bundle-archive' },
      { key: 'formatVersion', value: '1' },
    ])}`
    yield* sql`PRAGMA user_version = 1`
  },
)
