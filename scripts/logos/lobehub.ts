import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { LOBEHUB_ICONS, LOBEHUB_STATIC_PNG, OUTPUT_DIR, SOURCES_LOBEHUB_DIR } from './config'
import { needsInversion, needsTint } from './utils'
import type { LogoStyle } from './utils'

export interface ProcessLobehubResult {
  styles: Record<string, LogoStyle>
  processedCount: number
  tintedCount: number
  skippedCount: number
}

/**
 * Process logos from @lobehub/icons
 */
export async function processLobehubIcons(): Promise<ProcessLobehubResult> {
  console.log('🎨 Processing logos from @lobehub/icons...')

  await mkdir(SOURCES_LOBEHUB_DIR, { recursive: true })
  await mkdir(OUTPUT_DIR, { recursive: true })

  const dirs = await readdir(LOBEHUB_ICONS, { withFileTypes: true })
  const iconDirs = dirs.filter(
    (d) => d.isDirectory() && !['components', 'features', 'hooks', 'types'].includes(d.name),
  )

  const styles: Record<string, LogoStyle> = {}
  let processedCount = 0
  let tintedCount = 0
  let skippedCount = 0

  for (const dir of iconDirs) {
    const componentName = dir.name
    const slug = componentName.toLowerCase()
    const stylePath = join(LOBEHUB_ICONS, componentName, 'style.js')
    const avatarPath = join(LOBEHUB_ICONS, componentName, 'components', 'Avatar.js')

    try {
      const styleContent = await readFile(stylePath, 'utf8')
      const avatarContent = await readFile(avatarPath, 'utf8').catch(() => '')

      // * Extract style constants
      const title = styleContent.match(/export var TITLE = ['"](.+?)['"]/)?.[1]
      const avatarBackgroundRaw = styleContent.match(/export var AVATAR_BACKGROUND = (.+?);/)?.[1]
      const avatarColor = styleContent.match(/export var AVATAR_COLOR = ['"](.+?)['"]/)?.[1]
      const avatarIconScale = styleContent.match(/export var AVATAR_ICON_MULTIPLE = ([\d.]+)/)?.[1]
      const colorPrimary = styleContent.match(/export var COLOR_PRIMARY = ['"](.+?)['"]/)?.[1]
      const colorGradient = styleContent.match(/export var COLOR_GRADIENT = ['"](.+?)['"]/)?.[1]

      if (!title || !avatarBackgroundRaw || !avatarColor) {
        continue
      }

      // * Determine which logo variant to use
      const useColor = /import\s+Color\s+from\s+['"]\.\/(Color|Color\.js)['"]/.test(avatarContent)

      // * Resolve background (prefer gradient if available)
      let background: string
      if (avatarBackgroundRaw === 'COLOR_PRIMARY') {
        background = colorPrimary!
      } else if (avatarBackgroundRaw === 'COLOR_GRADIENT') {
        background = colorGradient || colorPrimary || '#000'
      } else {
        background = avatarBackgroundRaw.replaceAll(/['"]/g, '')
      }

      // * Check if inversion is needed
      const needsInvert = needsInversion(avatarColor, background, useColor)

      const sourceName = useColor ? `${slug}-color.png` : `${slug}.png`
      const sourcePath = join(LOBEHUB_STATIC_PNG, sourceName)
      const sourceDestPath = join(SOURCES_LOBEHUB_DIR, `${slug}.png`)
      const webDestPath = join(OUTPUT_DIR, `${slug}.png`)

      // * Copy source logo to sources directory (always as slug.png, not -color.png)
      await copyFile(sourcePath, sourceDestPath)

      // * Copy or tint the logo for web
      if (useColor || !needsTint(avatarColor)) {
        if (needsInvert) {
          // * Invert white to black while preserving transparency
          const image = sharp(sourcePath)
          const metadata = await image.metadata()

          // * Extract alpha channel to preserve transparency
          const alpha = await image.extractChannel(3).toBuffer()

          // * Create black image with same dimensions
          const black = sharp({
            create: {
              width: metadata.width!,
              height: metadata.height!,
              channels: 3,
              background: '#000',
            },
          })

          // * Apply original alpha channel to black image
          await black.joinChannel(alpha).png().toFile(webDestPath)
          console.log(`  🔄 Inverted: ${slug}`)
        } else {
          await copyFile(sourcePath, webDestPath)
        }
      } else {
        // * For white logos, extract alpha channel and apply color
        const image = sharp(sourcePath)
        const metadata = await image.metadata()
        const alpha = await image.extractChannel(3).toBuffer()

        // * Create solid color image with same dimensions
        const colored = sharp({
          create: {
            width: metadata.width!,
            height: metadata.height!,
            channels: 3,
            background: avatarColor,
          },
        })

        // * Apply alpha channel to colored image
        await colored.joinChannel(alpha).png().toFile(webDestPath)

        console.log(`  🎨 Tinted: ${slug} (${avatarColor})`)
        tintedCount += 1
      }

      // * Store simplified metadata
      styles[slug] = {
        slug,
        title,
        background,
        scale: Number.parseFloat(avatarIconScale || '0.75'),
      }

      processedCount += 1
    } catch (error) {
      skippedCount += 1
      console.warn(`  ⚠️  Skipped ${slug}:`, error instanceof Error ? error.message : error)
    }
  }

  return { styles, processedCount, tintedCount, skippedCount }
}
