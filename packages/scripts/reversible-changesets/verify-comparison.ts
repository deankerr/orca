import path from 'node:path'

import { Command } from 'commander'

import { verifyPersistedComparison } from './compare.ts'

interface CliOptions {
  outputPath: string
}

const program = new Command()
  .name('verify-reversible-codec-comparison')
  .requiredOption('--output-path <directory>', 'comparison output directory')
  .action(run)

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

async function run(options: CliOptions): Promise<void> {
  const output = path.resolve(options.outputPath)
  const replay = await verifyPersistedComparison(output)
  const analysisPath = path.join(output, 'analysis.json')
  const analysis: unknown = await Bun.file(analysisPath).json()
  if (analysis === null || typeof analysis !== 'object' || Array.isArray(analysis)) {
    throw new Error(`Invalid comparison analysis: ${analysisPath}`)
  }
  Reflect.set(analysis, 'persisted_replay', replay)
  await Bun.write(analysisPath, `${JSON.stringify(analysis, null, 2)}\n`)
}
