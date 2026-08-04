import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Stream from 'effect/Stream'
import * as SqlClient from 'effect/unstable/sql/SqlClient'
import type { SqlError } from 'effect/unstable/sql/SqlError'

export interface EncodedBundle {
  readonly compressedBytes: number
  readonly compressionLevel: number
  readonly crawlId: string
  readonly payload: Uint8Array
  readonly rawBytes: number
  readonly rawSha256: string
  readonly sourceCompressedBytes: number
  readonly sourceKind: 'convex' | 'snapshot'
  readonly sourceMetadataJson: string
  readonly sourceRef: string
  readonly sourceSha256: string
}

export interface RawBundle {
  readonly bytes: Uint8Array
  readonly crawlId: string
  readonly rawSha256: string
  readonly sourceKind: 'convex' | 'snapshot'
  readonly sourceMetadataJson: string
  readonly sourceRef: string
}

interface StoredBundleRow {
  readonly compressed_bytes: number
  readonly compression_level: number
  readonly crawl_id: string
  readonly payload_zstd: Uint8Array | ArrayBuffer
  readonly raw_bytes: number
  readonly raw_sha256: string
  readonly source_compressed_bytes: number
  readonly source_kind: 'convex' | 'snapshot'
  readonly source_metadata_json: string
  readonly source_ref: string
  readonly source_sha256: string
}

const sha256 = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(bytes)
  return hasher.digest('hex')
}

const bytes = (value: Uint8Array | ArrayBuffer) =>
  value instanceof Uint8Array ? value : new Uint8Array(value)

const verifyRow = (row: StoredBundleRow) =>
  Effect.try({
    catch: (cause) =>
      new Error(`archive bundle ${row.crawl_id} failed zstd decompression`, { cause }),
    try: () => {
      const payload = bytes(row.payload_zstd)
      if (payload.byteLength !== row.compressed_bytes) {
        throw new Error(
          `archive bundle ${row.crawl_id} compressed size is ${payload.byteLength}, expected ${row.compressed_bytes}`,
        )
      }
      const raw = Bun.zstdDecompressSync(payload)
      if (raw.byteLength !== row.raw_bytes) {
        throw new Error(
          `archive bundle ${row.crawl_id} raw size is ${raw.byteLength}, expected ${row.raw_bytes}`,
        )
      }
      const digest = sha256(raw)
      if (digest !== row.raw_sha256) {
        throw new Error(`archive bundle ${row.crawl_id} raw digest does not match`)
      }
      return {
        bytes: raw,
        crawlId: row.crawl_id,
        rawSha256: row.raw_sha256,
        sourceKind: row.source_kind,
        sourceMetadataJson: row.source_metadata_json,
        sourceRef: row.source_ref,
      } satisfies RawBundle
    },
  })

/**
 * Appends one immutable encoded bundle. An identical crawl is an idempotent no-op; a crawl id with
 * different raw evidence fails instead of silently replacing history.
 */
export const appendBundle = Effect.fn('labs.appendArchiveBundle')(function* appendBundle(
  bundle: EncodedBundle,
) {
  const sql = yield* SqlClient.SqlClient
  const existing = yield* sql<{
    raw_sha256: string
  }>`SELECT raw_sha256 FROM bundles WHERE crawl_id = ${bundle.crawlId}`
  const [stored] = existing
  if (stored !== undefined) {
    if (stored.raw_sha256 !== bundle.rawSha256) {
      return yield* Effect.fail(
        new Error(`archive bundle ${bundle.crawlId} already exists with different evidence`),
      )
    }
    return 'existing' as const
  }

  yield* sql`INSERT INTO bundles ${sql.insert({
    compressed_bytes: bundle.compressedBytes,
    compression_level: bundle.compressionLevel,
    crawl_id: bundle.crawlId,
    payload_zstd: bundle.payload,
    raw_bytes: bundle.rawBytes,
    raw_sha256: bundle.rawSha256,
    source_compressed_bytes: bundle.sourceCompressedBytes,
    source_kind: bundle.sourceKind,
    source_metadata_json: bundle.sourceMetadataJson,
    source_ref: bundle.sourceRef,
    source_sha256: bundle.sourceSha256,
  })}`
  return 'inserted' as const
})

const nextStoredBundle = (after: string | undefined) =>
  Effect.gen(function* readNextStoredBundle() {
    const sql = yield* SqlClient.SqlClient
    const rows =
      after === undefined
        ? yield* sql<StoredBundleRow>`SELECT * FROM bundles ORDER BY CAST(crawl_id AS INTEGER) LIMIT 1`
        : yield* sql<StoredBundleRow>`SELECT * FROM bundles
            WHERE CAST(crawl_id AS INTEGER) > CAST(${after} AS INTEGER)
            ORDER BY CAST(crawl_id AS INTEGER) LIMIT 1`
    return rows[0]
  })

/** Streams verified raw bundle bytes in chronological order while retaining at most one payload. */
export const bundleArchive = Stream.paginate<
  string | undefined,
  RawBundle,
  Error | SqlError,
  SqlClient.SqlClient
>(undefined, (after) =>
  Effect.gen(function* readArchivePage() {
    const row = yield* nextStoredBundle(after)
    if (row === undefined) {
      return [[], Option.none<string | undefined>()] as readonly [
        readonly RawBundle[],
        Option.Option<string | undefined>,
      ]
    }
    const bundle = yield* verifyRow(row)
    return [[bundle], Option.some<string | undefined>(row.crawl_id)] as readonly [
      readonly RawBundle[],
      Option.Option<string | undefined>,
    ]
  }),
)

interface ArchiveCountRow {
  readonly compressed_bytes: number | null
  readonly crawls: number
  readonly first_crawl: string | null
  readonly last_crawl: string | null
  readonly raw_bytes: number | null
  readonly source_compressed_bytes: number | null
}

/** Reads bounded archive metadata without loading payload BLOBs. */
export const bundleArchiveSummary = Effect.fn('labs.bundleArchiveSummary')(
  function* bundleArchiveSummary() {
    const sql = yield* SqlClient.SqlClient
    const [counts] = yield* sql<ArchiveCountRow>`SELECT
      COUNT(*) AS crawls,
      CAST(MIN(CAST(crawl_id AS INTEGER)) AS TEXT) AS first_crawl,
      CAST(MAX(CAST(crawl_id AS INTEGER)) AS TEXT) AS last_crawl,
      SUM(source_compressed_bytes) AS source_compressed_bytes,
      SUM(raw_bytes) AS raw_bytes,
      SUM(compressed_bytes) AS compressed_bytes
      FROM bundles`
    const metadata = yield* sql<{ key: string; value: string }>`SELECT key, value
      FROM archive_metadata ORDER BY key`
    if (counts === undefined) {
      return yield* Effect.fail(new Error('could not summarize bundle archive'))
    }
    return {
      compressedBytes: counts.compressed_bytes ?? 0,
      crawls: counts.crawls,
      metadata: Object.fromEntries(metadata.map((item) => [item.key, item.value])),
      range: {
        first: counts.first_crawl,
        last: counts.last_crawl,
      },
      rawBytes: counts.raw_bytes ?? 0,
      sourceCompressedBytes: counts.source_compressed_bytes ?? 0,
    }
  },
)

/** Verifies SQLite integrity plus every stored payload's size and raw digest. */
export const verifyBundleArchive = Effect.fn('labs.verifyBundleArchive')(
  function* verifyBundleArchive() {
    const sql = yield* SqlClient.SqlClient
    const integrity = yield* sql<{ integrity_check: string }>`PRAGMA integrity_check`
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
      return yield* Effect.fail(new Error('bundle archive failed SQLite integrity_check'))
    }
    yield* Effect.logInfo('SQLite archive integrity verified')
    const summary = yield* bundleArchiveSummary()
    const verified = yield* bundleArchive.pipe(
      Stream.runFoldEffect(
        () => ({ crawls: 0, rawBytes: 0 }),
        (total, bundle) => {
          const next = {
            crawls: total.crawls + 1,
            rawBytes: total.rawBytes + bundle.bytes.byteLength,
          }
          if (next.crawls % 500 !== 0 && next.crawls !== summary.crawls) {
            return Effect.succeed(next)
          }
          return Effect.logInfo('bundle archive verification progress').pipe(
            Effect.annotateLogs({ completed: next.crawls, total: summary.crawls }),
            Effect.as(next),
          )
        },
      ),
    )
    if (verified.crawls !== summary.crawls || verified.rawBytes !== summary.rawBytes) {
      return yield* Effect.fail(
        new Error('bundle archive stream does not match its stored summary'),
      )
    }
    return { ...verified, compressedBytes: summary.compressedBytes }
  },
)
