import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { Command } from 'commander'

interface CliOptions {
  backendPath: string
  bundlesPath: string
  since: string
  siteUrl: string
}

interface CrawlReference {
  crawl_at: string
  crawl_id: string
}

const program = new Command()
  .name('sync-bundles')
  .description('Download missing formatted crawl bundles from a Convex deployment')
  .requiredOption('--backend-path <directory>', 'directory containing the Convex project')
  .requiredOption('--bundles-path <directory>', 'destination for ModelEndpointsV1 bundles')
  .requiredOption('--site-url <url>', 'Convex HTTP actions origin')
  .option('--since <date>', 'inclusive ISO date for the dense corpus', '2026-08-16')
  .action(run)

try {
  await program.parseAsync(Bun.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

async function run(options: CliOptions): Promise<void> {
  const since = new Date(options.since)
  if (Number.isNaN(since.valueOf())) {
    throw new TypeError(`Invalid --since date: ${options.since}`)
  }

  const destination = path.resolve(options.bundlesPath)
  await mkdir(destination, { recursive: true })
  const crawls = await queryCrawls(path.resolve(options.backendPath), since.valueOf())
  let downloaded = 0
  const rejected: CrawlReference[] = []
  let skipped = 0

  for (const [index, crawl] of crawls.entries()) {
    const filename = `${crawl.crawl_at}.me1.orca.json.gz`
    const outputPath = path.join(destination, filename)
    if (await Bun.file(outputPath).exists()) {
      skipped += 1
      continue
    }

    const url = new URL('/bundle', options.siteUrl)
    url.searchParams.set('crawl_id', crawl.crawl_id)
    url.searchParams.set('format', 'true')
    url.searchParams.set('gzip', 'true')
    const response = await fetch(url)
    if (response.status === 422) {
      rejected.push(crawl)
      console.error(`[${index + 1}/${crawls.length}] rejected by formatter ${filename}`)
      continue
    }
    if (!response.ok) {
      throw new Error(`Bundle ${crawl.crawl_id} returned HTTP ${response.status}.`)
    }
    await writeResponseAtomic(outputPath, response)
    downloaded += 1
    console.error(`[${index + 1}/${crawls.length}] downloaded ${filename}`)
  }

  console.error(
    `Synced ${crawls.length} crawls: downloaded ${downloaded}, skipped ${skipped}, formatter-rejected ${rejected.length}.`,
  )
  for (const crawl of rejected) {
    console.error(`Formatter-rejected crawl: ${crawl.crawl_at} (${crawl.crawl_id})`)
  }
}

async function queryCrawls(backendPath: string, since: number): Promise<CrawlReference[]> {
  const query = `return (await ctx.db.query("snapshot_crawl_archives").withIndex("by_crawl_id", q => q.gte("crawl_id", "${since}")).order("asc").collect()).map(({ crawl_id }) => ({ crawl_id, crawl_at: new Date(Number(crawl_id)).toISOString() }))`
  const process = Bun.spawn(['bunx', 'convex', 'run', '--inline-query', query], {
    cwd: backendPath,
    stderr: 'inherit',
    stdout: 'pipe',
  })
  const output = await new Response(process.stdout).text()
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(`Convex crawl query exited with code ${exitCode}.`)
  }
  const value: unknown = JSON.parse(output)
  if (!Array.isArray(value) || !value.every(isCrawlReference)) {
    throw new Error('Convex crawl query returned an unexpected value.')
  }
  return value
}

async function writeResponseAtomic(outputPath: string, response: Response): Promise<void> {
  const temporaryPath = `${outputPath}.${process.pid}.${Bun.randomUUIDv7()}.tmp`
  try {
    await Bun.write(temporaryPath, response)
    Bun.gunzipSync(await Bun.file(temporaryPath).bytes())
    await rename(temporaryPath, outputPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

function isCrawlReference(value: unknown): value is CrawlReference {
  return (
    value !== null &&
    typeof value === 'object' &&
    'crawl_at' in value &&
    typeof value.crawl_at === 'string' &&
    'crawl_id' in value &&
    typeof value.crawl_id === 'string'
  )
}
