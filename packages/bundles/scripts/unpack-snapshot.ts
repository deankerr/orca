import { createReadStream } from 'node:fs'
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'

import { Command } from 'commander'
import prettyBytes from 'pretty-bytes'

interface SnapshotCrawl {
  crawlId: string
  rawBytes: number
  storageId: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const color = process.stdout.isTTY
  ? {
      accent: '\u001B[36m',
      dim: '\u001B[2m',
      progress: '\u001B[32m',
      reset: '\u001B[0m',
      strong: '\u001B[1m',
    }
  : { accent: '', dim: '', progress: '', reset: '', strong: '' }

const styled = (style: keyof typeof color, value: string) => `${color[style]}${value}${color.reset}`

const parseSnapshotCrawl = (line: string, lineNumber: number): SnapshotCrawl => {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new Error(`invalid snapshot crawl metadata at line ${lineNumber}`)
  }
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.size)) {
    throw new Error(`invalid snapshot crawl metadata at line ${lineNumber}`)
  }
  if (
    typeof value.crawl_id !== 'string' ||
    typeof value.storage_id !== 'string' ||
    typeof value.data.size.raw !== 'number'
  ) {
    throw new TypeError(`invalid snapshot crawl metadata at line ${lineNumber}`)
  }
  return {
    crawlId: value.crawl_id,
    rawBytes: value.data.size.raw,
    storageId: value.storage_id,
  }
}

const readSnapshotCrawls = async (snapshotDirectory: string): Promise<SnapshotCrawl[]> => {
  const metadataPath = path.join(snapshotDirectory, 'snapshot_crawl_archives', 'documents.jsonl')
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(metadataPath),
  })
  const crawls: SnapshotCrawl[] = []
  const crawlIds = new Set<string>()
  let lineNumber = 0

  for await (const line of lines) {
    lineNumber += 1
    if (line === '') {
      continue
    }
    const crawl = parseSnapshotCrawl(line, lineNumber)
    if (crawlIds.has(crawl.crawlId)) {
      throw new Error(`duplicate crawl id ${crawl.crawlId} in ${metadataPath}`)
    }
    crawlIds.add(crawl.crawlId)
    crawls.push(crawl)
  }

  return crawls.toSorted((left, right) => Number(left.crawlId) - Number(right.crawlId))
}

const latestUnpackedCrawl = async (outputDirectory: string, crawls: SnapshotCrawl[]) => {
  const crawlsById = new Map(crawls.map((crawl) => [crawl.crawlId, crawl]))
  let latest: SnapshotCrawl | undefined

  for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }
    const crawl = crawlsById.get(entry.name.slice(0, -'.json'.length))
    if (
      crawl !== undefined &&
      (latest === undefined || Number(crawl.crawlId) > Number(latest.crawlId))
    ) {
      latest = crawl
    }
  }

  return latest
}

const unpackSnapshot = async (snapshotDirectory: string, outputDirectory: string) => {
  const crawls = await readSnapshotCrawls(snapshotDirectory)
  await mkdir(outputDirectory, { recursive: true })

  const latest = await latestUnpackedCrawl(outputDirectory, crawls)
  const startIndex = latest === undefined ? 0 : crawls.indexOf(latest) + 1
  let rawBytes = crawls.slice(0, startIndex).reduce((total, crawl) => total + crawl.rawBytes, 0)
  const action = latest === undefined ? 'Unpacking' : `Resuming after ${latest.crawlId}`
  console.info(
    `${styled('accent', action)} ${styled('strong', crawls.length.toLocaleString())} ${styled('dim', 'crawl bundles')} ${styled('dim', `to ${outputDirectory}`)}`,
  )

  for (let index = startIndex; index < crawls.length; index += 1) {
    const crawl = crawls[index]
    if (crawl === undefined) {
      continue
    }
    const sourcePath = path.join(snapshotDirectory, '_storage', crawl.storageId)
    const outputPath = path.join(outputDirectory, `${crawl.crawlId}.json`)
    const raw = Bun.gunzipSync(await Bun.file(sourcePath).bytes())
    const partialPath = `${outputPath}.part`
    await writeFile(partialPath, raw)
    await rename(partialPath, outputPath)

    const completed = index + 1
    rawBytes += crawl.rawBytes
    if (completed % 100 === 0 || completed === crawls.length) {
      const percentage = (completed / crawls.length) * 100
      const barWidth = 24
      const filled = Math.round((percentage / 100) * barWidth)
      const progress = `[${'='.repeat(filled)}${'-'.repeat(barWidth - filled)}]`
      console.info(
        `${styled('progress', progress)} ${styled('strong', `${percentage.toFixed(1)}%`)} ${styled('dim', `${completed.toLocaleString()}/${crawls.length.toLocaleString()} | ${prettyBytes(rawBytes)}`)}`,
      )
    }
  }

  console.info(
    `${styled('accent', 'Complete')} ${styled('strong', prettyBytes(rawBytes))} ${styled('dim', `to ${outputDirectory}`)}`,
  )
}

const command = new Command()
  .name('unpack-snapshot')
  .description('Decompress every crawl bundle from a Convex snapshot')
  .argument('<snapshot-directory>', 'directory containing the Convex snapshot export')
  .option('-o, --output <directory>', 'directory for decompressed crawl files')
  .action(async (snapshotDirectory: string, options: { output?: string }) => {
    const resolvedSnapshotDirectory = path.resolve(snapshotDirectory)
    const outputDirectory =
      options.output === undefined
        ? path.join(
            path.dirname(resolvedSnapshotDirectory),
            `${path.basename(resolvedSnapshotDirectory)}-unpacked`,
          )
        : path.resolve(options.output)
    await unpackSnapshot(resolvedSnapshotDirectory, outputDirectory)
  })

await command.parseAsync()
