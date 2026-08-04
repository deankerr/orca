import { stat } from 'node:fs/promises'

import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { readSnapshotCrawls } from '../bundle-archive/import-snapshot.ts'
import { bundleArchiveSummary } from '../bundle-archive/storage.ts'

const range = (ids: readonly string[]) => ({ first: ids[0] ?? null, last: ids.at(-1) ?? null })

/** Summarizes a raw archive without loading any compressed bundle payload. */
export const archiveMetrics = Effect.fn('labs.archiveMetrics')(function* archiveMetrics(
  archivePath: string,
) {
  const summary = yield* bundleArchiveSummary()
  const archiveStat = yield* Effect.tryPromise(async () => await stat(archivePath))
  return {
    ...summary,
    bytes: archiveStat.size,
    compressionRatio:
      summary.compressedBytes === 0 ? null : summary.rawBytes / summary.compressedBytes,
    sourceCompressionRatio:
      summary.sourceCompressedBytes === 0 ? null : summary.rawBytes / summary.sourceCompressedBytes,
  }
})

/** Summarizes extracted snapshot metadata without decompressing any stored crawl blob. */
export const snapshotMetrics = Effect.fn('labs.snapshotMetrics')(function* snapshotMetrics(
  snapshotDirectory: string,
) {
  const crawls = yield* readSnapshotCrawls(snapshotDirectory)
  const totals: Record<string, number> = {}
  for (const crawl of crawls) {
    for (const [key, value] of Object.entries(crawl.totals)) {
      totals[key] = (totals[key] ?? 0) + value
    }
  }

  return {
    compressedBytes: crawls.reduce((total, crawl) => total + crawl.compressedBytes, 0),
    crawls: crawls.length,
    obviousEmptyCatalogs: crawls.filter((crawl) => crawl.totals.models === 0).length,
    range: range(crawls.map((crawl) => crawl.crawlId)),
    rawBytes: crawls.reduce((total, crawl) => total + crawl.rawBytes, 0),
    totals,
  }
})

interface CountRow {
  readonly crawls: number
  readonly endpoints: number
  readonly events: number
  readonly fields: number
  readonly first_crawl: string | null
  readonly last_crawl: string | null
  readonly metrics: number
  readonly models: number
}

/** Queries the bounded aggregate characteristics needed to understand a product database. */
export const databaseMetrics = Effect.fn('labs.databaseMetrics')(function* databaseMetrics(
  databasePath: string,
) {
  const sql = yield* SqlClient.SqlClient
  const [counts] = yield* sql<CountRow>`SELECT
    (SELECT COUNT(*) FROM crawls) AS crawls,
    (SELECT COUNT(*) FROM models) AS models,
    (SELECT COUNT(*) FROM endpoints) AS endpoints,
    (SELECT COUNT(*) FROM endpoint_metrics) AS metrics,
    (SELECT COUNT(*) FROM entity_events) AS events,
    (SELECT COUNT(*) FROM event_fields) AS fields,
    (SELECT MIN(crawl_id) FROM crawls) AS first_crawl,
    (SELECT MAX(crawl_id) FROM crawls) AS last_crawl`
  if (counts === undefined) {
    return yield* Effect.fail(new Error(`database is empty: ${databasePath}`))
  }

  const eventDistribution = yield* sql<{
    count: number
    entity_type: string
    event_type: string
  }>`SELECT entity_type, event_type, COUNT(*) AS count
     FROM entity_events GROUP BY entity_type, event_type ORDER BY entity_type, event_type`
  const topFieldPaths = yield* sql<{
    changes: number
    path: string
  }>`SELECT path, COUNT(*) AS changes
    FROM event_fields GROUP BY path ORDER BY changes DESC, path LIMIT 10`
  const metadata = yield* sql<{ key: string; value: string }>`SELECT key, value
    FROM database_metadata ORDER BY key`
  const databaseStat = yield* Effect.tryPromise(async () => await stat(databasePath))

  return {
    bytes: databaseStat.size,
    crawls: counts.crawls,
    endpoints: counts.endpoints,
    eventDistribution,
    events: counts.events,
    fields: counts.fields,
    metadata: Object.fromEntries(metadata.map((item) => [item.key, item.value])),
    metrics: counts.metrics,
    models: counts.models,
    range: { first: counts.first_crawl, last: counts.last_crawl },
    topFieldPaths,
  }
})
