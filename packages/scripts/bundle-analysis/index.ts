import { Command } from 'commander'

import { writeJsonOutput } from '../json-output.ts'
import { findBundlePaths, findLatestBundlePath, loadBundleSeries } from '../model-endpoints-v1.ts'
import { analyzeBundles } from './analysis.ts'
import { bundleAnalysisFilename } from './output.ts'

interface CliOptions {
  all: boolean
  report: boolean
}

const program = new Command()
  .name('bundle-analysis')
  .description('Verify model, endpoint, provider, and pricing structures')
  .showHelpAfterError()
  .argument('[bundle-filter...]', 'bundle paths or filename fragments; latest bundle when omitted')
  .option('--all', 'analyze every bundle in BUNDLES_PATH', false)
  .option('--report', 'write the JSON analysis report to OUTPUT_PATH', false)
  .action(run)

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}

async function run(filters: string[], options: CliOptions): Promise<void> {
  if (options.all && filters.length > 0) {
    throw new Error('Pass --all or bundle filters, not both.')
  }

  // Corpus analysis must be explicit; the default remains one latest bundle.
  const bundlePaths =
    options.all || filters.length > 0
      ? await findBundlePaths(filters, process.env.BUNDLES_PATH)
      : [await findLatestBundlePath(undefined, process.env.BUNDLES_PATH)]

  // Analysis completes before output is created, so invalid inputs leave no artifact.
  const analysis = await analyzeBundles(loadBundleSeries(bundlePaths))
  if (!options.report) {
    const endpointCount = analysis.bundles.reduce(
      (total, bundle) => total + bundle.verified_endpoint_count,
      0,
    )
    const bundleLabel = analysis.bundles.length === 1 ? 'bundle' : 'bundles'
    const endpointLabel = endpointCount === 1 ? 'endpoint' : 'endpoints'
    console.error(
      `Verified ${analysis.bundles.length} ${bundleLabel} and ${endpointCount} ${endpointLabel}`,
    )
    return
  }

  const outputPath = await writeJsonOutput(
    process.env.OUTPUT_PATH,
    bundleAnalysisFilename(analysis),
    analysis,
  )
  console.error(`Wrote bundle analysis to ${outputPath}`)
}
