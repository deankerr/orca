import { Database } from 'bun:sqlite'

import * as Schema from 'effect/Schema'

export interface RawBundle {
  bytes: Uint8Array
  crawlId: string
}

const StoredBundleRow = Schema.Struct({
  crawl_id: Schema.String,
  payload_zstd: Schema.Uint8Array,
  raw_sha256: Schema.String,
})
type StoredBundleRow = Schema.Schema.Type<typeof StoredBundleRow>

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown)
export type JsonRecord = Record<string, unknown>

const BundlePayload = Schema.Struct({
  data: Schema.Struct({
    models: Schema.Array(
      Schema.Struct({
        endpoints: Schema.Array(JsonRecord),
        model: JsonRecord,
      }),
    ),
  }),
})
export interface RawModelScope {
  endpoints: JsonRecord[]
  model: JsonRecord
}

const decodeRow = Schema.decodeUnknownSync(StoredBundleRow)
const decodePayload = Schema.decodeUnknownSync(Schema.fromJsonString(BundlePayload))

const sha256 = (bytes: Uint8Array) => {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(bytes)
  return hasher.digest('hex')
}

const decodeBundle = (row: StoredBundleRow): RawBundle => {
  const bytes = Bun.zstdDecompressSync(row.payload_zstd)

  if (sha256(bytes) !== row.raw_sha256) {
    throw new Error(`archive bundle ${row.crawl_id} raw digest does not match`)
  }

  return { bytes, crawlId: row.crawl_id }
}

const textDecoder = new TextDecoder('utf-8', { fatal: true })

/** Parses the raw bundle envelope needed to hand model scopes to the core materializer. */
export const validateBundle = (bytes: Uint8Array): RawModelScope[] =>
  decodePayload(textDecoder.decode(bytes)).data.models.map((scope) => ({
    endpoints: scope.endpoints.map((endpoint) => ({ ...endpoint })),
    model: { ...scope.model },
  }))

/**
 * Reads verified raw bundles in chronological order. This knows the archive format, but not how a
 * caller materializes or persists the bundles it receives.
 *
 * @yields {RawBundle} One verified raw bundle at a time.
 */
export function* readBundles(
  archivePath: string,
  afterCrawlId?: string,
): Generator<RawBundle, void, undefined> {
  const database = new Database(archivePath, { readonly: true })

  try {
    if (afterCrawlId === undefined) {
      const statement = database.query<StoredBundleRow, []>(`
        SELECT crawl_id, payload_zstd, raw_sha256
        FROM bundles
        ORDER BY CAST(crawl_id AS INTEGER)
      `)
      for (const row of statement.iterate()) {
        yield decodeBundle(decodeRow(row))
      }
    } else {
      const statement = database.query<StoredBundleRow, [string]>(`
        SELECT crawl_id, payload_zstd, raw_sha256
        FROM bundles
        WHERE CAST(crawl_id AS INTEGER) > CAST(? AS INTEGER)
        ORDER BY CAST(crawl_id AS INTEGER)
      `)
      for (const row of statement.iterate(afterCrawlId)) {
        yield decodeBundle(decodeRow(row))
      }
    }
  } finally {
    database.close()
  }
}
