import type { ScanReport } from '@orca/backend/scan/analysis'
import { Command } from 'commander'

import { renderHtml } from './html'
import { writeReport } from './output'

const program = new Command()
  .name('scan-analysis')
  .description('Render scan_analysis/index:report output from the Convex CLI as standalone HTML')
  .option('-o, --output <path>', 'report path; defaults to scan-profile.<time>.<unique-id>.html')
  .showHelpAfterError()
  .action(async (options: { output?: string }) => {
    if (process.stdin.isTTY) {
      throw new Error('Pipe convex run scan_analysis/index:report output into this command')
    }

    // Convex CLI JSON-encodes the action's string result when stdout is piped.
    const payload: unknown = JSON.parse(await Bun.stdin.text())

    if (typeof payload !== 'string') {
      throw new TypeError('Expected output from scan_analysis/index:report')
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The internal action serializes its typed ScanReport; this script only renders that result.
    const report = JSON.parse(payload) as ScanReport

    if (report?.report_format !== 'orca-scan-profile-v1') {
      throw new Error('Expected an orca-scan-profile-v1 report')
    }

    const output = await writeReport(await renderHtml(report), {
      format: 'html',
      output: options.output,
      scanAt: report.scan_at,
    })

    console.error(`Wrote ${output}`)

    console.error(
      `${report.models.profile.record_count} models, ${report.endpoints.profile.record_count} endpoints, ${report.providers.profile.record_count} providers · ${report.scan_at}`,
    )
  })

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
