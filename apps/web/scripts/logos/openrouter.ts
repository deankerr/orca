import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { OUTPUT_DIR, SOURCES_OPENROUTER_DIR } from './config'
import { slugToTitle } from './utils'
import type { LogoStyle } from './utils'

const ProviderSchema = z.object({
  slug: z.string(),
  icon: z
    .object({
      url: z.string().optional(),
    })
    .optional(),
})

const ProvidersResponseSchema = z.object({
  data: z.array(ProviderSchema),
})

/**
 * Process icons from OpenRouter API
 */
export async function processOpenRouterIcons(
  existingSlugs: Set<string>,
): Promise<Record<string, LogoStyle>> {
  const styles: Record<string, LogoStyle> = {}
  const coveredSlugs = new Set(existingSlugs)

  try {
    await mkdir(SOURCES_OPENROUTER_DIR, { recursive: true })
    await mkdir(OUTPUT_DIR, { recursive: true })

    const files = await readdir(SOURCES_OPENROUTER_DIR)
    const iconFiles = files.filter((file) => file.toLowerCase().endsWith('.png'))

    if (iconFiles.length > 0) {
      console.log(`\n📦 Processing ${iconFiles.length} local OpenRouter icons...\n`)
    }

    for (const file of iconFiles) {
      // * Local OpenRouter icons are the lowest-priority fallback source.
      const slug = file.replace(/\.png$/i, '').replaceAll('-', '')
      if (coveredSlugs.has(slug)) {
        continue
      }

      const title = slugToTitle(slug)
      await copyFile(join(SOURCES_OPENROUTER_DIR, file), join(OUTPUT_DIR, `${slug}.png`))
      styles[slug] = {
        slug,
        title,
        background: '', // Empty - will use fallback color in frontend
        scale: 1,
      }
      coveredSlugs.add(slug)

      console.log(`  ✓ Added ${slug} (${title})`)
    }
  } catch (error) {
    // * Directory might not exist or contain invalid files, but live OpenRouter can still work.
    const errorCode = error instanceof Error && 'code' in error ? error.code : undefined

    if (errorCode !== 'ENOENT') {
      console.warn(
        `  ⚠️  Could not process local OpenRouter icons:`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  try {
    console.log(`\n🌐 Fetching providers from OpenRouter API...\n`)

    const response = await fetch('https://openrouter.ai/api/frontend/all-providers')
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = ProvidersResponseSchema.parse(await response.json())
    const providers = data.data

    if (providers.length === 0) {
      return styles
    }
    let downloadedCount = 0
    let skippedCount = 0

    for (const provider of providers) {
      const rawSlug = provider.slug
      const slug = rawSlug.replaceAll('-', '') // Remove dashes like lobehub icons
      const iconUrl = provider.icon?.url

      // * Skip if slug already exists
      if (coveredSlugs.has(slug)) {
        continue
      }

      // * Skip if icon URL doesn't start with http
      if (iconUrl === undefined || iconUrl === '' || !iconUrl.startsWith('http')) {
        skippedCount += 1
        continue
      }

      try {
        // * Download icon image
        const iconResponse = await fetch(iconUrl)
        if (!iconResponse.ok) {
          throw new Error(`HTTP error! status: ${iconResponse.status}`)
        }

        const imageBuffer = await iconResponse.arrayBuffer()
        const destPath = join(SOURCES_OPENROUTER_DIR, `${slug}.png`)
        await writeFile(destPath, Buffer.from(imageBuffer))

        // * Copy to web directory
        const webDestPath = join(OUTPUT_DIR, `${slug}.png`)
        await copyFile(destPath, webDestPath)

        const title = slugToTitle(slug)
        styles[slug] = {
          slug,
          title,
          background: '', // Empty - will use fallback color in frontend
          scale: 1,
        }
        coveredSlugs.add(slug)

        console.log(`  ✓ Downloaded ${slug}.png (${title})`)
        downloadedCount += 1
      } catch (error) {
        skippedCount += 1
        console.warn(`  ⚠️  Skipped ${slug}:`, error instanceof Error ? error.message : error)
      }
    }

    if (downloadedCount > 0) {
      console.log(`\n  📥 Downloaded ${downloadedCount} icons from OpenRouter`)
    }
    if (skippedCount > 0) {
      console.log(`  ⏭️  Skipped ${skippedCount} providers`)
    }
  } catch (error) {
    // * API might be unavailable, that's okay
    console.warn(
      `  ⚠️  Could not fetch OpenRouter icons:`,
      error instanceof Error ? error.message : error,
    )
  }

  return styles
}
