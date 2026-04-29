import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { PUBLIC_AVATAR_DIR, PUBLIC_COLOR_DIR } from '../constants'
import { packagePath } from './paths'
import type { CatalogLogo, LogoAsset } from './types'

const PUBLIC_AVATAR_PATH = packagePath(PUBLIC_AVATAR_DIR)
const PUBLIC_COLOR_PATH = packagePath(PUBLIC_COLOR_DIR)

export async function emitLogos(logos: CatalogLogo[]): Promise<void> {
  await recreateOutputDirs()

  for (const logo of logos) {
    if (logo.avatar !== undefined) {
      await emitAvatar(logo.avatar)
    }

    if (logo.color !== undefined) {
      await emitColor(logo.color)
    }
  }
}

async function recreateOutputDirs(): Promise<void> {
  await rm(PUBLIC_AVATAR_PATH, { force: true, recursive: true })
  await rm(PUBLIC_COLOR_PATH, { force: true, recursive: true })
  await mkdir(PUBLIC_AVATAR_PATH, { recursive: true })
  await mkdir(PUBLIC_COLOR_PATH, { recursive: true })
}

async function emitAvatar(asset: LogoAsset): Promise<void> {
  const outputPath = join(PUBLIC_AVATAR_PATH, `${asset.key}.webp`)

  if (asset.sourcePath.toLowerCase().endsWith('.webp')) {
    const bytes = await Bun.file(asset.sourcePath).arrayBuffer()
    await Bun.write(outputPath, bytes)
    return
  }

  await sharp(asset.sourcePath).webp().toFile(outputPath)
}

async function emitColor(asset: LogoAsset): Promise<void> {
  const outputPath = join(PUBLIC_COLOR_PATH, `${asset.key}.png`)

  if (asset.sourcePath.toLowerCase().endsWith('.png')) {
    const bytes = await Bun.file(asset.sourcePath).arrayBuffer()
    await Bun.write(outputPath, bytes)
    return
  }

  await sharp(asset.sourcePath).png().toFile(outputPath)
}
