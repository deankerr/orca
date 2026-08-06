import { Database } from 'bun:sqlite'

import * as Core from '@orca/schema/area-2-core.ts'
import * as Schema from 'effect/Schema'

import { PRODUCT_DATABASE_VERSION } from '../product-db/index.ts'
import type { MonitorEvent, MonitorSummary, PricingRevision } from './render.ts'

interface EventRow {
  change_kind: MonitorEvent['changeKind']
  changeset_json: string
  context_json: string | null
  context_kind: MonitorEvent['contextKind']
  crawl_id: string
  entity_id: string
  entity_type: MonitorEvent['entityType']
  model_name: string
  model_slug: string
  pricing_json: string | null
  pricing_provider_model_id: string | null
  pricing_revision_kind: string | null
  provider_display_name: string | null
  provider_name: string | null
  provider_slug: string | null
}

interface SummaryRow {
  crawls: number
  event_count: number
  first_crawl_id: string
  last_crawl_id: string
  pricing_revision_count: number
}

interface VersionRow {
  value: string
}

const pricingRevisionKinds = ['available', 'baseline', 'pricing', 'unavailable'] as const
const decodePricing = Schema.decodeUnknownSync(Core.CorePricing)

const isPricingRevisionKind = (value: string): value is PricingRevision['kind'] =>
  pricingRevisionKinds.some((kind) => kind === value)

const parseJson = (value: string, description: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${description} is not valid JSON`)
  }
}

const pricingRevision = (row: EventRow): PricingRevision | undefined => {
  if (row.pricing_revision_kind === null) {
    return undefined
  }
  if (!isPricingRevisionKind(row.pricing_revision_kind)) {
    throw new Error(
      `endpoint pricing revision ${row.entity_id} has unsupported kind ${row.pricing_revision_kind}`,
    )
  }
  if (row.pricing_provider_model_id === null) {
    throw new Error(`endpoint pricing revision ${row.entity_id} has no provider model id`)
  }
  if (row.pricing_revision_kind === 'unavailable') {
    if (row.pricing_json !== null) {
      throw new Error(`unavailable endpoint pricing revision ${row.entity_id} has a rate card`)
    }
    return {
      kind: 'unavailable',
      pricing: undefined,
      providerModelId: row.pricing_provider_model_id,
    }
  }
  if (row.pricing_json === null) {
    throw new Error(`endpoint pricing revision ${row.entity_id} has no rate card`)
  }
  return {
    kind: row.pricing_revision_kind,
    pricing: decodePricing(parseJson(row.pricing_json, `pricing revision ${row.entity_id}`)),
    providerModelId: row.pricing_provider_model_id,
  }
}

/** Reads recent Area 2 Monitor events with their persisted rate-card revisions when applicable. */
export const readMonitor = (databasePath: string, limit: number) => {
  const database = new Database(databasePath, { readonly: true })

  try {
    const version = database
      .query<VersionRow, [string]>('SELECT value FROM database_metadata WHERE key = ?')
      .get('schema_version')
    if (version === null || version.value !== PRODUCT_DATABASE_VERSION) {
      throw new Error(
        `unsupported product database version ${version?.value ?? 'missing'}; expected ${PRODUCT_DATABASE_VERSION}`,
      )
    }

    const summary = database
      .query<SummaryRow, []>(`
        SELECT
          (SELECT count(*) FROM crawls) AS crawls,
          (SELECT count(*) FROM model_changes) + (SELECT count(*) FROM endpoint_changes) AS event_count,
          (SELECT count(*) FROM endpoint_pricing_revisions) AS pricing_revision_count,
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
            context_json,
            NULL AS pricing_revision_kind,
            NULL AS pricing_json,
            NULL AS pricing_provider_model_id
          FROM model_changes
          UNION ALL
          SELECT
            'endpoint' AS entity_type,
            e.crawl_id,
            e.endpoint_id AS entity_id,
            e.model_name,
            e.model_slug,
            e.provider_display_name,
            e.provider_name,
            e.provider_slug,
            e.change_kind,
            e.changeset_json,
            e.context_kind,
            e.context_json,
            r.revision_kind AS pricing_revision_kind,
            r.pricing_json,
            r.provider_model_id AS pricing_provider_model_id
          FROM endpoint_changes AS e
          LEFT JOIN endpoint_pricing_revisions AS r
            ON r.crawl_id = e.crawl_id
           AND r.endpoint_id = e.endpoint_id
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
      pricingRevision: pricingRevision(row),
      providerDisplayName: row.provider_display_name ?? undefined,
      providerName: row.provider_name ?? undefined,
      providerSlug: row.provider_slug ?? undefined,
    }))

    return {
      events,
      summary: {
        crawls: summary.crawls,
        eventCount: summary.event_count,
        firstCrawlId: summary.first_crawl_id,
        lastCrawlId: summary.last_crawl_id,
        pricingRevisionCount: summary.pricing_revision_count,
      } satisfies Omit<MonitorSummary, 'generatedAt'>,
    }
  } finally {
    database.close()
  }
}
