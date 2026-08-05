import { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { renderMonitor } from './render.ts'
import type { MonitorEvent, MonitorSummary } from './render.ts'

const defaultDatabasePath = path.resolve(
  import.meta.dir,
  '../../../../../.labs-work/databases/area-2-products-v2-display-context.sqlite',
)
const defaultOutputPath = path.resolve(
  import.meta.dir,
  '../../../../../.labs-work/reports/area-2-monitor/index.html',
)

interface EventRow {
  readonly change_kind: MonitorEvent['changeKind']
  readonly changeset_json: string
  readonly context_json: string | null
  readonly context_kind: MonitorEvent['contextKind']
  readonly crawl_id: string
  readonly entity_id: string
  readonly entity_type: MonitorEvent['entityType']
  readonly model_name: string
  readonly model_slug: string
  readonly provider_display_name: string | null
  readonly provider_name: string | null
  readonly provider_slug: string | null
}

interface SummaryRow {
  readonly crawls: number
  readonly event_count: number
  readonly first_crawl_id: string
  readonly last_crawl_id: string
}

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

const parseJson = (value: string, description: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${description} is not valid JSON`)
  }
}

const limit = parsePositiveInteger(process.argv[2], 'event limit', 100)
const databasePath = process.argv[3] ?? defaultDatabasePath
const outputPath = process.argv[4] ?? defaultOutputPath
const database = new Database(databasePath, { readonly: true })

try {
  const summary = database
    .query<SummaryRow, []>(`
      SELECT
        (SELECT count(*) FROM crawls) AS crawls,
        (SELECT count(*) FROM model_changes) + (SELECT count(*) FROM endpoint_changes) AS event_count,
        (SELECT min(crawl_id) FROM crawls) AS first_crawl_id,
        (SELECT max(crawl_id) FROM crawls) AS last_crawl_id
    `)
    .get()
  if (summary === null || summary.crawls === 0) {
    throw new Error(`product database ${databasePath} contains no crawls`)
  }

  const rows = database
    .query<EventRow, [number]>(`
      WITH events AS (
        SELECT
          'model' AS entity_type,
          crawl_id,
          model_slug AS entity_id,
          model_name,
          model_slug,
          NULL AS provider_display_name,
          NULL AS provider_name,
          NULL AS provider_slug,
          change_kind,
          changeset_json,
          context_kind,
          context_json
        FROM model_changes
        UNION ALL
        SELECT
          'endpoint' AS entity_type,
          crawl_id,
          endpoint_id AS entity_id,
          model_name,
          model_slug,
          provider_display_name,
          provider_name,
          provider_slug,
          change_kind,
          changeset_json,
          context_kind,
          context_json
        FROM endpoint_changes
      )
      SELECT * FROM events
      ORDER BY CAST(crawl_id AS INTEGER) DESC, entity_type, entity_id
      LIMIT ?
    `)
    .all(limit)

  const events: MonitorEvent[] = rows.map((row) => ({
    changeKind: row.change_kind,
    changeset: parseJson(row.changeset_json, `${row.entity_type} changeset ${row.entity_id}`),
    context:
      row.context_json === null
        ? undefined
        : parseJson(row.context_json, `${row.entity_type} context ${row.entity_id}`),
    contextKind: row.context_kind,
    crawlId: row.crawl_id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    modelName: row.model_name,
    modelSlug: row.model_slug,
    providerDisplayName: row.provider_display_name ?? undefined,
    providerName: row.provider_name ?? undefined,
    providerSlug: row.provider_slug ?? undefined,
  }))

  const monitorSummary: MonitorSummary = {
    crawls: summary.crawls,
    eventCount: summary.event_count,
    firstCrawlId: summary.first_crawl_id,
    generatedAt: new Date().toISOString(),
    lastCrawlId: summary.last_crawl_id,
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await Bun.write(outputPath, renderMonitor(monitorSummary, events, limit))
  console.log({ databasePath, events: events.length, outputPath })
} finally {
  database.close()
}
