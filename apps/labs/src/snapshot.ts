import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'

import * as Effect from 'effect/Effect'

export interface SnapshotCrawl {
  readonly crawlId: string
  readonly rawBytes: number
  readonly compressedBytes: number
  readonly storageId: string
  readonly totals: Readonly<Record<string, number>>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const decodeCrawl = (value: unknown): SnapshotCrawl => {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.size)) {
    throw new Error('expected a snapshot crawl row')
  }
  const { totals } = value.data
  if (
    typeof value.crawl_id !== 'string' ||
    typeof value.storage_id !== 'string' ||
    typeof value.data.size.blob !== 'number' ||
    typeof value.data.size.raw !== 'number' ||
    !isRecord(totals)
  ) {
    throw new Error('snapshot crawl row has unexpected fields')
  }
  const numericTotals: Record<string, number> = {}
  for (const [name, total] of Object.entries(totals)) {
    if (typeof total !== 'number') {
      throw new TypeError(`snapshot crawl total ${name} is not numeric`)
    }
    numericTotals[name] = total
  }
  return {
    compressedBytes: value.data.size.blob,
    crawlId: value.crawl_id,
    rawBytes: value.data.size.raw,
    storageId: value.storage_id,
    totals: numericTotals,
  }
}

export const readSnapshotCrawls = Effect.fn('labs.readSnapshotCrawls')(function* readSnapshotCrawls(
  directory: string,
) {
  const metadataPath = path.join(directory, 'snapshot_crawl_archives', 'documents.jsonl')
  const text = yield* Effect.tryPromise(async () => await Bun.file(metadataPath).text())
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return decodeCrawl(JSON.parse(line))
      } catch {
        throw new Error(`invalid snapshot metadata at ${metadataPath}:${index + 1}`)
      }
    })
    .toSorted((left, right) => Number(left.crawlId) - Number(right.crawlId))
})

/**
 * Confirms that an extracted snapshot contains its crawl metadata and every storage blob it
 * references. Extra storage entries are allowed because Convex exports include their own metadata.
 */
export const validateExtractedSnapshot = Effect.fn('labs.validateExtractedSnapshot')(
  function* validateExtractedSnapshot(directory: string) {
    const crawls = yield* readSnapshotCrawls(directory)
    const storageEntries = yield* Effect.tryPromise(
      async () => await readdir(path.join(directory, '_storage')),
    )
    const availableStorageIds = new Set(storageEntries)
    const missingStorageIds = crawls
      .map((crawl) => crawl.storageId)
      .filter((storageId) => !availableStorageIds.has(storageId))

    if (missingStorageIds.length > 0) {
      const preview = missingStorageIds.slice(0, 3).join(', ')
      yield* Effect.fail(
        new Error(
          `extracted snapshot is missing ${missingStorageIds.length} referenced storage blobs: ${preview}`,
        ),
      )
    }

    return { crawls: crawls.length, storageEntries: storageEntries.length }
  },
)

/** Extracts only the metadata and stored crawl blobs needed by Labs from an immutable export ZIP. */
export const extractSnapshotFiles = Effect.fn('labs.extractSnapshotFiles')(
  function* extractSnapshotFiles(options: {
    readonly outputDirectory: string
    readonly snapshotPath: string
  }) {
    yield* Effect.tryPromise(async () => await mkdir(options.outputDirectory, { recursive: true }))
    yield* Effect.logInfo('extracting snapshot').pipe(
      Effect.annotateLogs({ output: options.outputDirectory, snapshot: options.snapshotPath }),
    )
    const process = Bun.spawn(
      [
        'unzip',
        '-q',
        '-n',
        options.snapshotPath,
        'snapshot_crawl_archives/documents.jsonl',
        '_storage/*',
        '-d',
        options.outputDirectory,
      ],
      { stderr: 'inherit', stdout: 'inherit' },
    )
    const exitCode = yield* Effect.promise(async () => await process.exited)
    if (exitCode !== 0 && exitCode !== 2) {
      yield* Effect.fail(new Error(`unzip exited with status ${exitCode}`))
    }
    const validation = yield* validateExtractedSnapshot(options.outputDirectory)
    if (exitCode === 2) {
      yield* Effect.logWarning('unzip reported a format error, but extraction is complete').pipe(
        Effect.annotateLogs({ exitCode }),
      )
    }
    yield* Effect.logInfo('snapshot ready').pipe(
      Effect.annotateLogs({ blobs: validation.storageEntries, output: options.outputDirectory }),
    )
  },
)
