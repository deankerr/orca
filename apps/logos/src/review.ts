import { mkdir } from 'node:fs/promises'
import nodePath from 'node:path'

import sharp from 'sharp'
import type { OverlayOptions } from 'sharp'

import { PUBLIC_VERSION } from './contract'
import type { AssetGroup } from './contract'

const APP_ROOT = nodePath.dirname(import.meta.dirname)
const BLACK = '#000000'
const IMAGE_SIZE_PX = 128
const LABEL_HEIGHT_PX = 48
const SHEET_HEIGHT_PX = 280
const TILE_WIDTH_PX = 240
const WHITE = '#ffffff'
const IMAGE_LEFT_PX = (TILE_WIDTH_PX - IMAGE_SIZE_PX) / 2
const IMAGE_TOP_PX = LABEL_HEIGHT_PX + (SHEET_HEIGHT_PX - LABEL_HEIGHT_PX - IMAGE_SIZE_PX) / 2

type ReviewSheetOptions = {
  appRoot?: string
  key: string
  outputPath?: string
}

type TileSpec = {
  background: typeof BLACK | typeof WHITE
  group: AssetGroup
  label: string
  labelColor: typeof BLACK | typeof WHITE
}

const TILE_SPECS: TileSpec[] = [
  {
    background: WHITE,
    group: 'light',
    label: 'LIGHT · #FFFFFF',
    labelColor: BLACK,
  },
  {
    background: BLACK,
    group: 'dark',
    label: 'DARK · #000000',
    labelColor: WHITE,
  },
  {
    background: WHITE,
    group: 'avatar',
    label: 'AVATAR · B/W ALPHA GRID',
    labelColor: BLACK,
  },
]

export async function createLogoReviewSheet(options: ReviewSheetOptions): Promise<string> {
  assertSafeKey(options.key)

  const appRoot = options.appRoot ?? APP_ROOT
  const outputPath =
    options.outputPath ?? nodePath.join(appRoot, 'dist', 'review', `${options.key}.png`)
  const tiles = await Promise.all(
    TILE_SPECS.map(
      async (spec) =>
        await createTile({
          assetPath: nodePath.join(
            appRoot,
            'dist',
            PUBLIC_VERSION,
            spec.group,
            `${options.key}.webp`,
          ),
          spec,
        }),
    ),
  )

  await mkdir(nodePath.dirname(outputPath), { recursive: true })
  await sharp({
    create: {
      background: WHITE,
      channels: 4,
      height: SHEET_HEIGHT_PX,
      width: TILE_WIDTH_PX * tiles.length,
    },
  })
    .composite(
      tiles.map((input, index) => ({
        input,
        left: index * TILE_WIDTH_PX,
        top: 0,
      })),
    )
    .png()
    .toFile(outputPath)

  return outputPath
}

async function createTile(args: { assetPath: string; spec: TileSpec }): Promise<Buffer> {
  const asset = sharp(args.assetPath)
  const metadata = await asset.metadata()
  if (metadata.width !== IMAGE_SIZE_PX || metadata.height !== IMAGE_SIZE_PX) {
    throw new Error(
      `Cannot review ${args.spec.group} asset with dimensions ${metadata.width}x${metadata.height}; expected ${IMAGE_SIZE_PX}x${IMAGE_SIZE_PX}`,
    )
  }

  const assetPng = await asset.png().toBuffer()
  const layers: OverlayOptions[] = [
    {
      input: createLabelSvg({
        color: args.spec.labelColor,
        label: args.spec.label,
      }),
      left: 0,
      top: 0,
    },
  ]

  if (args.spec.group === 'avatar') {
    layers.push({
      input: createAlphaGridSvg(),
      left: IMAGE_LEFT_PX,
      top: IMAGE_TOP_PX,
    })
  }

  layers.push({
    input: assetPng,
    left: IMAGE_LEFT_PX,
    top: IMAGE_TOP_PX,
  })

  if (args.spec.group === 'avatar') {
    layers.push({
      input: createCanvasOutlineSvg(),
      left: IMAGE_LEFT_PX,
      top: IMAGE_TOP_PX,
    })
  }

  return await sharp({
    create: {
      background: args.spec.background,
      channels: 4,
      height: SHEET_HEIGHT_PX,
      width: TILE_WIDTH_PX,
    },
  })
    .composite(layers)
    .png()
    .toBuffer()
}

function createLabelSvg(args: { color: string; label: string }): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_WIDTH_PX}" height="${LABEL_HEIGHT_PX}">
  <text x="${TILE_WIDTH_PX / 2}" y="29" fill="${args.color}" font-family="sans-serif" font-size="13" font-weight="700" text-anchor="middle">${args.label}</text>
</svg>`)
}

function createAlphaGridSvg(): Buffer {
  const cellSize = 16
  const blackCells: string[] = []

  for (let y = 0; y < IMAGE_SIZE_PX; y += cellSize) {
    for (let x = 0; x < IMAGE_SIZE_PX; x += cellSize) {
      if ((x / cellSize + y / cellSize) % 2 === 1) {
        blackCells.push(
          `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${BLACK}"/>`,
        )
      }
    }
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE_PX}" height="${IMAGE_SIZE_PX}">
  <rect width="${IMAGE_SIZE_PX}" height="${IMAGE_SIZE_PX}" fill="${WHITE}"/>
  ${blackCells.join('\n  ')}
</svg>`)
}

function createCanvasOutlineSvg(): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE_PX}" height="${IMAGE_SIZE_PX}">
  <rect x="0.5" y="0.5" width="${IMAGE_SIZE_PX - 1}" height="${IMAGE_SIZE_PX - 1}" fill="none" stroke="${BLACK}"/>
</svg>`)
}

function assertSafeKey(key: string): void {
  if (key === '' || key !== nodePath.basename(key) || key.includes('.')) {
    throw new Error(`Invalid logo key: ${key}`)
  }
}

if (import.meta.main) {
  const [key] = Bun.argv.slice(2)
  if (key === undefined) {
    throw new Error('Usage: bun run review <logo-key>')
  }

  console.log(await createLogoReviewSheet({ key }))
}
