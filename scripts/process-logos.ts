import { writeFile } from 'node:fs/promises'

import { processLobehubIcons } from './logos/lobehub'
import { processOpenRouterIcons } from './logos/openrouter'
import { processOtherIcons } from './logos/other'

const MANIFEST_FILE = 'convex/shared/logos-manifest.json'

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

  // * Build and save unified manifest
  const manifest = {
    logos: Object.fromEntries(Object.entries(allStyles).sort(([a], [b]) => a.localeCompare(b))),
  }

  // * Apply overrides
  if (manifest.logos.cirrascale) {
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
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    return
  }

  console.log('🚀 Processing logos...\n')
  await processLogos()
  console.log('\n🎉 Done!')
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
}
