import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import {
  COLOR_OUTPUT_DIR,
  LOBEHUB_ICONS,
  LOBEHUB_STATIC_PNG,
  SOURCES_OPENROUTER_DIR,
  SOURCES_OTHER_DIR,
} from './logos/config'
import { processLobehubIcons } from './logos/lobehub'
import { processOpenRouterIcons } from './logos/openrouter'
import { processOtherIcons } from './logos/other'
import { fileExists } from './logos/utils'

const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp']

const MANIFEST_FILE = 'shared/logos-manifest.json'

/**
 * Process color icons for webhooks (simpler - just copy color variants)
 */
async function processColorIcons() {
  console.log('\n🎨 Processing color icons for webhooks...')

  await mkdir(COLOR_OUTPUT_DIR, { recursive: true })

  let copied = 0

  // * Process lobehub icons - prefer color variant, fallback to mono
  const dirs = await readdir(LOBEHUB_ICONS, { withFileTypes: true })
  const iconDirs = dirs.filter(
    (d) => d.isDirectory() && !['components', 'features', 'hooks', 'types'].includes(d.name),
  )

  for (const dir of iconDirs) {
    const slug = dir.name.toLowerCase()
    const colorPath = join(LOBEHUB_STATIC_PNG, `${slug}-color.png`)
    const monoPath = join(LOBEHUB_STATIC_PNG, `${slug}.png`)
    const outputPath = join(COLOR_OUTPUT_DIR, `${slug}.png`)

    if (await fileExists(colorPath)) {
      await copyFile(colorPath, outputPath)
      copied += 1
    } else if (await fileExists(monoPath)) {
      await copyFile(monoPath, outputPath)
      copied += 1
    }
  }

  // * Copy other sources directly (already color versions), converting non-PNG to PNG
  const otherFiles = await readdir(SOURCES_OTHER_DIR)
  const imageFiles = otherFiles.filter((f) =>
    SUPPORTED_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)),
  )

  for (const file of imageFiles) {
    // * Remove extension and dashes from slug
    const slug = file.replace(/\.(png|jpe?g|svg|webp)$/i, '').replaceAll('-', '')
    const sourcePath = join(SOURCES_OTHER_DIR, file)
    const outputPath = join(COLOR_OUTPUT_DIR, `${slug}.png`)
    const isPng = file.toLowerCase().endsWith('.png')

    await (isPng ? copyFile(sourcePath, outputPath) : sharp(sourcePath).png().toFile(outputPath))
    copied += 1
  }

  // * Copy OpenRouter sources (already PNG), skipping if already exists from other sources
  const openRouterFiles = await readdir(SOURCES_OPENROUTER_DIR).catch(() => [])
  for (const file of openRouterFiles) {
    if (!file.toLowerCase().endsWith('.png')) {
      continue
    }
    const slug = file.replace(/\.png$/i, '')
    const outputPath = join(COLOR_OUTPUT_DIR, `${slug}.png`)
    if (await fileExists(outputPath)) {
      continue
    }
    await copyFile(join(SOURCES_OPENROUTER_DIR, file), outputPath)
    copied += 1
  }

  console.log(`   Copied ${copied} color icons to ${COLOR_OUTPUT_DIR}`)
}

/**
 * Process all logos from all sources and generate unified manifest
 */
async function processLogos() {
  // * Process lobehub icons first
  const { styles, processedCount, tintedCount, skippedCount } = await processLobehubIcons()

  // * Process other icons and merge with lobehub styles
  const otherStyles = await processOtherIcons(new Set(Object.keys(styles)))
  const allStylesSoFar = { ...styles, ...otherStyles }

  // * Process OpenRouter icons and merge with all styles
  const openRouterStyles = await processOpenRouterIcons(new Set(Object.keys(allStylesSoFar)))
  const allStyles = { ...allStylesSoFar, ...openRouterStyles }

  // * Process color icons for webhooks
  await processColorIcons()

  // * Build and save unified manifest
  const manifest = {
    logos: Object.fromEntries(Object.entries(allStyles).toSorted(([a], [b]) => a.localeCompare(b))),
  }

  // * Apply overrides
  if ('cirrascale' in manifest.logos) {
    manifest.logos.cirrascale.background = '#000'
  }

  await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2))

  console.log(`\n✅ Processing complete:`)
  console.log(`   - Processed: ${processedCount} lobehub logos`)
  console.log(`   - Tinted: ${tintedCount} logos`)
  console.log(`   - Skipped: ${skippedCount} logos`)
  console.log(`   - Other icons: ${Object.keys(otherStyles).length}`)
  console.log(`   - OpenRouter icons: ${Object.keys(openRouterStyles).length}`)
  console.log(`   - Total: ${Object.keys(allStyles).length} logos`)
  console.log(`   📄 Manifest saved to: ${MANIFEST_FILE}`)
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`🎨 Logo Processing Script

Usage: bun scripts/process-logos.ts

Processes all logos:
- Processes logos from @lobehub/icons (extracts metadata, tints, inverts)
- Processes other icons from public/logos/sources/other
- Fetches and processes icons from OpenRouter API (fallback for missing providers)
- Generates unified manifest with all logos

Examples:
  bun scripts/process-logos.ts
  bun run logos`)
}

/**
 * Main function
 */
async function main() {
  const args = new Set(process.argv.slice(2))

  if (args.has('--help') || args.has('-h')) {
    showHelp()
    return
  }

  console.log('🚀 Processing logos...\n')
  await processLogos()
  console.log('\n🎉 Done!')
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}
