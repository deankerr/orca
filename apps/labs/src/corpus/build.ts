import { mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { readSnapshotCrawls } from '../snapshot.ts'
import type { SnapshotCrawl } from '../snapshot.ts'
import { cleanBundle } from './clean.ts'
import { deduplicateModels } from './dedupe.ts'
import { encodeShard } from './storage.ts'
import type { CompressionLevel, CorpusCrawl, DropReason } from './types.ts'

/** Narrows the CLI's integer input to the Zstandard levels supported by Bun. */
export const isCompressionLevel = (value: number): value is CompressionLevel =>
  Number.isInteger(value) && value >= 0 && value <= 9

interface CorpusOptions {
  readonly compressionLevel: CompressionLevel
  readonly jobs: number
  readonly limit?: number
  readonly outputDirectory: string
  readonly overwrite: boolean
  readonly shardSize: number
  readonly snapshotDirectory: string
}

type Processed =
  | {
      readonly _tag: 'Accepted'
      readonly crawl: CorpusCrawl
      readonly sourceBytes: number
    }
  | {
      readonly _tag: 'Dropped'
      readonly crawlId: string
      readonly reason: DropReason
      readonly sourceBytes: number
    }

const decodeJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)

const processCrawl = Effect.fn('labs.processCorpusCrawl')(function* processCrawl(
  crawl: SnapshotCrawl,
  snapshotDirectory: string,
) {
  const sourcePath = path.join(snapshotDirectory, '_storage', crawl.storageId)
  const compressed = yield* Effect.tryPromise(async () => await Bun.file(sourcePath).bytes())
  const value = yield* Effect.try({
    catch: (cause) => new Error(`snapshot crawl ${crawl.crawlId} is not valid JSON`, { cause }),
    try: () => decodeJson(new TextDecoder().decode(Bun.gunzipSync(compressed))),
  })
  const result = cleanBundle(value)
  if (result._tag === 'Dropped') {
    return {
      _tag: 'Dropped',
      crawlId: crawl.crawlId,
      reason: result.reason,
      sourceBytes: crawl.compressedBytes,
    } satisfies Processed
  }
  return {
    _tag: 'Accepted',
    crawl: deduplicateModels(result.bundle),
    sourceBytes: crawl.compressedBytes,
  } satisfies Processed
})

const chunk = <A>(items: readonly A[], size: number): readonly (readonly A[])[] => {
  const chunks: A[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const directoryExists = async (directory: string) => {
  try {
    const entry = await stat(directory)
    return entry.isDirectory()
  } catch {
    return false
  }
}

/** Writes a clean, deduplicated, sharded corpus to an exact output directory. */
export const writeCorpus = Effect.fn('labs.writeCorpus')(function* writeCorpus(
  options: CorpusOptions,
) {
  // Resolve build inputs and destination
  const clock = yield* Clock.Clock
  const startedAt = clock.currentTimeMillisUnsafe()
  const available = yield* readSnapshotCrawls(options.snapshotDirectory)
  const crawls = options.limit === undefined ? available : available.slice(0, options.limit)
  const outputDirectory = path.resolve(options.outputDirectory)
  const temporaryDirectory = `${outputDirectory}.${crypto.randomUUID()}.tmp`
  const outputExists = yield* Effect.promise(async () => await directoryExists(outputDirectory))
  if (outputExists && !options.overwrite) {
    return yield* Effect.fail(
      new Error(`corpus already exists at ${outputDirectory}; use --overwrite to replace it`),
    )
  }

  yield* Effect.logInfo('building sharded corpus').pipe(
    Effect.annotateLogs({
      compressionLevel: options.compressionLevel,
      crawls: crawls.length,
      jobs: options.jobs,
      output: outputDirectory,
      shardSize: options.shardSize,
    }),
  )

  const build = Effect.gen(function* buildShards() {
    // Process chronological shards
    yield* Effect.tryPromise(
      async () => await mkdir(path.join(temporaryDirectory, 'shards'), { recursive: true }),
    )
    const dropped: Array<{
      crawlId: string
      reason: DropReason
      sourceBytes: number
    }> = []
    const shards: Array<{
      compressedBytes: number
      crawls: number
      digest: string
      file: string
      firstCrawlId: string
      lastCrawlId: string
      rawBytes: number
    }> = []
    let accepted = 0
    let completed = 0

    for (const sourceChunk of chunk(crawls, options.shardSize)) {
      const shardStartedAt = clock.currentTimeNanosUnsafe()
      // Effect concurrency overlaps the asynchronous blob reads. `gunzipSync`, JSON decoding and
      // the pure transforms still run on Bun's main thread; `jobs` is not a worker-pool size.
      const processed = yield* Effect.all(
        sourceChunk.map((crawl) => processCrawl(crawl, options.snapshotDirectory)),
        { concurrency: options.jobs },
      )
      const acceptedCrawls = processed.flatMap((item) =>
        item._tag === 'Accepted' ? [item.crawl] : [],
      )
      dropped.push(
        ...processed.flatMap((item) =>
          item._tag === 'Dropped'
            ? [
                {
                  crawlId: item.crawlId,
                  reason: item.reason,
                  sourceBytes: item.sourceBytes,
                },
              ]
            : [],
        ),
      )
      if (acceptedCrawls.length > 0) {
        const file = `${shards.length.toString().padStart(5, '0')}.ndjson.zst`
        const encoded = encodeShard(acceptedCrawls, options.compressionLevel)
        yield* Effect.tryPromise(
          async () => await Bun.write(path.join(temporaryDirectory, 'shards', file), encoded.bytes),
        )
        const hasher = new Bun.CryptoHasher('sha256')
        hasher.update(encoded.bytes)
        shards.push({
          compressedBytes: encoded.bytes.byteLength,
          crawls: acceptedCrawls.length,
          digest: hasher.digest('hex'),
          file,
          firstCrawlId: acceptedCrawls[0]?.crawlId ?? 'none',
          lastCrawlId: acceptedCrawls.at(-1)?.crawlId ?? 'none',
          rawBytes: encoded.rawBytes,
        })
        accepted += acceptedCrawls.length
      }
      completed += sourceChunk.length
      const shardDurationMs = Number(clock.currentTimeNanosUnsafe() - shardStartedAt) / 1_000_000
      yield* Effect.logInfo('corpus shard completed').pipe(
        Effect.annotateLogs({
          accepted: acceptedCrawls.length,
          crawls: sourceChunk.length,
          durationMs: Math.round(shardDurationMs),
          firstCrawlId: sourceChunk[0]?.crawlId ?? 'none',
          lastCrawlId: sourceChunk.at(-1)?.crawlId ?? 'none',
          shards: shards.length,
        }),
      )
      if (completed % 2560 === 0 || completed === crawls.length) {
        yield* Effect.logInfo('corpus progress').pipe(
          Effect.annotateLogs({
            accepted,
            completed,
            dropped: dropped.length,
            elapsedSeconds: Math.round((clock.currentTimeMillisUnsafe() - startedAt) / 1000),
            shards: shards.length,
            total: crawls.length,
          }),
        )
      }
    }

    // Write manifest and publish atomically
    const dropReasons = Object.fromEntries(
      [...new Set(dropped.map((item) => item.reason))]
        .toSorted()
        .map((reason) => [reason, dropped.filter((item) => item.reason === reason).length]),
    )
    const manifest = {
      codec: 'zstd',
      compressionLevel: options.compressionLevel,
      counts: { accepted, dropped: dropped.length },
      createdAt: new Date().toISOString(),
      dropReasons,
      dropped,
      format: 'orca-corpus',
      formatVersion: 2,
      shardSize: options.shardSize,
      shards,
      source: path.resolve(options.snapshotDirectory),
    }
    yield* Effect.tryPromise(
      async () =>
        await Bun.write(
          path.join(temporaryDirectory, 'manifest.json'),
          `${JSON.stringify(manifest, null, 2)}\n`,
        ),
    )
    if (outputExists) {
      yield* Effect.tryPromise(async () => {
        await rm(outputDirectory, { recursive: true })
      })
    }
    yield* Effect.tryPromise(async () => {
      await rename(temporaryDirectory, outputDirectory)
    })
    return {
      accepted,
      dropped: dropped.length,
      manifestPath: path.join(outputDirectory, 'manifest.json'),
      shards: shards.length,
    }
  })

  const result = yield* build.pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        await rm(temporaryDirectory, { force: true, recursive: true })
      }),
    ),
  )
  yield* Effect.logInfo('sharded corpus ready').pipe(
    Effect.annotateLogs({
      ...result,
      elapsedSeconds: Math.round((clock.currentTimeMillisUnsafe() - startedAt) / 1000),
    }),
  )
  return result
})
