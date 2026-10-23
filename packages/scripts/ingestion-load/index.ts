import path from 'node:path'

import { Command } from 'commander'

import { addLogLine, emptyReport, totals } from './contention'
import type { ContentionReport } from './contention'

const BACKEND_DIR = path.resolve(import.meta.dir, '../../backend')
const CONVEX_BIN = path.resolve(BACKEND_DIR, 'node_modules/.bin/convex')
const PENDING_STATES = ['pending', 'queued', 'withdrawing'] as const
const KINDS = ['baseline', 'pair'] as const
const DEV_DEPLOYMENT = /^dev:(?<name>[a-z]+-[a-z]+-\d+)$/u

type Options = {
  allowExisting?: boolean
  deployment: string
  hours: number
  parallelism: number
  poll: number
  timeout: number
}

async function exec(args: string[], { allowFailure = false } = {}): Promise<string> {
  const proc = Bun.spawn([CONVEX_BIN, ...args], {
    cwd: BACKEND_DIR,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (code !== 0 && !allowFailure) {
    throw new Error(
      `convex ${args[0]} failed (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`,
    )
  }

  return stdout
}

/** Only the deployment selected in `.env.local`, and only a dev one, may be loaded. */
async function resolveDeployment(requested: string): Promise<string> {
  const name = DEV_DEPLOYMENT.exec(requested)?.groups?.name

  if (name === undefined) {
    throw new Error(
      `--deployment must be a dev deployment such as dev:happy-animal-123, got "${requested}"`,
    )
  }

  if ((process.env.CONVEX_DEPLOY_KEY ?? '') !== '') {
    throw new Error(
      'Refusing to run with CONVEX_DEPLOY_KEY set: deploy keys target production or preview',
    )
  }

  const envLocal = await Bun.file(path.resolve(BACKEND_DIR, '.env.local')).text()
  const selected = /^CONVEX_DEPLOYMENT=(?<value>\S+)/mu.exec(envLocal)?.groups?.value

  if (selected !== requested) {
    throw new Error(
      `--deployment ${requested} does not match the deployment selected in packages/backend/.env.local`,
    )
  }

  return name
}

/** Functions returning null print nothing when piped. */
const parseJson = (text: string): unknown => (text.trim() === '' ? null : JSON.parse(text))

function counts(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Expected record counts')
  }
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, Number(count)]))
}

type Convex = {
  inlineQuery: (query: string) => Promise<unknown>
  run: (fn: string, args?: string) => Promise<unknown>
  target: string[]
}

function connect(name: string): Convex {
  const target = ['--deployment', name]
  return {
    inlineQuery: async (query) =>
      parseJson(await exec(['run', '--inline-query', query, ...target])),
    run: async (fn, args = '{}') => parseJson(await exec(['run', fn, args, ...target])),
    target,
  }
}

const sumCounts = (values: Record<string, number>) =>
  Object.values(values).reduce((sum, count) => sum + count, 0)

function describeCounts(values: Record<string, number>) {
  return (
    Object.entries(values)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${key}=${count}`)
      .join(' ') || 'no records'
  )
}

/** Stream function logs into the report until the returned handle is stopped. */
function captureLogs(target: string[], report: ContentionReport) {
  const proc = Bun.spawn([CONVEX_BIN, 'logs', '--jsonl', '--success', ...target], {
    cwd: BACKEND_DIR,
    stderr: 'ignore',
    stdout: 'pipe',
  })
  const done = (async () => {
    let buffered = ''
    for await (const chunk of proc.stdout) {
      buffered += new TextDecoder().decode(chunk)
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        addLogLine(report, line)
      }
    }
  })()
  return {
    stop: async () => {
      proc.kill()
      // The stream can stay open briefly after the kill; the report only needs what arrived.
      await Promise.race([done.catch(() => undefined), Bun.sleep(3000)])
    },
  }
}

/** Number of kind/state pairs that still hold unfinished records, from the exact index rather than counts. */
async function outstanding(convex: Convex) {
  const found = await convex.inlineQuery(
    `const out = []; for (const kind of ${JSON.stringify(KINDS)}) for (const state of ${JSON.stringify(PENDING_STATES)}) { const r = await ctx.db.query("ingestion_records").withIndex("by_kind_and_state_and_scan_at", (q) => q.eq("kind", kind).eq("state", state)).first(); if (r) out.push(kind + "/" + state); } return out`,
  )
  return Array.isArray(found) ? found.length : 1
}

/** Poll until records stop changing with nothing outstanding; returns whether the timeout hit first. */
async function waitForSettle(
  convex: Convex,
  report: ContentionReport,
  options: Options,
  startedAt: number,
) {
  const deadline = startedAt + options.timeout * 60_000
  let settledTotal = -1
  let settledPolls = 0

  while (Date.now() <= deadline) {
    await Bun.sleep(options.poll * 1000)
    const current = counts(await convex.run('ingestion/records:counts'))
    const total = sumCounts(current)
    const open = await outstanding(convex)
    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    console.error(
      `[${elapsed}s] ${describeCounts(current)} | OCC retries ${totals(report).occRetries}`,
    )

    // Registration may still be adding records, so quiescence must hold across polls at a stable total.
    settledPolls = open === 0 && total > 0 && total === settledTotal ? settledPolls + 1 : 0
    settledTotal = open === 0 ? total : -1

    if (settledPolls >= 2) {
      return false
    }
  }

  return true
}

function printContention(report: ContentionReport) {
  const sum = totals(report)
  console.log(`Log events ${report.events}; executions ${sum.executions}`)
  console.log(
    `OCC retries ${sum.occRetries}; OCC exhausted ${sum.occExhausted}; other errors ${sum.otherErrors}`,
  )
  console.log(
    `[ingestion] request failed ${report.requestFailed}; completion lost ${report.completionLost}`,
  )

  const contended = Object.entries(report.functions).filter(
    ([, stats]) => stats.occRetries + stats.occExhausted + stats.otherErrors > 0,
  )

  if (contended.length > 0) {
    console.log('Errors by function (occRetries / occExhausted / other of executions):')
    for (const [fn, stats] of contended) {
      console.log(
        `  ${fn}: ${stats.occRetries} / ${stats.occExhausted} / ${stats.otherErrors} of ${stats.executions}`,
      )
    }
  }

  if (report.sampleErrors.length > 0) {
    console.log(`Sample log errors:\n  ${report.sampleErrors.join('\n  ')}`)
  }
}

async function printInsights(name: string, target: string[]) {
  const parsed = parseJson(await exec(['insights', '--json', ...target], { allowFailure: true }))
  const list =
    typeof parsed === 'object' && parsed !== null && 'insights' in parsed ? parsed.insights : []
  const insights = Array.isArray(list) ? list : []
  console.log(`Convex insights (72h window, not scoped to this run): ${insights.length}`)
  for (const insight of insights) {
    console.log(`  ${JSON.stringify(insight).slice(0, 300)}`)
  }
  console.log(`Dashboard insights: https://dashboard.convex.dev/d/${name}?view=insights`)
}

async function sourceWindow(convex: Convex, hours: number) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Shape is fixed by ingestion/admin:sourceScanBounds.
  const bounds = (await convex.run('ingestion/admin:sourceScanBounds')) as {
    earliest: string | null
    latest: string | null
  }

  if (bounds.latest === null) {
    throw new Error(
      'The object source has no scans; check ORCA_OBJECTS_SOURCE_DEPLOYMENT and ORCA_OBJECTS_API_KEY',
    )
  }

  const startAt = new Date(Date.parse(bounds.latest) - hours * 3_600_000).toISOString()
  return { earliest: bounds.earliest, endAt: bounds.latest, startAt }
}

async function main(options: Options) {
  const name = await resolveDeployment(options.deployment)
  const convex = connect(name)

  if (
    options.allowExisting !== true &&
    sumCounts(counts(await convex.run('ingestion/records:counts'))) > 0
  ) {
    throw new Error(
      'Deployment already has ingestion records; use a fresh deployment, or --allow-existing to widen the target (the window start may only move earlier)',
    )
  }

  const { earliest, endAt, startAt } = await sourceWindow(convex, options.hours)
  console.error(`Deployment ${name}; source scans ${earliest} .. ${endAt}`)
  console.error(
    `Target ${startAt} .. ${endAt}, parallelism ${options.parallelism}, timeout ${options.timeout}m`,
  )

  const startedAt = Date.now()
  const report = emptyReport()
  const logs = captureLogs(convex.target, report)
  // Let the log stream attach before work starts.
  await Bun.sleep(5000)

  await exec([
    'env',
    'set',
    'ORCA_INGESTION_PARALLELISM',
    String(options.parallelism),
    ...convex.target,
  ])
  await convex.run('ingestion/target:set', JSON.stringify({ end_at: endAt, start_at: startAt }))
  await convex.run('ingestion/sync:run')

  const timedOut = await waitForSettle(convex, report, options, startedAt)
  await convex.run('ingestion/reconcile:sweep')
  await Bun.sleep(15_000)

  const final = counts(await convex.run('ingestion/records:counts'))
  const failed = await convex.inlineQuery(
    `const out = []; for (const kind of ${JSON.stringify(KINDS)}) { const rows = await ctx.db.query("ingestion_records").withIndex("by_kind_and_state_and_scan_at", (q) => q.eq("kind", kind).eq("state", "failed")).take(5); for (const r of rows) out.push({ kind, scan_at: r.scan_at, error: r.error }); } return out`,
  )
  const stillOpen = await outstanding(convex)
  await logs.stop()

  const failedCount = KINDS.reduce((sum, kind) => sum + (final[`${kind}/failed`] ?? 0), 0)
  const sum = totals(report)

  console.log(`\nIngestion load summary (${name})`)
  console.log(
    `Window ${options.hours}h  ${startAt} .. ${endAt}  parallelism ${options.parallelism}`,
  )
  console.log(
    `Duration ${Math.round((Date.now() - startedAt) / 1000)}s${timedOut ? ' (TIMED OUT)' : ''}`,
  )
  console.log(`Records ${describeCounts(final)}`)
  printContention(report)

  if (Array.isArray(failed) && failed.length > 0) {
    console.log(`Failed record sample:\n  ${failed.map((row) => JSON.stringify(row)).join('\n  ')}`)
  }

  await printInsights(name, convex.target)

  const problems = [
    timedOut && 'timed out',
    stillOpen > 0 && 'records still pending, queued or withdrawing',
    failedCount > 0 && `${failedCount} failed records`,
    sum.occExhausted > 0 && `${sum.occExhausted} OCC-exhausted executions`,
    report.completionLost > 0 && `${report.completionLost} completion lost`,
  ].filter((problem): problem is string => typeof problem === 'string')

  console.log(problems.length === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${problems.join('; ')})`)
  process.exitCode = problems.length === 0 ? 0 : 1
}

const program = new Command()
  .name('ingestion-load')
  .description(
    'Backfill the latest scans on a dev deployment at high parallelism and report contention',
  )
  .requiredOption(
    '--deployment <dev:name>',
    'dev deployment; must match packages/backend/.env.local',
  )
  .option('--hours <n>', 'window ending at the latest source scan', Number, 24)
  .option('--parallelism <n>', 'ORCA_INGESTION_PARALLELISM to set (1-100)', Number, 32)
  .option('--timeout <minutes>', 'give up waiting after this long', Number, 30)
  .option(
    '--allow-existing',
    'run on a deployment that already holds records; the new window must widen the old one',
  )
  .option('--poll <seconds>', 'progress polling interval', Number, 10)
  .showHelpAfterError()
  .action(async (options: Options) => {
    await main(options)
  })

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
