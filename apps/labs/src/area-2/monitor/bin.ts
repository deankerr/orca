import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { readMonitor } from './read.ts'
import { renderMonitor } from './render.ts'
import type { MonitorSummary } from './render.ts'

const defaultDatabasePath = path.resolve(
  import.meta.dir,
  '../../../../../.labs-work/databases/area-2-products-v3-daily-pricing-revisions.sqlite',
)
const defaultOutputPath = path.resolve(
  import.meta.dir,
  '../../../../../.labs-work/reports/area-2-monitor/index.html',
)

const parsePositiveInteger = (value: string | undefined, name: string, fallback: number) => {
  if (value === undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; received ${value}`)
  }
  return parsed
}

const limit = parsePositiveInteger(process.argv[2], 'event limit', 100)
const databasePath = process.argv[3] ?? defaultDatabasePath
const outputPath = process.argv[4] ?? defaultOutputPath
const { events, summary } = readMonitor(databasePath, limit)
const monitorSummary: MonitorSummary = { ...summary, generatedAt: new Date().toISOString() }

await mkdir(path.dirname(outputPath), { recursive: true })
await Bun.write(outputPath, renderMonitor(monitorSummary, events, limit))
console.log({ databasePath, events: events.length, outputPath })
