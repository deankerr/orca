import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import nodePath from 'node:path'

import sharp from 'sharp'

import { ASSET_GROUPS } from './contract'
import { createLogoReviewSheet } from './review'

test('uses only pure black and white review surfaces and an avatar alpha grid', async () => {
  const appRoot = await mkdtemp(nodePath.join(tmpdir(), 'logos-review-'))

  try {
    for (const group of ASSET_GROUPS) {
      const outputPath = nodePath.join(appRoot, 'dist', 'v1', group, 'sample.webp')
      await mkdir(nodePath.dirname(outputPath), { recursive: true })
      await sharp({
        create: {
          background: { alpha: 0, b: 0, g: 0, r: 0 },
          channels: 4,
          height: 128,
          width: 128,
        },
      })
        .webp()
        .toFile(outputPath)
    }

    const outputPath = await createLogoReviewSheet({ appRoot, key: 'sample' })
    const { data, info } = await sharp(outputPath).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    })

    expect(info.width).toBe(720)
    expect(info.height).toBe(280)
    expect(readPixel({ data, info, x: 10, y: 100 })).toEqual([255, 255, 255, 255])
    expect(readPixel({ data, info, x: 250, y: 100 })).toEqual([0, 0, 0, 255])
    expect(readPixel({ data, info, x: 544, y: 108 })).toEqual([255, 255, 255, 255])
    expect(readPixel({ data, info, x: 560, y: 108 })).toEqual([0, 0, 0, 255])
  } finally {
    await rm(appRoot, { force: true, recursive: true })
  }
})

function readPixel(args: {
  data: Buffer
  info: { channels: number; width: number }
  x: number
  y: number
}): number[] {
  const offset = (args.y * args.info.width + args.x) * args.info.channels
  return [...args.data.subarray(offset, offset + args.info.channels)]
}
