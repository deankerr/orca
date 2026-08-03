import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import * as Effect from 'effect/Effect'

export const DEFAULT_EXPORT_DIRECTORY = '.archive-work/snapshot'
export const DEFAULT_WORK_DIRECTORY = '.archive-work'
export const SOURCE_SNAPSHOT = 'snapshot_dependable-husky-550_1785591526028192052.zip'

export interface CrawlArchive {
  readonly crawl_id: string
  readonly data: {
    readonly size: { readonly blob: number; readonly raw: number }
    readonly totals: Readonly<Record<string, number>>
  }
  readonly storage_id: string
}

export class ArchiveError extends Error {
  readonly _tag = 'ArchiveError'

  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ArchiveError'
  }
}

export const attempt = <A>(label: string, action: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) => new ArchiveError(`${label}: ${String(cause)}`, cause),
    try: action,
  })

export const inspect = (exportDirectory: string) =>
  attempt('inspect extracted archive', async () => {
    const rootEntries = await readdir(exportDirectory, { withFileTypes: true })
    const storageEntries = await readdir(`${exportDirectory}/_storage`, { withFileTypes: true })
    const crawls = await readCrawlsPromise(exportDirectory)

    const tableDirectories = rootEntries.filter(
      (entry) => entry.isDirectory() && entry.name !== '_storage',
    )
    const tableChecks = await Promise.all(
      tableDirectories.map(async (entry) => {
        const documents = Bun.file(`${exportDirectory}/${entry.name}/documents.jsonl`)
        return (await documents.exists()) ? entry.name : undefined
      }),
    )

    return {
      crawlRows: crawls.length,
      storageBlobs: storageEntries.filter(
        (entry) => entry.isFile() && entry.name !== 'documents.jsonl',
      ).length,
      tables: tableChecks.filter((name) => name !== undefined).toSorted(),
    }
  })

const readCrawlsPromise = async (exportDirectory: string) => {
  const path = `${exportDirectory}/snapshot_crawl_archives/documents.jsonl`
  const text = await Bun.file(path).text()

  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index): CrawlArchive => {
      try {
        return decodeCrawl(JSON.parse(line))
      } catch (error) {
        throw new ArchiveError(`invalid crawl row at ${path}:${index + 1}`, error)
      }
    })
    .toSorted((left, right) => Number(left.crawl_id) - Number(right.crawl_id))
}

export const readCrawls = (exportDirectory: string) =>
  attempt('read crawl archive table', async () => await readCrawlsPromise(exportDirectory))

export const materialize = Effect.fn(function* materialize(
  exportDirectory: string,
  workDirectory: string,
  crawlId: string,
) {
  const crawls = yield* readCrawls(exportDirectory)
  const crawl = crawls.find((candidate) => candidate.crawl_id === crawlId)

  if (crawl === undefined) {
    return yield* Effect.fail(new ArchiveError(`crawl ${crawlId} does not exist`))
  }

  const compressedPath = `${exportDirectory}/_storage/${crawl.storage_id}`
  const jsonPath = `${workDirectory}/crawls/${crawl.crawl_id}.json`
  const source = Bun.file(compressedPath)

  if (!(yield* Effect.promise(async () => await source.exists()))) {
    return yield* Effect.fail(new ArchiveError(`storage blob ${crawl.storage_id} does not exist`))
  }

  yield* attempt('create crawl work directory', async () => {
    await mkdir(`${workDirectory}/crawls`, { recursive: true })
  })
  yield* attempt(`decompress ${compressedPath}`, async () => {
    await pipeline(createReadStream(compressedPath), createGunzip(), createWriteStream(jsonPath))
  })

  return { compressedPath, crawl, jsonPath }
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const decodeCrawl = (value: unknown): CrawlArchive => {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.size)) {
    throw new ArchiveError('expected a crawl archive object')
  }

  const { crawl_id: crawlId, storage_id: storageId } = value
  const { blob, raw } = value.data.size
  const { totals } = value.data

  if (
    typeof crawlId !== 'string' ||
    typeof storageId !== 'string' ||
    typeof blob !== 'number' ||
    typeof raw !== 'number' ||
    !isRecord(totals)
  ) {
    throw new ArchiveError('crawl archive fields have unexpected types')
  }

  const numericTotals: Record<string, number> = {}
  for (const [name, total] of Object.entries(totals)) {
    if (typeof total !== 'number') {
      throw new ArchiveError(`crawl total ${name} is not a number`)
    }
    numericTotals[name] = total
  }

  return {
    crawl_id: crawlId,
    data: { size: { blob, raw }, totals: numericTotals },
    storage_id: storageId,
  }
}
