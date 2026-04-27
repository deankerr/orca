import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { buildAvatarLogos } from './avatar-logos'
import { buildColorLogos } from './color-logos'
import type { ColorSourceSummary } from './color-logos'
import { PACKAGE_OUTPUT_MANIFEST } from './constants'
import type { LogoEntry, LogoManifest } from './manifest'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const MANIFEST_PATH = join(PACKAGE_ROOT, PACKAGE_OUTPUT_MANIFEST)

async function emitManifest(logos: LogoEntry[]): Promise<void> {
  await mkdir(dirname(MANIFEST_PATH), { recursive: true })
  await Bun.write(MANIFEST_PATH, `${JSON.stringify({ logos } as LogoManifest, null, 2)}\n`)
}

function printUnusedColorLogos(sourceSummaries: ColorSourceSummary[]): void {
  const summariesWithUnused = sourceSummaries.filter((summary) => summary.unusedPaths.length > 0)

  if (summariesWithUnused.length === 0) {
    console.log('Unused color logos: none')
    return
  }

  console.log('Unused color logos:')
  for (const summary of summariesWithUnused) {
    console.log(`  ${summary.source} (${summary.unusedPaths.length})`)
    for (const path of summary.unusedPaths) {
      console.log(`    ${path}`)
    }
  }
}

function printBuildStats(logos: LogoEntry[], args: { colorSources: ColorSourceSummary[] }): void {
  const avatarCount = logos.filter((logo) => logo.avatar === 'webp').length
  const colorCount = logos.filter((logo) => logo.color === 'png').length
  const completeCount = logos.filter(
    (logo) => logo.avatar === 'webp' && logo.color === 'png',
  ).length
  const avatarOnlyCount = logos.filter(
    (logo) => logo.avatar === 'webp' && logo.color !== 'png',
  ).length
  const colorOnlyCount = logos.filter(
    (logo) => logo.color === 'png' && logo.avatar !== 'webp',
  ).length

  console.log('Logo build summary')
  console.log(`  Manifest logos: ${logos.length}`)
  console.log(`  Avatar assets: ${avatarCount}`)
  console.log(`  Color assets: ${colorCount}`)
  console.log(`  Complete entries: ${completeCount}`)
  console.log(`  Avatar-only entries: ${avatarOnlyCount}`)
  console.log(`  Color-only entries: ${colorOnlyCount}`)
  console.log('Color sources, priority order:')

  for (const summary of args.colorSources) {
    console.log(
      `  ${summary.source}: ${summary.used} used, ${summary.unused} unused, ${summary.total} total`,
    )
  }

  console.log(`Avatar source: lobehub-avatar: ${avatarCount} used, 0 unused, ${avatarCount} total`)
  printUnusedColorLogos(args.colorSources)
}

export async function build(): Promise<void> {
  const colorResult = await buildColorLogos()
  const avatarLogos = await buildAvatarLogos()

  const byKey = new Map<string, LogoEntry>()

  for (const logo of colorResult.logos) {
    byKey.set(logo.key, logo)
  }

  for (const logo of avatarLogos) {
    const existing = byKey.get(logo.key)
    if (existing) {
      existing.avatar = logo.avatar
    } else {
      byKey.set(logo.key, logo)
    }
  }

  const logos = [...byKey.values()].toSorted((a, b) => a.key.localeCompare(b.key))
  await emitManifest(logos)
  printBuildStats(logos, { colorSources: colorResult.sourceSummaries })
}
