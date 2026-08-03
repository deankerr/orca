import path from 'node:path'

import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import type { CompressionLevel, CorpusCrawl } from './types.ts'

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown)
const CorpusCrawlSchema = Schema.Struct({
  crawlId: Schema.String,
  endpoints: Schema.Array(
    Schema.Struct({
      data: JsonRecord,
      modelSlug: Schema.String,
    }),
  ),
  models: Schema.Array(JsonRecord),
})
const decodeCrawl = Schema.decodeUnknownSync(Schema.fromJsonString(CorpusCrawlSchema))

const ManifestSchema = Schema.fromJsonString(
  Schema.Struct({
    codec: Schema.Literal('zstd'),
    compressionLevel: Schema.Number,
    counts: Schema.Struct({ accepted: Schema.Number, dropped: Schema.Number }),
    createdAt: Schema.String,
    dropReasons: Schema.Record(Schema.String, Schema.Number),
    dropped: Schema.Array(
      Schema.Struct({ crawlId: Schema.String, reason: Schema.String, sourceBytes: Schema.Number }),
    ),
    format: Schema.Literal('orca-corpus'),
    formatVersion: Schema.Literal(2),
    shardSize: Schema.Number,
    shards: Schema.Array(
      Schema.Struct({
        compressedBytes: Schema.Number,
        crawls: Schema.Number,
        digest: Schema.String,
        file: Schema.String,
        firstCrawlId: Schema.String,
        lastCrawlId: Schema.String,
        rawBytes: Schema.Number,
      }),
    ),
    source: Schema.String,
  }),
)
const decodeManifest = Schema.decodeUnknownSync(ManifestSchema)
export type CorpusManifest = Schema.Schema.Type<typeof ManifestSchema>
type CorpusShard = CorpusManifest['shards'][number]

export const encodeShard = (
  crawls: readonly CorpusCrawl[],
  compressionLevel: CompressionLevel,
): { readonly bytes: Uint8Array; readonly rawBytes: number } => {
  const text = `${crawls.map((crawl) => JSON.stringify(crawl)).join('\n')}\n`
  return {
    bytes: Bun.zstdCompressSync(new TextEncoder().encode(text), { level: compressionLevel }),
    rawBytes: Buffer.byteLength(text),
  }
}

export const readCorpusManifest = Effect.fn('labs.readCorpusManifest')(function* readCorpusManifest(
  directory: string,
) {
  const manifestPath = path.join(directory, 'manifest.json')
  const text = yield* Effect.tryPromise(async () => await Bun.file(manifestPath).text())
  return yield* Effect.try({
    catch: (cause) => new Error(`unsupported corpus manifest at ${manifestPath}`, { cause }),
    try: () => decodeManifest(text),
  })
})

const readShard = Effect.fn('labs.readCorpusShard')(function* readShard(
  directory: string,
  shard: CorpusShard,
) {
  const shardPath = path.join(directory, 'shards', shard.file)
  const compressed = yield* Effect.tryPromise(async () => await Bun.file(shardPath).bytes())
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(compressed)
  if (compressed.byteLength !== shard.compressedBytes || hasher.digest('hex') !== shard.digest) {
    return yield* Effect.fail(new Error(`corpus shard failed integrity check: ${shardPath}`))
  }
  const text = yield* Effect.try({
    catch: (cause) => new Error(`could not decompress corpus shard ${shardPath}`, { cause }),
    try: () => new TextDecoder().decode(Bun.zstdDecompressSync(compressed)),
  })
  const crawls = yield* Effect.try({
    catch: (cause) => new Error(`invalid corpus shard ${shardPath}`, { cause }),
    try: () =>
      text
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => decodeCrawl(line)),
  })
  if (
    crawls.length !== shard.crawls ||
    crawls[0]?.crawlId !== shard.firstCrawlId ||
    crawls.at(-1)?.crawlId !== shard.lastCrawlId
  ) {
    return yield* Effect.fail(new Error(`corpus shard index does not match contents: ${shardPath}`))
  }
  return crawls
})

export const corpusCrawls = (directory: string) =>
  Stream.unwrap(
    readCorpusManifest(directory).pipe(
      Effect.map((manifest) =>
        Stream.fromIterable(manifest.shards).pipe(
          Stream.mapEffect((shard) => readShard(directory, shard)),
          Stream.flatMap((crawls) => Stream.fromIterable(crawls)),
        ),
      ),
    ),
  )
