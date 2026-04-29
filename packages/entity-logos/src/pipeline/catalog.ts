import {
  AVATAR_SOURCE_DIR,
  CURATED_SOURCE_DIR,
  LOBEHUB_AVATAR_SOURCE_DIR,
  LOBEHUB_COLOR_SOURCE_DIR,
  REMOTE_SOURCE_DIR,
} from '../constants'
import { displayPath, packagePath } from './paths'
import { collectLobehubLogos } from './sources/lobehub'
import { collectLocalLogos } from './sources/local'
import type { CatalogLogo, LogoAsset, LogoCatalog, LogoSource, LogoSourceSummary } from './types'

type AssetSource = {
  source: LogoSource
  candidates: LogoAsset[]
}

export async function buildCatalog(): Promise<LogoCatalog> {
  const lobehub = await collectLobehubLogos({
    avatarDir: packagePath(LOBEHUB_AVATAR_SOURCE_DIR),
    colorDir: packagePath(LOBEHUB_COLOR_SOURCE_DIR),
  })

  const avatarSources: AssetSource[] = [
    {
      candidates: await collectLocalLogos({
        source: 'avatar',
        sourceDir: packagePath(AVATAR_SOURCE_DIR),
      }),
      source: 'avatar',
    },
    { candidates: lobehub.avatars, source: 'lobehub' },
  ]

  const colorSources: AssetSource[] = [
    { candidates: lobehub.colors, source: 'lobehub' },
    {
      candidates: await collectLocalLogos({
        source: 'curated',
        sourceDir: packagePath(CURATED_SOURCE_DIR),
      }),
      source: 'curated',
    },
    {
      candidates: await collectLocalLogos({
        source: 'remote',
        sourceDir: packagePath(REMOTE_SOURCE_DIR),
      }),
      source: 'remote',
    },
  ]

  const avatarWinners = chooseLogos(avatarSources)
  const colorWinners = chooseLogos(colorSources)
  const logos = mergeLogos({ avatars: avatarWinners.logos, colors: colorWinners.logos })

  return {
    avatarSourceSummaries: summarizeSources(avatarSources, avatarWinners.used),
    colorSourceSummaries: summarizeSources(colorSources, colorWinners.used),
    logos,
  }
}

function chooseLogos(sources: AssetSource[]): {
  logos: LogoAsset[]
  used: Set<LogoAsset>
} {
  const logosByKey = new Map<string, LogoAsset>()
  const used = new Set<LogoAsset>()

  for (const source of sources) {
    for (const candidate of source.candidates) {
      if (logosByKey.has(candidate.key)) {
        continue
      }

      logosByKey.set(candidate.key, candidate)
      used.add(candidate)
    }
  }

  return {
    logos: [...logosByKey.values()],
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

function summarizeSources(
  sources: AssetSource[],
  usedCandidates: Set<LogoAsset>,
): LogoSourceSummary[] {
  return sources.map(({ candidates, source }) => {
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
