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
  readonly windows?: readonly CorpusWindow[]
}

export interface CorpusWindow {
  readonly count: number
  readonly offset: number
}

interface CrawlTelemetry {
  cleanMs: number
  decodeTextMs: number
  deduplicateMs: number
  gunzipMs: number
  parseMs: number
  readMs: number
}

type Processed =
  | {
      readonly _tag: 'Accepted'
      readonly crawl: CorpusCrawl
      readonly sourceBytes: number
      readonly telemetry: CrawlTelemetry
    }
  | {
      readonly _tag: 'Dropped'
      readonly crawlId: string
      readonly reason: DropReason
      readonly sourceBytes: number
      readonly telemetry: CrawlTelemetry
    }

const decodeJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)

const processCrawl = Effect.fn('labs.processCorpusCrawl')(function* processCrawl(
  crawl: SnapshotCrawl,
  snapshotDirectory: string,
) {
  const sourcePath = path.join(snapshotDirectory, '_storage', crawl.storageId)
  const readStartedAt = Bun.nanoseconds()
  const compressed = yield* Effect.tryPromise(async () => await Bun.file(sourcePath).bytes())
  const readCompletedAt = Bun.nanoseconds()
  const gunzipStartedAt = Bun.nanoseconds()
  const uncompressed = Bun.gunzipSync(compressed)
  const gunzipCompletedAt = Bun.nanoseconds()
  const decodeStartedAt = Bun.nanoseconds()
  const text = new TextDecoder().decode(uncompressed)
  const decodeCompletedAt = Bun.nanoseconds()
  const parseStartedAt = Bun.nanoseconds()
  const value = yield* Effect.try({
    catch: (cause) => new Error(`snapshot crawl ${crawl.crawlId} is not valid JSON`, { cause }),
    try: () => decodeJson(text),
  })
  const parseCompletedAt = Bun.nanoseconds()
  const cleanStartedAt = Bun.nanoseconds()
  const result = cleanBundle(value)
  const cleanCompletedAt = Bun.nanoseconds()
  const baseTelemetry = {
    cleanMs: (cleanCompletedAt - cleanStartedAt) / 1_000_000,
    decodeTextMs: (decodeCompletedAt - decodeStartedAt) / 1_000_000,
    gunzipMs: (gunzipCompletedAt - gunzipStartedAt) / 1_000_000,
    parseMs: (parseCompletedAt - parseStartedAt) / 1_000_000,
    readMs: (readCompletedAt - readStartedAt) / 1_000_000,
  }
  if (result._tag === 'Dropped') {
    return {
      _tag: 'Dropped',
      crawlId: crawl.crawlId,
      reason: result.reason,
      sourceBytes: crawl.compressedBytes,
      telemetry: { ...baseTelemetry, deduplicateMs: 0 },
    } satisfies Processed
  }
  const deduplicateStartedAt = Bun.nanoseconds()
  const deduplicated = deduplicateModels(result.bundle)
  const deduplicateCompletedAt = Bun.nanoseconds()
  return {
    _tag: 'Accepted',
    crawl: deduplicated,
    sourceBytes: crawl.compressedBytes,
    telemetry: {
      ...baseTelemetry,
      deduplicateMs: (deduplicateCompletedAt - deduplicateStartedAt) / 1_000_000,
    },
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

const selectCrawls = (
  available: readonly SnapshotCrawl[],
  limit: number | undefined,
  windows: readonly CorpusWindow[] | undefined,
) => {
  if (windows !== undefined) {
    return windows.flatMap(({ count, offset }) => available.slice(offset, offset + count))
  }
  return limit === undefined ? available : available.slice(0, limit)
}

const sumTelemetry = (processed: readonly Processed[]) => {
  const total: CrawlTelemetry = {
    cleanMs: 0,
    decodeTextMs: 0,
    deduplicateMs: 0,
    gunzipMs: 0,
    parseMs: 0,
    readMs: 0,
  }
  for (const item of processed) {
    total.cleanMs += item.telemetry.cleanMs
    total.decodeTextMs += item.telemetry.decodeTextMs
    total.deduplicateMs += item.telemetry.deduplicateMs
    total.gunzipMs += item.telemetry.gunzipMs
    total.parseMs += item.telemetry.parseMs
    total.readMs += item.telemetry.readMs
  }
  return total
}

const resourceSnapshot = () => ({ memory: process.memoryUsage(), usage: process.resourceUsage() })

const resourceDelta = (
  before: ReturnType<typeof resourceSnapshot>,
  after: ReturnType<typeof resourceSnapshot>,
) => ({
  arrayBuffersBytes: after.memory.arrayBuffers,
  externalBytes: after.memory.external,
  fsRead: after.usage.fsRead - before.usage.fsRead,
  fsWrite: after.usage.fsWrite - before.usage.fsWrite,
  heapUsedBytes: after.memory.heapUsed,
  involuntaryContextSwitches:
    after.usage.involuntaryContextSwitches - before.usage.involuntaryContextSwitches,
  majorPageFaults: after.usage.majorPageFault - before.usage.majorPageFault,
  maxRssBytes: after.usage.maxRSS,
  minorPageFaults: after.usage.minorPageFault - before.usage.minorPageFault,
  rssBytes: after.memory.rss,
  systemCpuMs: (after.usage.systemCPUTime - before.usage.systemCPUTime) / 1000,
  userCpuMs: (after.usage.userCPUTime - before.usage.userCPUTime) / 1000,
  voluntaryContextSwitches:
    after.usage.voluntaryContextSwitches - before.usage.voluntaryContextSwitches,
})

/** Writes a clean, deduplicated, sharded corpus to an exact output directory. */
export const writeCorpus = Effect.fn('labs.writeCorpus')(function* writeCorpus(
  options: CorpusOptions,
) {
  // Resolve build inputs and destination
  const clock = yield* Clock.Clock
  const startedAt = clock.currentTimeMillisUnsafe()
  const available = yield* readSnapshotCrawls(options.snapshotDirectory)
  const crawls = selectCrawls(available, options.limit, options.windows)
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
      windows: options.windows ?? null,
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
    let peakRssBytes = 0
    const stageTotalsMs = {
      clean: 0,
      decodeText: 0,
      deduplicate: 0,
      encode: 0,
      gunzip: 0,
      hash: 0,
      parse: 0,
      read: 0,
      write: 0,
    }

    for (const sourceChunk of chunk(crawls, options.shardSize)) {
      const shardStartedAt = clock.currentTimeNanosUnsafe()
      const resourcesBefore = resourceSnapshot()
      // Effect concurrency overlaps the asynchronous blob reads. `gunzipSync`, JSON decoding and
      // the pure transforms still run on Bun's main thread; `jobs` is not a worker-pool size.
      const processed = yield* Effect.all(
        sourceChunk.map((crawl) => processCrawl(crawl, options.snapshotDirectory)),
        { concurrency: options.jobs },
      )
      const crawlStages = sumTelemetry(processed)
      const acceptedCrawls = processed.flatMap((item) =>
        item._tag === 'Accepted' ? [item.crawl] : [],
      )
      let encodeMs = 0
      let hashMs = 0
      let writeMs = 0
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
        const encodeStartedAt = Bun.nanoseconds()
        const encoded = encodeShard(acceptedCrawls, options.compressionLevel)
        encodeMs = (Bun.nanoseconds() - encodeStartedAt) / 1_000_000
        const writeStartedAt = Bun.nanoseconds()
        yield* Effect.tryPromise(
          async () => await Bun.write(path.join(temporaryDirectory, 'shards', file), encoded.bytes),
        )
        writeMs = (Bun.nanoseconds() - writeStartedAt) / 1_000_000
        const hashStartedAt = Bun.nanoseconds()
        const hasher = new Bun.CryptoHasher('sha256')
        hasher.update(encoded.bytes)
        const digest = hasher.digest('hex')
        hashMs = (Bun.nanoseconds() - hashStartedAt) / 1_000_000
        stageTotalsMs.encode += encodeMs
        stageTotalsMs.write += writeMs
        stageTotalsMs.hash += hashMs
        shards.push({
          compressedBytes: encoded.bytes.byteLength,
          crawls: acceptedCrawls.length,
          digest,
          file,
          firstCrawlId: acceptedCrawls[0]?.crawlId ?? 'none',
          lastCrawlId: acceptedCrawls.at(-1)?.crawlId ?? 'none',
          rawBytes: encoded.rawBytes,
        })
        accepted += acceptedCrawls.length
      }
      completed += sourceChunk.length
      stageTotalsMs.clean += crawlStages.cleanMs
      stageTotalsMs.decodeText += crawlStages.decodeTextMs
      stageTotalsMs.deduplicate += crawlStages.deduplicateMs
      stageTotalsMs.gunzip += crawlStages.gunzipMs
      stageTotalsMs.parse += crawlStages.parseMs
      stageTotalsMs.read += crawlStages.readMs
      const shardDurationMs = Number(clock.currentTimeNanosUnsafe() - shardStartedAt) / 1_000_000
      const resources = resourceDelta(resourcesBefore, resourceSnapshot())
      peakRssBytes = Math.max(peakRssBytes, resources.maxRssBytes, resources.rssBytes)
      yield* Effect.logInfo('corpus shard completed').pipe(
        Effect.annotateLogs({
          accepted: acceptedCrawls.length,
          crawls: sourceChunk.length,
          durationMs: Math.round(shardDurationMs),
          firstCrawlId: sourceChunk[0]?.crawlId ?? 'none',
          lastCrawlId: sourceChunk.at(-1)?.crawlId ?? 'none',
          resources,
          shards: shards.length,
          stageWorkMs: {
            clean: Math.round(crawlStages.cleanMs),
            decodeText: Math.round(crawlStages.decodeTextMs),
            deduplicate: Math.round(crawlStages.deduplicateMs),
            encode: Math.round(encodeMs),
            gunzip: Math.round(crawlStages.gunzipMs),
            hash: Math.round(hashMs),
            parse: Math.round(crawlStages.parseMs),
            read: Math.round(crawlStages.readMs),
            write: Math.round(writeMs),
          },
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
      peakRssBytes,
      shards: shards.length,
      stageTotalsMs: Object.fromEntries(
        Object.entries(stageTotalsMs).map(([name, duration]) => [name, Math.round(duration)]),
      ),
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
