import { SQL } from 'bun'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SchemaIssue from 'effect/SchemaIssue'
import * as SchemaTransformation from 'effect/SchemaTransformation'

export interface RawBundle {
  readonly bytes: Uint8Array
  readonly crawlId: string
}

const StoredBundleRow = Schema.Struct({
  compressed_bytes: Schema.Number,
  crawl_id: Schema.String,
  payload_zstd: Schema.Uint8Array,
  raw_bytes: Schema.Number,
  raw_sha256: Schema.String,
})
type StoredBundleRow = Schema.Schema.Type<typeof StoredBundleRow>

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown)
export type JsonRecord = Schema.Schema.Type<typeof JsonRecord>

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

const decodeRows = Schema.decodeUnknownSync(Schema.Array(StoredBundleRow))
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const textEncoder = new TextEncoder()

const decodePayload = Schema.decodeUnknownSync(
  Schema.Uint8Array.pipe(
    Schema.decodeTo(
      Schema.fromJsonString(BundlePayload),
      SchemaTransformation.transformOrFail({
        decode: (bytes) =>
          Effect.try({
            catch: () =>
              new SchemaIssue.InvalidValue(Option.some(bytes), {
                message: 'expected valid UTF-8 bytes',
              }),
            try: () => textDecoder.decode(bytes),
          }),
        encode: (json) => Effect.succeed(textEncoder.encode(json)),
      }),
    ),
  ),
)

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

/** Decodes the model scopes needed by the area-2 projection from one raw bundle payload. */
export const validateBundle = (bytes: Uint8Array) => decodePayload(bytes).data.models

/**
 * Reads and verifies a bounded chronological slice of an area-1 bundle archive.
 *
 * @yields {RawBundle} One verified raw bundle in chronological order.
 */
export async function* readBundles(
  archivePath: string,
  limit: number,
  fromCrawlId?: string,
): AsyncGenerator<RawBundle> {
  const sql = new SQL({ adapter: 'sqlite', filename: archivePath, readonly: true })

  try {
    const rows = decodeRows(
      await (fromCrawlId === undefined
        ? sql`
      SELECT crawl_id, compressed_bytes, payload_zstd, raw_bytes, raw_sha256
      FROM bundles
      ORDER BY CAST(crawl_id AS INTEGER)
      LIMIT ${limit}
    `
        : sql`
      SELECT crawl_id, compressed_bytes, payload_zstd, raw_bytes, raw_sha256
      FROM bundles
      WHERE CAST(crawl_id AS INTEGER) >= CAST(${fromCrawlId} AS INTEGER)
      ORDER BY CAST(crawl_id AS INTEGER)
      LIMIT ${limit}
    `),
    )

    for (const row of rows) {
      yield decodeBundle(row)
    }
  } finally {
    await sql.close()
  }
}
