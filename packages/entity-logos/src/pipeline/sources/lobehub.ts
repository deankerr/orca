import { join } from 'node:path'

import { normalizeLogoKey } from '../../logo-key'
import type { LogoAsset } from '../types'

type LobeHubPaths = {
  avatarDir: string
  colorDir: string
}

type LobeHubLogos = {
  avatars: LogoAsset[]
  colors: LogoAsset[]
}

const COLOR_ICON_PATTERN = '*.{png,jpg,jpeg,svg,webp}'

export async function collectLobehubLogos(paths: LobeHubPaths): Promise<LobeHubLogos> {
  const avatars = await collectLobehubAvatars(paths.avatarDir)
  const colors = await collectLobehubColors(paths.colorDir)

  return { avatars, colors }
}

async function collectLobehubAvatars(avatarDir: string): Promise<LogoAsset[]> {
  const glob = new Bun.Glob('*.webp')
  const avatars: LogoAsset[] = []

  for await (const file of glob.scan({ cwd: avatarDir })) {
    avatars.push({
      key: normalizeLogoKey(file),
      source: 'lobehub',
      sourcePath: join(avatarDir, file),
    })
  }

  return avatars.toSorted((a, b) => a.key.localeCompare(b.key))
}

async function collectLobehubColors(colorDir: string): Promise<LogoAsset[]> {
  const glob = new Bun.Glob(COLOR_ICON_PATTERN)
  const colorsByKey = new Map<string, LogoAsset>()

  for await (const file of glob.scan({ cwd: colorDir })) {
    const variant = parseLobehubColorVariant(file)
    if (variant === undefined) {
      continue
    }

    const existing = colorsByKey.get(variant.key)
    if (variant.isColor || existing === undefined) {
      colorsByKey.set(variant.key, {
        key: variant.key,
        source: 'lobehub',
        sourcePath: join(colorDir, file),
      })
    }
  }

  return [...colorsByKey.values()].toSorted((a, b) => a.key.localeCompare(b.key))
}

function parseLobehubColorVariant(file: string): { key: string; isColor: boolean } | undefined {
  const baseName = file.replace(/\.(png|jpe?g|svg|webp)$/i, '')
  const dashIndex = baseName.indexOf('-')
  const entityName = dashIndex === -1 ? baseName : baseName.slice(0, dashIndex)
  const variant = dashIndex === -1 ? '' : baseName.slice(dashIndex + 1)

  if (variant !== '' && variant !== 'color') {
    return undefined
  }

  return {
    isColor: variant === 'color',
    key: normalizeLogoKey(entityName),
  }
}
