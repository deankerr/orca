import {
  CURATED_SOURCE_DIR,
  LOBEHUB_AVATAR_SOURCE_DIR,
  LOBEHUB_COLOR_SOURCE_DIR,
  REMOTE_SOURCE_DIR,
} from '../constants'
import { displayPath, packagePath } from './paths'
import { collectLobehubLogos } from './sources/lobehub'
import { collectLocalColorLogos } from './sources/local'
import type { ColorSourceSummary, CatalogLogo, LogoAsset, LogoCatalog, LogoSource } from './types'

type ColorSource = {
  source: LogoSource
  candidates: LogoAsset[]
}

export async function buildCatalog(): Promise<LogoCatalog> {
  const lobehub = await collectLobehubLogos({
    avatarDir: packagePath(LOBEHUB_AVATAR_SOURCE_DIR),
    colorDir: packagePath(LOBEHUB_COLOR_SOURCE_DIR),
  })

  const colorSources: ColorSource[] = [
    { candidates: lobehub.colors, source: 'lobehub' },
    {
      candidates: await collectLocalColorLogos({
        source: 'curated',
        sourceDir: packagePath(CURATED_SOURCE_DIR),
      }),
      source: 'curated',
    },
    {
      candidates: await collectLocalColorLogos({
        source: 'remote',
        sourceDir: packagePath(REMOTE_SOURCE_DIR),
      }),
      source: 'remote',
    },
  ]

  const colorWinners = chooseColorLogos(colorSources)
  const logos = mergeLogos({ avatars: lobehub.avatars, colors: colorWinners.colors })

  return {
    colorSourceSummaries: summarizeColorSources(colorSources, colorWinners.used),
    logos,
  }
}

function chooseColorLogos(colorSources: ColorSource[]): {
  colors: LogoAsset[]
  used: Set<LogoAsset>
} {
  const colorsByKey = new Map<string, LogoAsset>()
  const used = new Set<LogoAsset>()

  for (const colorSource of colorSources) {
    for (const candidate of colorSource.candidates) {
      if (colorsByKey.has(candidate.key)) {
        continue
      }

      colorsByKey.set(candidate.key, candidate)
      used.add(candidate)
    }
  }

  return {
    colors: [...colorsByKey.values()],
    used,
  }
}

function mergeLogos(args: { avatars: LogoAsset[]; colors: LogoAsset[] }): CatalogLogo[] {
  const byKey = new Map<string, CatalogLogo>()

  for (const color of args.colors) {
    byKey.set(color.key, { color, key: color.key })
  }

  for (const avatar of args.avatars) {
    const logo = byKey.get(avatar.key) ?? { key: avatar.key }
    logo.avatar = avatar
    byKey.set(avatar.key, logo)
  }

  return [...byKey.values()].toSorted((a, b) => a.key.localeCompare(b.key))
}

function summarizeColorSources(
  colorSources: ColorSource[],
  usedCandidates: Set<LogoAsset>,
): ColorSourceSummary[] {
  return colorSources.map(({ candidates, source }) => {
    const unusedPaths = candidates
      .filter((candidate) => !usedCandidates.has(candidate))
      .map((candidate) => displayPath(candidate.sourcePath))
      .toSorted()

    return {
      source,
      total: candidates.length,
      unused: unusedPaths.length,
      unusedPaths,
      used: candidates.length - unusedPaths.length,
    }
  })
}
