import { Command } from 'commander'

import { writeJsonOutput } from '../json-output.ts'
import { findLatestBundlePath, loadBundle } from '../model-endpoints-v1.ts'
import { bundleProfileFilename, profileBundle } from './bundle.ts'

interface CliOptions {
  textModels: boolean
}

const program = new Command()
  .name('json-profile')
  .description('Profile the exact keys, types, and values in an ORCA bundle')
  .showHelpAfterError()
  .argument('[bundle-filter]', 'bundle path or filename fragment; latest bundle when omitted')
  .option('--text-models', 'include only models with text input and output modalities')
  .action(runProfile)

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}

async function runProfile(input: string | undefined, options: CliOptions): Promise<void> {
  const inputPath = await findLatestBundlePath(input, process.env.BUNDLES_PATH)

  try {
    const bundle = await loadBundle(inputPath)
    const report = profileBundle(bundle, {
      modelsWithText: options.textModels,
    })
    const outputPath = await writeJsonOutput(
      process.env.OUTPUT_PATH,
      bundleProfileFilename(report),
      report,
    )
    console.error(`Wrote JSON profile to ${outputPath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to profile ${inputPath}: ${message}`, { cause: error })
  }
}
