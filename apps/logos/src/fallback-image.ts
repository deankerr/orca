import { readFile } from 'node:fs/promises'
import nodePath from 'node:path'

import sharp from 'sharp'

import type { AssetGroup } from './contract'

type FallbackAssetOptions = {
  group: AssetGroup
  outputPath: string
  sizePx: number
  webpQuality: number
}

const FALLBACK_THEME = {
  avatar: {
    background: '#0a0a0a',
    mark: '#737373',
  },
  dark: {
    background: undefined,
    mark: '#d4d4d4',
  },
  light: {
    background: undefined,
    mark: '#404040',
  },
} satisfies Record<AssetGroup, { background: string | undefined; mark: string }>

// Read the branding source on each build so artwork tweaks flow into every fallback.
export async function emitFallbackAsset(args: FallbackAssetOptions): Promise<void> {
  const source = await readFile(
    nodePath.resolve(import.meta.dir, '../../../branding/svg/orb-ring-mark.svg'),
    'utf-8',
  )
  const theme = FALLBACK_THEME[args.group]
  const svg = source.replaceAll('#ededed', theme.mark)
  const image = sharp(Buffer.from(svg), { density: 192 })

  if (theme.background !== undefined) {
    image.flatten({ background: theme.background })
  }

  await image
    .resize({
      fit: 'inside',
      height: args.sizePx,
      width: args.sizePx,
    })
    .webp({ quality: args.webpQuality })
    .toFile(args.outputPath)
}
