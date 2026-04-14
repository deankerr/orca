#!/usr/bin/env bun

import { Command, InvalidArgumentError } from 'commander'

import { runSync, runUnzip } from './lib/operations'
import type { SyncOptions, UnzipOptions } from './lib/schemas'

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`Expected a positive integer, received ${value}`)
  }

  return parsed
}

const program = new Command()

program
  .name('archive-sync')
  .description('Sync full daily ORCA crawl bundles for local development.')
  .option(
    '--target-url <target>',
    'Override CONVEX_ARCHIVE_SYNC_TARGET_URL (slug, hosted URL, or local origin)',
  )
  .option('--output-dir <path>', 'Override the local archive cache directory')
  .option('--dry-run', 'Preview sync actions without writing files', false)
  .option('--force', 'Re-download archives even if they already exist locally', false)
  .option(
    '--days <n>',
    'Ensure the newest N full UTC days are present locally',
    parsePositiveInteger,
    1,
  )
  .action(async () => {
    const options = program.opts<SyncOptions>()
    await runSync(options)
  })

program
  .command('unzip')
  .description('Write a named JSON file for a chosen downloaded archive.')
  .option('--crawl-id <crawlId>', 'Select a specific local archive by crawl_id')
  .option('--day <yyyy-mm-dd>', 'Select the newest local archive for a UTC day')
  .action(async (commandOptions: UnzipOptions) => {
    const globalOptions = program.opts<SyncOptions>()
    await runUnzip({
      ...commandOptions,
      outputDir: globalOptions.outputDir,
      targetUrl: globalOptions.targetUrl,
    })
  })

await program.parseAsync(process.argv)
