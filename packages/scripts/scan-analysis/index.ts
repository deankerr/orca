import { Command, InvalidArgumentError, Option } from 'commander'

import { createObjectReader } from '../../backend/convex/objects/client'
import { profileScan, viewScanReport } from '../../backend/convex/scan_analysis/profile'
import type { Selection, ScanViewOptions } from '../../backend/convex/scan_analysis/profile'
import { loadScan } from '../../backend/convex/scan_analysis/source'
import { renderHtml } from './html'
import { writeReport } from './output'

interface Options extends Selection, Omit<ScanViewOptions, 'valueLimit'> {
  format: 'html' | 'json'
  output?: string
  source: string
  valueLimit: number | 'all'
}

function parseValueLimit(value: string): number | 'all' {
  if (value === 'all') {
    return 'all'
  }

  const limit = Number(value)

  if (!Number.isSafeInteger(limit) || limit < 0 || value.trim() === '') {
    throw new InvalidArgumentError('Expected a nonnegative integer or all')
  }

  return limit
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
  .addOption(
    new Option('--population <name>', 'JSON view population').choices([
      'models',
      'endpoints',
      'providers',
    ]),
  )
  .option('--paths <paths...>', 'JSON view: exact field JSONPaths')
  .option(
    '--value-limit <count|all>',
    'JSON view: entries per distribution; all includes long strings',
    parseValueLimit,
    5,
  )
  .option(
    '-o, --output <path>',
    'report path; defaults to scan-profile.<time>.<unique-id>.<format>',
  )
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
    const view: ScanViewOptions = {
      paths: options.paths,
      population: options.population,
      valueLimit: options.valueLimit === 'all' ? null : options.valueLimit,
    }

    const contents =
      options.format === 'html'
        ? await renderHtml(report)
        : `${JSON.stringify(viewScanReport(report, view), null, 2)}\n`

    const output = await writeReport(contents, {
      format: options.format,
      output: options.output,
      scanAt: scan.scan_at,
    })

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
