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
    mark: '#d4d4d4',
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

// Generate the temporary fallback marks in one place while the final asset is undecided.
export async function emitFallbackAsset(args: FallbackAssetOptions): Promise<void> {
  await sharp(Buffer.from(createFallbackSvg({ group: args.group, sizePx: args.sizePx })))
    .resize({
      fit: 'inside',
      height: args.sizePx,
      width: args.sizePx,
    })
    .webp({ quality: args.webpQuality })
    .toFile(args.outputPath)
}

// Keep the placeholder drawing private so replacing it does not touch the build pipeline.
function createFallbackSvg(args: { group: AssetGroup; sizePx: number }): string {
  const theme = FALLBACK_THEME[args.group]
  const background =
    theme.background === undefined
      ? ''
      : `<rect width="128" height="128" fill="${theme.background}"/>`

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${args.sizePx}" height="${args.sizePx}" viewBox="0 0 128 128">
      ${background}
      <path d="M64 34 94 64 64 94 34 64Z" fill="none" stroke="${theme.mark}" stroke-width="10"/>
    </svg>
  `
}
