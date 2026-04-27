import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import sharp from 'sharp'

import {
  CURATED_SOURCE_DIR,
  LOBEHUB_COLOR_SOURCE_DIR,
  PUBLIC_COLOR_DIR,
  REMOTE_SOURCE_DIR,
} from './constants'
import { normalizeLogoKey } from './keys'
import type { LogoEntry } from './manifest'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

type SourceName = 'lobehub' | 'curated' | 'remote'
type Candidate = { key: string; source: SourceName; sourcePath: string }

export type ColorSourceSummary = {
  source: SourceName
  total: number
  used: number
  unused: number
  unusedPaths: string[]
}

export type ColorBuildResult = {
  logos: LogoEntry[]
  sourceSummaries: ColorSourceSummary[]
}

const GLOB_PATTERN = '*.{png,jpg,jpeg,svg,webp}'

async function collectDir(source: SourceName, sourceDir: string): Promise<Candidate[]> {
  const glob = new Bun.Glob(GLOB_PATTERN)
  const candidates: Candidate[] = []

  for await (const file of glob.scan({ cwd: sourceDir })) {
    candidates.push({ key: normalizeLogoKey(file), source, sourcePath: join(sourceDir, file) })
  }

  return candidates
}

async function collectLobehub(source: SourceName, sourceDir: string): Promise<Candidate[]> {
  const glob = new Bun.Glob(GLOB_PATTERN)
  const byEntity = new Map<string, Candidate>()

  for await (const file of glob.scan({ cwd: sourceDir })) {
    const baseName = file.replace(/\.(png|jpe?g|svg|webp)$/i, '')
    const dashIndex = baseName.indexOf('-')

    const entityName = dashIndex === -1 ? baseName : baseName.slice(0, dashIndex)
    const variant = dashIndex === -1 ? '' : baseName.slice(dashIndex + 1)

    if (variant !== '' && variant !== 'color') {
      continue
    }

    const entityKey = normalizeLogoKey(entityName)
    const isColor = variant === 'color'

    const existing = byEntity.get(entityKey)
    if (isColor || !existing) {
      byEntity.set(entityKey, { key: entityKey, source, sourcePath: join(sourceDir, file) })
    }
  }

  return [...byEntity.values()]
}

const COLOR_SOURCES = [
  { collect: collectLobehub, name: 'lobehub', path: LOBEHUB_COLOR_SOURCE_DIR },
  { collect: collectDir, name: 'curated', path: CURATED_SOURCE_DIR },
  { collect: collectDir, name: 'remote', path: REMOTE_SOURCE_DIR },
] satisfies Array<{
  collect: (source: SourceName, sourceDir: string) => Promise<Candidate[]>
  name: SourceName
  path: string
}>

function relativeSourcePath(sourcePath: string): string {
  return sourcePath.replace(`${PACKAGE_ROOT}/`, '')
}

function createSourceSummaries(used: Candidate[], unused: Candidate[]): ColorSourceSummary[] {
  return COLOR_SOURCES.map(({ name }) => {
    const usedCount = used.filter((candidate) => candidate.source === name).length
    const unusedPaths = unused
      .filter((candidate) => candidate.source === name)
      .map((candidate) => relativeSourcePath(candidate.sourcePath))
      .toSorted()

    return {
      source: name,
      total: usedCount + unusedPaths.length,
      unused: unusedPaths.length,
      unusedPaths,
      used: usedCount,
    }
  })
}

type ColorCatalog = {
  catalog: Map<string, Candidate>
  sourceSummaries: ColorSourceSummary[]
}

async function collectAll(): Promise<ColorCatalog> {
  const catalog = new Map<string, Candidate>()
  const used: Candidate[] = []
  const unused: Candidate[] = []

  for (const source of COLOR_SOURCES) {
    const sourceDir = join(PACKAGE_ROOT, source.path)
    const candidates = await source.collect(source.name, sourceDir)

    for (const candidate of candidates) {
      if (catalog.has(candidate.key)) {
        unused.push(candidate)
        continue
      }

      catalog.set(candidate.key, candidate)
      used.push(candidate)
    }
  }

  return {
    catalog,
    sourceSummaries: createSourceSummaries(used, unused),
  }
}

async function emitPng(sourcePath: string, outputPath: string): Promise<void> {
  if (sourcePath.toLowerCase().endsWith('.png')) {
    const bytes = await Bun.file(sourcePath).arrayBuffer()
    await Bun.write(outputPath, bytes)
    return
  }

  await sharp(sourcePath).png().toFile(outputPath)
}

async function emitColorDir(catalog: Map<string, Candidate>): Promise<LogoEntry[]> {
  const publicColorDir = join(PACKAGE_ROOT, PUBLIC_COLOR_DIR)
  await rm(publicColorDir, { force: true, recursive: true })
  await mkdir(publicColorDir, { recursive: true })

  const logos: LogoEntry[] = []

  for (const [key, candidate] of [...catalog].toSorted((a, b) => a[0].localeCompare(b[0]))) {
    await emitPng(candidate.sourcePath, join(publicColorDir, `${key}.png`))
    logos.push({ color: 'png', key })
  }

  return logos
}

export async function buildColorLogos(): Promise<ColorBuildResult> {
  const { catalog, sourceSummaries } = await collectAll()
  return {
    logos: await emitColorDir(catalog),
    sourceSummaries,
  }
}

if (import.meta.main) {
  const { logos } = await buildColorLogos()
  console.log(`Wrote ${logos.length} color logos to apps/web/public/logos/color/`)
}
