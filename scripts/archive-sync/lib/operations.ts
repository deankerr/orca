import { mkdir, readdir } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

import prettyBytes from 'pretty-bytes'

import { resolveArchiveSyncContext, resolveArchiveSyncPathsForUnzip } from './paths'
import type { ArchiveSyncPaths, ArchiveSyncTarget } from './paths'
import { dailyArchivesResponseSchema, localBundleSchema, manifestSchema } from './schemas'
import type {
  DailyArchive,
  DailyArchiveEntry,
  LocalArchive,
  Manifest,
  ManifestArchive,
  SyncOptions,
  UnzipOptions,
} from './schemas'

const localArchiveFilePattern = /^(\d{4}-\d{2}-\d{2})__(\d+)\.bundle\.json\.gz$/

function byNewestCrawlIdDesc<T extends { crawlId: string }>(left: T, right: T): number {
  return Number(right.crawlId) - Number(left.crawlId)
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
      const match = localArchiveFilePattern.exec(entry.name)
      if (match === null) {
        return null
      }

      const [, day, crawlId] = match
      return {
        absolutePath: resolve(paths.archivesDir, entry.name),
        crawlId,
        day,
        fileGzip: relative(paths.rootDir, resolve(paths.archivesDir, entry.name)),
      } satisfies LocalArchive
    })
    .filter((archive): archive is LocalArchive => archive !== null)

  return archives.toSorted(byNewestCrawlIdDesc)
}

async function fetchDailyArchives(args: {
  days: number
  target: ArchiveSyncTarget
}): Promise<DailyArchiveEntry[]> {
  const response = await fetch(`${args.target.httpOrigin}/archive-sync/daily?days=${args.days}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch daily archives: ${response.status} ${response.statusText}`)
  }

  return dailyArchivesResponseSchema.parse(await response.json())
}

function isAvailableDailyArchive(entry: DailyArchiveEntry): entry is DailyArchive {
  return entry.status === 'available'
}

async function downloadArchiveBlob(args: {
  archive: DailyArchive
  paths: ArchiveSyncPaths
  target: ArchiveSyncTarget
}): Promise<string> {
  const response = await fetch(
    `${args.target.httpOrigin}/archive-sync/bundle.gz?crawl_id=${encodeURIComponent(args.archive.crawl_id)}`,
  )
  if (!response.ok) {
    throw new Error(
      `Failed to fetch archive blob for ${args.archive.crawl_id}: ${response.status} ${response.statusText}`,
    )
  }

  const archivePath = args.paths.archiveGzipPath(args.archive)
  await Bun.write(archivePath, await response.arrayBuffer())
  return archivePath
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
  selectedDailyArchives: DailyArchive[]
  targetUrl: string | null
}): Manifest {
  const previousByCrawlId = new Map(
    args.previous.archives.map((archive) => [archive.crawlId, archive]),
  )
  const selectedByCrawlId = new Map(
    args.selectedDailyArchives.map((archive) => [archive.crawl_id, archive]),
  )

  const archives: ManifestArchive[] = args.localArchives.map((localArchive) => {
    const previousArchive = previousByCrawlId.get(localArchive.crawlId)
    const selectedArchive = selectedByCrawlId.get(localArchive.crawlId)

    return {
      crawlId: localArchive.crawlId,
      day: localArchive.day,
      downloadedAt:
        args.downloadedAtByCrawlId.get(localArchive.crawlId) ??
        previousArchive?.downloadedAt ??
        null,
      fileGzip: localArchive.fileGzip,
      size: selectedArchive?.size ?? previousArchive?.size ?? null,
      totals: selectedArchive?.totals ?? previousArchive?.totals ?? null,
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
  const dailyArchiveEntries = await fetchDailyArchives({
    days: options.days,
    target,
  })
  const availableDailyArchives = dailyArchiveEntries.filter(isAvailableDailyArchive)

  logHeader({
    days: options.days,
    outputDir: paths.rootDir,
    targetUrl: target.httpOrigin,
  })

  const downloadedAtByCrawlId = new Map<string, string>()

  for (const archiveEntry of dailyArchiveEntries) {
    if (!isAvailableDailyArchive(archiveEntry)) {
      logProgress(`skip ${archiveEntry.day} (no full bundle found)`)
      continue
    }

    const archive = archiveEntry
    const archivePath = paths.archiveGzipPath(archive)
    const fileGzip = relative(paths.rootDir, archivePath)
    const alreadyExists = await Bun.file(archivePath).exists()

    if (!options.force && alreadyExists) {
      logProgress(`exists ${fileGzip}`)
      continue
    }

    if (!options.dryRun) {
      await downloadArchiveBlob({
        archive,
        paths,
        target,
      })
      downloadedAtByCrawlId.set(archive.crawl_id, new Date().toISOString())
      logProgress(`create ${fileGzip}`)
      continue
    }

    logProgress(`would create ${fileGzip}`)
  }

  let { latest } = previousManifest

  const [latestArchive] = availableDailyArchives
  if (!options.dryRun && latestArchive !== undefined) {
    const latestArchiveFileGzip = relative(paths.rootDir, paths.archiveGzipPath(latestArchive))
    const unzipped = await writeUnzippedArchive({
      archivePath: paths.archiveGzipPath(latestArchive),
      expectedCrawlId: latestArchive.crawl_id,
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
    const latestArchiveFileGzip = relative(paths.rootDir, paths.archiveGzipPath(latestArchive))
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
    selectedDailyArchives: availableDailyArchives,
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
