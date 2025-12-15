import { copyFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { OUTPUT_DIR, SOURCES_OTHER_DIR } from './config'
import { slugToTitle, type LogoStyle } from './utils'

const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp']

/**
 * Convert an image file to PNG format
 */
async function convertToPng(sourcePath: string, destPath: string): Promise<void> {
  await sharp(sourcePath).png().toFile(destPath)
}

/**
 * Process other icons from sources/other directory
 * Supports PNG, JPG, SVG, and WebP - converts non-PNG formats to PNG
 */
export async function processOtherIcons(
  existingSlugs: Set<string>,
): Promise<Record<string, LogoStyle>> {
  const styles: Record<string, LogoStyle> = {}

  try {
    const files = await readdir(SOURCES_OTHER_DIR)
    const iconFiles = files.filter((f) =>
      SUPPORTED_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)),
    )

    if (iconFiles.length === 0) {
      return styles
    }

    console.log(`\n📦 Processing ${iconFiles.length} other icons...\n`)

    for (const file of iconFiles) {
      // * Extract slug by removing any supported extension and dashes
      const slug = file.replace(/\.(png|jpe?g|svg|webp)$/i, '').replace(/-/g, '')

      // * Skip if already processed from lobehub
      if (existingSlugs.has(slug)) {
        continue
      }

      const title = slugToTitle(slug)
      const sourcePath = join(SOURCES_OTHER_DIR, file)
      const destPath = join(OUTPUT_DIR, `${slug}.png`)
      const isPng = file.toLowerCase().endsWith('.png')

      try {
        if (isPng) {
          await copyFile(sourcePath, destPath)
        } else {
          await convertToPng(sourcePath, destPath)
          console.log(`  ↳ Converted ${file} to PNG`)
        }

        styles[slug] = {
          slug,
          title,
          background: '', // Empty - will use fallback color in frontend
          scale: 1,
        }
        console.log(`  ✓ Added ${slug} (${title})`)
      } catch (err) {
        console.warn(`  ⚠️  Skipped ${slug}:`, err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    // * Directory might not exist, that's okay
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`  ⚠️  Could not process other icons:`, err instanceof Error ? err.message : err)
    }
  }

  return styles
}
