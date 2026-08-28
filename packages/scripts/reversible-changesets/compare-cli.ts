import path from 'node:path'

import { Command, Option } from 'commander'

import { findBundlePaths } from '../model-endpoints-v1.ts'
import { compareReversibleCodecs } from './compare.ts'

interface CliOptions {
  bundlesPath: string
  denseFrom: string
  outputPath: string
  snapshots?: number
}

const program = new Command()
  .name('reversible-codec-comparison')
  .description('Compare four reversible codecs over normalized ORCA bundles')
  .requiredOption('--bundles-path <directory>', 'directory containing ModelEndpointsV1 bundles')
  .requiredOption('--output-path <directory>', 'comparison output directory')
  .option('--dense-from <date>', 'first date in the representative dense series', '2026-08-16')
  .addOption(
    new Option('--snapshots <count>', 'limit the number of dense snapshots').argParser(
      parsePositiveInteger,
    ),
  )
  .action(run)

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

async function run(options: CliOptions): Promise<void> {
  const allPaths = await findBundlePaths([], options.bundlesPath)
  const densePaths = deduplicateCrawls(
    allPaths.filter((bundlePath) => path.basename(bundlePath) >= options.denseFrom),
  )
  const selected =
    options.snapshots === undefined ? densePaths : densePaths.slice(0, options.snapshots)
  const result = await compareReversibleCodecs(selected, options.outputPath)
  console.error(
    `Compared ${result.codecs.length} codecs over ${result.corpus.snapshots} snapshots in ${options.outputPath}.`,
  )
}

function deduplicateCrawls(bundlePaths: readonly string[]): string[] {
  const pathsByCrawl = new Map<string, string>()
  for (const bundlePath of bundlePaths) {
    const [crawlAt] = path.basename(bundlePath).split('.me1.orca.json')
    if (crawlAt === undefined) {
      continue
    }
    const existing = pathsByCrawl.get(crawlAt)
    if (existing === undefined || (!existing.endsWith('.gz') && bundlePath.endsWith('.gz'))) {
      pathsByCrawl.set(crawlAt, bundlePath)
    }
  }
  return [...pathsByCrawl.values()].toSorted((left, right) =>
    path.basename(left).localeCompare(path.basename(right)),
  )
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value)
  if (!(Number.isSafeInteger(parsed) && parsed >= 2)) {
    throw new Error('--snapshots must be an integer of at least 2.')
  }
  return parsed
}
