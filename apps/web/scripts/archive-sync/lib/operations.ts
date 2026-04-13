import { mkdir, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

import prettyBytes from 'pretty-bytes'

import { resolveArchiveSyncContext, resolveArchiveSyncPathsForUnzip } from './paths'
import type { ArchiveSyncPaths, ArchiveSyncTarget } from './paths'
import { localBundleSchema, manifestSchema } from './schemas'
import type {
  LocalArchive,
  Manifest,
  ManifestArchive,
  RemoteArchive,
  SyncOptions,
  UnzipOptions,
} from './schemas'

const archiveFilePattern = /^(\d{4}-\d{2}-\d{2})__(\d+)\.bundle\.json\.gz$/

function byNewestCrawlIdDesc<T extends { crawlId: string }>(left: T, right: T): number {
  return Number(right.crawlId) - Number(left.crawlId)
}

function subtractUtcDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function parseArchiveFileName(fileName: string): RemoteArchive | null {
  const match = archiveFilePattern.exec(fileName)
  if (match === null) {
    return null
  }

  const [, day, crawlId] = match
  return {
    crawlId,
    day,
    fileName,
  }
}

async function ensureOutputDirectories(paths: ArchiveSyncPaths): Promise<void> {
  await mkdir(paths.rootDir, { recursive: true })
  await mkdir(paths.archivesDir, { recursive: true })
  await mkdir(paths.rawDir, { recursive: true })
}

async function loadManifest(paths: ArchiveSyncPaths): Promise<Manifest> {
  const file = Bun.file(paths.manifestPath)

  if (!(await file.exists())) {
    return {
      version: 1,
      targetUrl: null,
      archives: [],
      latest: null,
    }
  }

  const parsed = manifestSchema.parse(await file.json())
  return {
    version: 1,
    targetUrl: parsed.targetUrl,
    archives: parsed.archives,
    latest: parsed.latest ?? null,
  }
}

async function saveManifest(manifestPath: string, manifest: Manifest): Promise<void> {
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function listLocalArchives(paths: ArchiveSyncPaths): Promise<LocalArchive[]> {
  const entries = await readdir(paths.archivesDir, { withFileTypes: true }).catch(() => [])

  const archives = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const parsed = parseArchiveFileName(entry.name)
      if (parsed === null) {
        return null
      }

      return {
        absolutePath: resolve(paths.archivesDir, entry.name),
        crawlId: parsed.crawlId,
        day: parsed.day,
        fileGzip: relative(paths.rootDir, resolve(paths.archivesDir, entry.name)),
      } satisfies LocalArchive
    })
    .filter((archive): archive is LocalArchive => archive !== null)

  return archives.toSorted(byNewestCrawlIdDesc)
}

function buildArchiveSyncUrl(args: {
  target: ArchiveSyncTarget
  crawlId?: string
  day?: string
}): string {
  const url = new URL('/archive-sync/bundle.gz', args.target.httpOrigin)
  if (args.crawlId !== undefined) {
    url.searchParams.set('crawl_id', args.crawlId)
  }
  if (args.day !== undefined) {
    url.searchParams.set('day', args.day)
  }
  return url.toString()
}

function parseArchiveFromHeaders(response: Response): RemoteArchive {
  const contentDisposition = response.headers.get('content-disposition')
  if (contentDisposition === null) {
    throw new Error('Archive response is missing a Content-Disposition header')
  }

  const filenameMatch = /filename="([^"]+)"/i.exec(contentDisposition)
  if (filenameMatch === null) {
    throw new Error(`Archive response has an invalid filename header: ${contentDisposition}`)
  }

  const archive = parseArchiveFileName(filenameMatch[1])
  if (archive === null) {
    throw new Error(`Archive response filename is invalid: ${filenameMatch[1]}`)
  }

  return archive
}

async function discardResponseBody(response: Response): Promise<void> {
  if (response.body === null) {
    return
  }

  try {
    await response.body.cancel()
  } catch (error) {
    void error
  }
}

async function fetchArchiveResponse(args: {
  target: ArchiveSyncTarget
  crawlId?: string
  day?: string
}): Promise<Response | null> {
  const response = await fetch(
    buildArchiveSyncUrl({
      crawlId: args.crawlId,
      day: args.day,
      target: args.target,
    }),
  )

  if (response.status === 404) {
    await discardResponseBody(response)
    return null
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch archive bundle: ${response.status} ${response.statusText}`)
  }

  return response
}

async function fetchRemoteArchive(args: {
  target: ArchiveSyncTarget
  crawlId?: string
  day?: string
}): Promise<{ archive: RemoteArchive; response: Response } | null> {
  const response = await fetchArchiveResponse(args)
  if (response === null) {
    return null
  }

  const archive = parseArchiveFromHeaders(response)
  if (args.day !== undefined && archive.day !== args.day) {
    await discardResponseBody(response)
    throw new Error(`Archive response day mismatch: expected ${args.day}, got ${archive.day}`)
  }
  if (args.crawlId !== undefined && archive.crawlId !== args.crawlId) {
    await discardResponseBody(response)
    throw new Error(
      `Archive response crawl_id mismatch: expected ${args.crawlId}, got ${archive.crawlId}`,
    )
  }

  return {
    archive,
    response,
  }
}

async function inflateArchive(args: { archivePath: string; expectedCrawlId?: string }): Promise<{
  crawlId: string
  formattedJsonText: string
  formattedSizeBytes: number
}> {
  const compressed = await Bun.file(args.archivePath).arrayBuffer()
  const jsonText = gunzipSync(Buffer.from(compressed)).toString('utf-8')
  const parsedBundle = localBundleSchema.parse(JSON.parse(jsonText))

  if (args.expectedCrawlId !== undefined && parsedBundle.crawl_id !== args.expectedCrawlId) {
    throw new Error(
      `Archive crawl_id mismatch: expected ${args.expectedCrawlId}, got ${parsedBundle.crawl_id}`,
    )
  }

  const formattedJsonText = `${JSON.stringify(parsedBundle, null, 2)}\n`

  return {
    crawlId: parsedBundle.crawl_id,
    formattedJsonText,
    formattedSizeBytes: Buffer.byteLength(formattedJsonText, 'utf-8'),
  }
}

async function writeUnzippedArchive(args: {
  archivePath: string
  expectedCrawlId?: string
  outputPath: string
}): Promise<{
  crawlId: string
  outputPath: string
  formattedSizeBytes: number
}> {
  const inflated = await inflateArchive({
    archivePath: args.archivePath,
    expectedCrawlId: args.expectedCrawlId,
  })

  await Bun.write(args.outputPath, inflated.formattedJsonText)

  return {
    crawlId: inflated.crawlId,
    outputPath: args.outputPath,
    formattedSizeBytes: inflated.formattedSizeBytes,
  }
}

function buildManifest(args: {
  latest: Manifest['latest']
  downloadedAtByCrawlId: Map<string, string>
  localArchives: LocalArchive[]
  previous: Manifest
  targetUrl: string | null
}): Manifest {
  const previousByCrawlId = new Map(
    args.previous.archives.map((archive) => [archive.crawlId, archive]),
  )

  const archives: ManifestArchive[] = args.localArchives.map((localArchive) => {
    const previousArchive = previousByCrawlId.get(localArchive.crawlId)

    return {
      crawlId: localArchive.crawlId,
      day: localArchive.day,
      downloadedAt:
        args.downloadedAtByCrawlId.get(localArchive.crawlId) ??
        previousArchive?.downloadedAt ??
        null,
      fileGzip: localArchive.fileGzip,
    }
  })

  return {
    version: 1,
    targetUrl: args.targetUrl,
    archives,
    latest: args.latest,
  }
}

function logHeader(args: { days?: number; outputDir: string; targetUrl: string | null }) {
  console.log(`sync ${args.outputDir}`)
  if (args.targetUrl !== null) {
    console.log(`from ${args.targetUrl}`)
  }
  if (args.days !== undefined) {
    console.log(`days ${args.days}`)
  }
}

function logProgress(message: string) {
  console.log(message)
}

function selectLocalArchive(args: {
  crawlId?: string
  day?: string
  localArchives: LocalArchive[]
}): LocalArchive {
  if (args.crawlId !== undefined) {
    const match = args.localArchives.find((archive) => archive.crawlId === args.crawlId)
    if (!match) {
      throw new Error(`No local archive found for crawl_id ${args.crawlId}`)
    }

    return match
  }

  if (args.day !== undefined) {
    const matches = args.localArchives.filter((archive) => archive.day === args.day)
    if (matches.length === 0) {
      throw new Error(`No local archive found for day ${args.day}`)
    }

    return matches.toSorted(byNewestCrawlIdDesc)[0]
  }

  const [latest] = args.localArchives
  if (latest === undefined) {
    throw new Error('No local archives found. Run `bun run archive-sync` first.')
  }

  return latest
}

export async function runSync(options: SyncOptions): Promise<void> {
  const context = resolveArchiveSyncContext({
    outputDirArg: options.outputDir,
    targetUrlArg: options.targetUrl,
  })
  const { paths, target } = context

  await ensureOutputDirectories(paths)

  const previousManifest = await loadManifest(paths)
  const latestRemoteArchive = await fetchRemoteArchive({ target })
  if (latestRemoteArchive === null) {
    throw new Error('No remote archive bundle found.')
  }

  const targetDays = Array.from({ length: options.days }, (_, index) =>
    subtractUtcDays(latestRemoteArchive.archive.day, index),
  )

  logHeader({
    days: options.days,
    outputDir: paths.rootDir,
    targetUrl: target.httpOrigin,
  })

  const downloadedAtByCrawlId = new Map<string, string>()
  const selectedArchives: RemoteArchive[] = []

  for (const targetDay of targetDays) {
    const remoteArchive =
      targetDay === latestRemoteArchive.archive.day
        ? latestRemoteArchive
        : await fetchRemoteArchive({
            day: targetDay,
            target,
          })

    if (remoteArchive === null) {
      logProgress(`skip ${targetDay} (no full bundle found)`)
      continue
    }

    const { archive, response } = remoteArchive
    selectedArchives.push(archive)

    const archivePath = paths.archiveGzipPath({
      crawl_id: archive.crawlId,
      day: archive.day,
    })
    const fileGzip = relative(paths.rootDir, archivePath)
    const alreadyExists = await Bun.file(archivePath).exists()

    if (!options.force && alreadyExists) {
      await discardResponseBody(response)
      logProgress(`exists ${fileGzip}`)
      continue
    }

    if (!options.dryRun) {
      await Bun.write(archivePath, await response.arrayBuffer())
      downloadedAtByCrawlId.set(archive.crawlId, new Date().toISOString())
      logProgress(`create ${fileGzip}`)
      continue
    }

    await discardResponseBody(response)
    logProgress(`would create ${fileGzip}`)
  }

  let { latest } = previousManifest

  const [latestArchive] = selectedArchives
  if (!options.dryRun && latestArchive !== undefined) {
    const latestArchivePath = paths.archiveGzipPath({
      crawl_id: latestArchive.crawlId,
      day: latestArchive.day,
    })
    const latestArchiveFileGzip = relative(paths.rootDir, latestArchivePath)
    const unzipped = await writeUnzippedArchive({
      archivePath: latestArchivePath,
      expectedCrawlId: latestArchive.crawlId,
      outputPath: paths.latestBundlePath,
    })
    logProgress(
      `unzip ${latestArchiveFileGzip} -> ${relative(paths.rootDir, paths.latestBundlePath)} (${prettyBytes(unzipped.formattedSizeBytes)})`,
    )

    latest = {
      crawlId: unzipped.crawlId,
      fileJson: relative(paths.rootDir, paths.latestBundlePath),
      updatedAt: new Date().toISOString(),
    }
  } else if (options.dryRun && latestArchive !== undefined) {
    const latestArchiveFileGzip = relative(
      paths.rootDir,
      paths.archiveGzipPath({
        crawl_id: latestArchive.crawlId,
        day: latestArchive.day,
      }),
    )
    logProgress(
      `would unzip ${latestArchiveFileGzip} -> ${relative(paths.rootDir, paths.latestBundlePath)}`,
    )
  }

  const localArchives = await listLocalArchives(paths)
  const nextManifest = buildManifest({
    latest,
    downloadedAtByCrawlId,
    localArchives,
    previous: previousManifest,
    targetUrl: target.httpOrigin,
  })

  if (!options.dryRun) {
    await saveManifest(paths.manifestPath, nextManifest)
  }
}

export async function runUnzip(options: UnzipOptions): Promise<void> {
  if (options.crawlId !== undefined && options.day !== undefined) {
    throw new Error('Pass either --crawl-id or --day, not both.')
  }

  const paths = await resolveArchiveSyncPathsForUnzip({
    outputDirArg: options.outputDir,
    targetUrlArg: options.targetUrl,
  })

  await ensureOutputDirectories(paths)

  const localArchives = await listLocalArchives(paths)
  const selectedArchive = selectLocalArchive({
    crawlId: options.crawlId,
    day: options.day,
    localArchives,
  })
  const outputPath = paths.archiveJsonPath(selectedArchive)

  const unzipped = await writeUnzippedArchive({
    archivePath: selectedArchive.absolutePath,
    expectedCrawlId: selectedArchive.crawlId,
    outputPath,
  })

  logProgress(
    `unzip ${selectedArchive.fileGzip} -> ${relative(paths.rootDir, unzipped.outputPath)} (${prettyBytes(unzipped.formattedSizeBytes)})`,
  )
}
