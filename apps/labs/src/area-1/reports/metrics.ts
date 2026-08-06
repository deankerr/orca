import { stat } from 'node:fs/promises'

import * as Effect from 'effect/Effect'

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
