import { stat } from 'node:fs/promises'
import path from 'node:path'

import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { readSnapshotCrawls } from '../snapshot.ts'
import type { SnapshotCrawl } from '../snapshot.ts'
import { encodeGzipBundle } from './encoding.ts'
import { ensureBundleArchiveIndexes, initializeBundleArchive } from './schema.ts'
import { appendBundle } from './storage.ts'

const snapshotMetadataJson = (crawl: SnapshotCrawl) =>
  JSON.stringify({
    compressedBytes: crawl.compressedBytes,
    rawBytes: crawl.rawBytes,
    storageId: crawl.storageId,
    totals: crawl.totals,
  })

const reconcileSnapshotBundles = Effect.fn('labs.reconcileSnapshotBundles')(
  function* reconcileSnapshotBundles(selected: readonly SnapshotCrawl[], compressionLevel: number) {
    const sql = yield* SqlClient.SqlClient
    const stored = yield* sql<{
      compression_level: number
      crawl_id: string
      raw_bytes: number
      source_compressed_bytes: number
      source_kind: string
      source_metadata_json: string
      source_ref: string
    }>`SELECT crawl_id, source_kind, source_ref, source_metadata_json,
      source_compressed_bytes, raw_bytes, compression_level
      FROM bundles ORDER BY CAST(crawl_id AS INTEGER)`

    if (stored.length !== selected.length) {
      return yield* Effect.fail(
        new Error(
          `archive contains ${stored.length} bundles, but snapshot selection contains ${selected.length}`,
        ),
      )
    }
    for (const [index, crawl] of selected.entries()) {
      const row = stored[index]
      const sourceRef = path.join('_storage', crawl.storageId)
      if (
        row?.crawl_id !== crawl.crawlId ||
        row.source_kind !== 'snapshot' ||
        row.source_ref !== sourceRef ||
        row.source_metadata_json !== snapshotMetadataJson(crawl) ||
        row.source_compressed_bytes !== crawl.compressedBytes ||
        row.raw_bytes !== crawl.rawBytes ||
        row.compression_level !== compressionLevel
      ) {
        return yield* Effect.fail(
          new Error(`archive does not match snapshot selection at crawl ${crawl.crawlId}`),
        )
      }
    }
    return stored.length
  },
)

const encodeSnapshotBundle = Effect.fn('labs.encodeSnapshotBundle')(
  function* encodeSnapshotBundle(options: {
    readonly compressionLevel: number
    readonly crawl: SnapshotCrawl
    readonly snapshotDirectory: string
  }) {
    const sourceRef = path.join('_storage', options.crawl.storageId)
    const sourcePath = path.join(options.snapshotDirectory, sourceRef)
    const source = yield* Effect.tryPromise({
      catch: (cause) =>
        new Error(`could not read snapshot bundle ${options.crawl.crawlId}`, { cause }),
      try: async () => await Bun.file(sourcePath).bytes(),
    })
    return yield* encodeGzipBundle({
      compressionLevel: options.compressionLevel,
      crawlId: options.crawl.crawlId,
      expectedRawBytes: options.crawl.rawBytes,
      expectedSourceBytes: options.crawl.compressedBytes,
      source,
      sourceKind: 'snapshot',
      sourceMetadataJson: snapshotMetadataJson(options.crawl),
      sourceRef,
    })
  },
)

/**
 * Creates a new lossless archive from an extracted snapshot. Encoding and insertion are strictly
 * sequential so memory is bounded by one source bundle rather than an archive storage group.
 */
export const importSnapshotBundles = Effect.fn('labs.importSnapshotBundles')(
  function* importSnapshotBundles(options: {
    readonly compressionLevel: number
    readonly limit?: number
    readonly outputPath: string
    readonly resume?: boolean
    readonly snapshotDirectory: string
  }) {
    const outputExists = yield* Effect.tryPromise(async () => await stat(options.outputPath)).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    )
    if (options.resume === true) {
      if (!outputExists) {
        return yield* Effect.fail(
          new Error(`cannot resume missing bundle archive at ${options.outputPath}`),
        )
      }
    } else if (outputExists) {
      return yield* Effect.fail(new Error(`bundle archive already exists at ${options.outputPath}`))
    }
    const available = yield* readSnapshotCrawls(options.snapshotDirectory)
    const selected = options.limit === undefined ? available : available.slice(0, options.limit)

    const result = yield* Effect.gen(function* importWithDatabase() {
      if (outputExists) {
        const sql = yield* SqlClient.SqlClient
        const [integrity] = yield* sql<{ quick_check: string }>`PRAGMA quick_check`
        if (integrity?.quick_check !== 'ok') {
          return yield* Effect.fail(
            new Error('cannot resume archive that fails SQLite quick_check'),
          )
        }
        const metadata = yield* sql<{ key: string; value: string }>`SELECT key, value
          FROM archive_metadata WHERE key IN ('format', 'formatVersion')`
        const values = Object.fromEntries(metadata.map((item) => [item.key, item.value]))
        if (values.format !== 'orca-bundle-archive' || values.formatVersion !== '1') {
          return yield* Effect.fail(new Error('cannot resume an incompatible bundle archive'))
        }
        yield* ensureBundleArchiveIndexes()
      } else {
        yield* initializeBundleArchive()
        const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO archive_metadata ${sql.insert([
          { key: 'defaultCompressionLevel', value: String(options.compressionLevel) },
          { key: 'snapshotPath', value: path.resolve(options.snapshotDirectory) },
        ])}`
      }
      let compressedBytes = 0
      let completed = 0
      let existing = 0
      let inserted = 0
      let rawBytes = 0
      let sourceCompressedBytes = 0

      for (const crawl of selected) {
        const sql = yield* SqlClient.SqlClient
        const stored = yield* sql<{
          raw_bytes: number
          source_compressed_bytes: number
          source_ref: string
        }>`SELECT source_ref, source_compressed_bytes, raw_bytes FROM bundles
          WHERE crawl_id = ${crawl.crawlId}`
        const sourceRef = path.join('_storage', crawl.storageId)
        const [matching] = stored
        if (
          matching?.source_ref === sourceRef &&
          matching.source_compressed_bytes === crawl.compressedBytes &&
          matching.raw_bytes === crawl.rawBytes
        ) {
          completed += 1
          existing += 1
        } else {
          const bundle = yield* encodeSnapshotBundle({
            compressionLevel: options.compressionLevel,
            crawl,
            snapshotDirectory: options.snapshotDirectory,
          })
          const outcome = yield* appendBundle(bundle)
          if (outcome === 'inserted') {
            compressedBytes += bundle.compressedBytes
            inserted += 1
            rawBytes += bundle.rawBytes
            sourceCompressedBytes += bundle.sourceCompressedBytes
          } else {
            existing += 1
          }
          completed += 1
        }
        if (completed % 100 === 0 || completed === selected.length) {
          yield* Effect.logInfo('bundle archive progress').pipe(
            Effect.annotateLogs({ completed, existing, inserted, total: selected.length }),
          )
        }
      }
      const reconciled = yield* reconcileSnapshotBundles(selected, options.compressionLevel)
      const sql = yield* SqlClient.SqlClient
      yield* sql`PRAGMA wal_checkpoint(TRUNCATE)`
      return {
        completed,
        compressedBytes,
        existing,
        inserted,
        rawBytes,
        reconciled,
        sourceCompressedBytes,
      }
    }).pipe(Effect.provide(SqliteClient.layer({ filename: options.outputPath })), Effect.scoped)

    return result
  },
)
