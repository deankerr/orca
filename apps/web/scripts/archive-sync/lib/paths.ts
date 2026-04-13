import { readdir } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

const scriptDir = import.meta.dir
const defaultBaseOutputDir = resolve(scriptDir, '..', 'data')
const archivesDirName = 'archives'
const rawDirName = 'raw'
const latestBundleFileName = 'latest.bundle.json'
const manifestFileName = 'manifest.json'

type ArchiveGzipFile = { crawl_id: string; day: string }
type ArchiveJsonFile = { crawlId: string; day: string }

export type ArchiveSyncTarget = {
  cacheKey: string
  displayName: string
  httpOrigin: string
  input: string
}

export type ArchiveSyncPaths = {
  archivesDir: string
  latestBundleFileName: string
  latestBundlePath: string
  manifestPath: string
  rawDir: string
  rootDir: string
  archiveGzipFileName: (archive: ArchiveGzipFile) => string
  archiveGzipPath: (archive: ArchiveGzipFile) => string
  archiveJsonFileName: (archive: ArchiveJsonFile) => string
  archiveJsonPath: (archive: ArchiveJsonFile) => string
}

export type ArchiveSyncContext = {
  baseOutputDir: string
  paths: ArchiveSyncPaths
  target: ArchiveSyncTarget
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
}

function isDeploymentSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value)
}

function looksLikeImplicitHostedUrl(value: string): boolean {
  return value.endsWith('.convex.cloud') || value.endsWith('.convex.site')
}

function looksLikeImplicitLocalOrigin(value: string): boolean {
  return /^localhost(?::\d+)?$/i.test(value) || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(value)
}

function toUrlLikeTarget(value: string): string {
  if (hasScheme(value)) {
    return value
  }

  if (looksLikeImplicitHostedUrl(value)) {
    return `https://${value}`
  }

  if (looksLikeImplicitLocalOrigin(value)) {
    return `http://${value}`
  }

  throw new Error('Invalid target. Pass a deployment slug, hosted Convex URL, or local dev origin.')
}

function getHostedDeploymentSlug(hostname: string): string | null {
  if (hostname.endsWith('.convex.cloud')) {
    return hostname.slice(0, -'.convex.cloud'.length)
  }

  if (hostname.endsWith('.convex.site')) {
    return hostname.slice(0, -'.convex.site'.length)
  }

  return null
}

function sanitizeCacheKey(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  return sanitized === '' ? 'target' : sanitized
}

function resolveBaseOutputDir(outputDirArg?: string): string {
  if (outputDirArg === undefined || outputDirArg === '') {
    return defaultBaseOutputDir
  }

  return isAbsolute(outputDirArg) ? outputDirArg : resolve(process.cwd(), outputDirArg)
}

function createArchiveSyncPathsForRoot(rootDir: string): ArchiveSyncPaths {
  const archivesDir = resolve(rootDir, archivesDirName)
  const rawDir = resolve(rootDir, rawDirName)
  const manifestPath = resolve(rootDir, manifestFileName)
  const latestBundlePath = resolve(rawDir, latestBundleFileName)

  const archiveGzipFileName = (archive: ArchiveGzipFile) =>
    `${archive.day}__${archive.crawl_id}.bundle.json.gz`
  const archiveJsonFileName = (archive: ArchiveJsonFile) =>
    `${archive.day}__${archive.crawlId}.bundle.json`

  return {
    archivesDir,
    latestBundleFileName,
    latestBundlePath,
    manifestPath,
    rawDir,
    rootDir,
    archiveGzipFileName,
    archiveGzipPath: (archive) => resolve(archivesDir, archiveGzipFileName(archive)),
    archiveJsonFileName,
    archiveJsonPath: (archive) => resolve(rawDir, archiveJsonFileName(archive)),
  }
}

function resolveTarget(targetArg?: string): ArchiveSyncTarget {
  const input = targetArg ?? process.env.CONVEX_ARCHIVE_SYNC_TARGET_URL
  if (input === undefined || input === '') {
    throw new Error(
      'Missing target. Set CONVEX_ARCHIVE_SYNC_TARGET_URL or pass --target-url <target>.',
    )
  }

  const trimmedInput = input.trim()
  if (
    hasScheme(trimmedInput) ||
    looksLikeImplicitHostedUrl(trimmedInput) ||
    looksLikeImplicitLocalOrigin(trimmedInput)
  ) {
    const targetUrl = new URL(toUrlLikeTarget(trimmedInput))
    const hostedDeploymentSlug = getHostedDeploymentSlug(targetUrl.hostname)
    if (hostedDeploymentSlug !== null) {
      return {
        cacheKey: hostedDeploymentSlug,
        displayName: hostedDeploymentSlug,
        httpOrigin: `https://${hostedDeploymentSlug}.convex.site`,
        input: trimmedInput,
      }
    }

    return {
      cacheKey: sanitizeCacheKey(targetUrl.host),
      displayName: targetUrl.origin,
      httpOrigin: targetUrl.origin,
      input: trimmedInput,
    }
  }

  if (isDeploymentSlug(trimmedInput)) {
    return {
      cacheKey: trimmedInput,
      displayName: trimmedInput,
      httpOrigin: `https://${trimmedInput}.convex.site`,
      input: trimmedInput,
    }
  }

  throw new Error('Invalid target. Pass a deployment slug, hosted Convex URL, or local dev origin.')
}

async function isArchiveSyncCacheRoot(rootDir: string): Promise<boolean> {
  const paths = createArchiveSyncPathsForRoot(rootDir)

  const [archivesEntries, rawEntries] = await Promise.all([
    readdir(paths.archivesDir).catch(() => null),
    readdir(paths.rawDir).catch(() => null),
  ])

  return archivesEntries !== null && rawEntries !== null
}

export function resolveArchiveSyncContext(args: {
  outputDirArg?: string
  targetUrlArg?: string
}): ArchiveSyncContext {
  const baseOutputDir = resolveBaseOutputDir(args.outputDirArg)
  const target = resolveTarget(args.targetUrlArg)

  return {
    baseOutputDir,
    paths: createArchiveSyncPathsForRoot(resolve(baseOutputDir, target.cacheKey)),
    target,
  }
}

export async function resolveArchiveSyncPathsForUnzip(args: {
  outputDirArg?: string
  targetUrlArg?: string
}): Promise<ArchiveSyncPaths> {
  const explicitTarget = args.targetUrlArg ?? process.env.CONVEX_ARCHIVE_SYNC_TARGET_URL
  if (explicitTarget !== undefined && explicitTarget !== '') {
    return resolveArchiveSyncContext(args).paths
  }

  const baseOutputDir = resolveBaseOutputDir(args.outputDirArg)
  if (await isArchiveSyncCacheRoot(baseOutputDir)) {
    return createArchiveSyncPathsForRoot(baseOutputDir)
  }

  const subdirectories = await readdir(baseOutputDir, { withFileTypes: true }).catch(() => [])
  const candidateRoots = []

  for (const entry of subdirectories) {
    if (!entry.isDirectory()) {
      continue
    }

    const candidateRoot = resolve(baseOutputDir, entry.name)
    if (await isArchiveSyncCacheRoot(candidateRoot)) {
      candidateRoots.push(candidateRoot)
    }
  }

  if (candidateRoots.length === 1) {
    return createArchiveSyncPathsForRoot(candidateRoots[0])
  }

  if (candidateRoots.length === 0) {
    throw new Error(
      'No local archive-sync cache found. Pass --target-url <target> or point --output-dir at a specific cache directory.',
    )
  }

  throw new Error(
    'Multiple local archive-sync caches found. Pass --target-url <target> or point --output-dir at a specific cache directory.',
  )
}
