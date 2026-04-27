import type { ColorSourceSummary, LogoCatalog } from './types'

export function printBuildStats(catalog: LogoCatalog): void {
  const avatarCount = catalog.logos.filter((logo) => logo.avatar !== undefined).length
  const colorCount = catalog.logos.filter((logo) => logo.color !== undefined).length
  const completeCount = catalog.logos.filter(
    (logo) => logo.avatar !== undefined && logo.color !== undefined,
  ).length
  const avatarOnlyCount = catalog.logos.filter(
    (logo) => logo.avatar !== undefined && logo.color === undefined,
  ).length
  const colorOnlyCount = catalog.logos.filter(
    (logo) => logo.color !== undefined && logo.avatar === undefined,
  ).length

  console.log('Logo build summary')
  console.log(`  Manifest logos: ${catalog.logos.length}`)
  console.log(`  Avatar assets: ${avatarCount}`)
  console.log(`  Color assets: ${colorCount}`)
  console.log(`  Complete entries: ${completeCount}`)
  console.log(`  Avatar-only entries: ${avatarOnlyCount}`)
  console.log(`  Color-only entries: ${colorOnlyCount}`)
  console.log('Color sources, priority order:')

  for (const summary of catalog.colorSourceSummaries) {
    console.log(
      `  ${summary.source}: ${summary.used} used, ${summary.unused} unused, ${summary.total} total`,
    )
  }

  console.log(`Avatar source: lobehub-avatar: ${avatarCount} used, 0 unused, ${avatarCount} total`)
  printUnusedColorLogos(catalog.colorSourceSummaries)
}

function printUnusedColorLogos(sourceSummaries: ColorSourceSummary[]): void {
  const summariesWithUnused = sourceSummaries.filter((summary) => summary.unusedPaths.length > 0)

  if (summariesWithUnused.length === 0) {
    console.log('Unused color logos: none')
    return
  }

  console.log('Unused color logos:')
  for (const summary of summariesWithUnused) {
    console.log(`  ${summary.source} (${summary.unusedPaths.length})`)
    for (const path of summary.unusedPaths) {
      console.log(`    ${path}`)
    }
  }
}
