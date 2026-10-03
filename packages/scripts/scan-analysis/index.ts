import path from 'node:path'

import { Command, Option } from 'commander'

import { createObjectReader } from '../../backend/convex/objects/client'
import { renderHtml } from './html'
import { profileScan } from './profile'
import type { Selection } from './profile'
import { loadScan } from './source'

interface Options extends Selection {
  format: 'html' | 'json'
  output?: string
  source: string
}

const program = new Command()
  .name('scan-analysis')
  .description('Fetch one stored scan into memory and explore its fields and values')
  .argument('[scan-at]', 'canonical UTC capture time, or latest', 'latest')
  .addOption(
    new Option('--source <deployment>', 'object source deployment name')
      .env('ORCA_OBJECTS_SOURCE_DEPLOYMENT')
      .makeOptionMandatory(),
  )
  .addOption(
    new Option('--scope <scope>', 'population to profile')
      .choices(['orca', 'collected'])
      .default('orca'),
  )
  .addOption(
    new Option('--format <format>', 'report format').choices(['html', 'json']).default('html'),
  )
  .option('--model <id>', 'select an exact model identity and its endpoints/providers')
  .option('--provider <id>', 'select an exact provider identity and its models/endpoints')
  .option('-o, --output <path>', 'report path; defaults to scan-profile.<time>.<format>')
  .showHelpAfterError()
  .action(async (requested: string, options: Options) => {
    const reader = createObjectReader(options.source, process.env.ORCA_OBJECTS_API_KEY ?? '')
    const scan = await loadScan(reader, requested)
    const selection: Selection = { scope: options.scope }

    if (options.model !== undefined) {
      selection.model = options.model
    }

    if (options.provider !== undefined) {
      selection.provider = options.provider
    }

    const report = profileScan(scan, options.source, selection)
    const output = path.resolve(options.output ?? `scan-profile.${scan.scan_at}.${options.format}`)

    const contents =
      options.format === 'html' ? await renderHtml(report) : `${JSON.stringify(report, null, 2)}\n`

    await Bun.write(output, contents)
    console.error(`Wrote ${output}`)

    console.error(
      `${report.models.profile.record_count} models, ${report.endpoints.profile.record_count} endpoints, ${report.providers.profile.record_count} providers · ${scan.scan_at}`,
    )
  })

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
