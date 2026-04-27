import { buildCatalog } from './catalog'
import { emitLogos } from './emit'
import { writeManifest } from './manifest'
import { printBuildStats } from './stats'

export async function build(): Promise<void> {
  const catalog = await buildCatalog()

  await emitLogos(catalog.logos)
  await writeManifest(catalog.logos)
  printBuildStats(catalog)
}
