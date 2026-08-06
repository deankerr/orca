import { Database } from 'bun:sqlite'

import * as Core from '@orca/schema/area-2-core.ts'
import type { CorePricing } from '@orca/schema/area-2-core.ts'
import * as Schema from 'effect/Schema'

export type PricingRevisionKind = 'available' | 'baseline' | 'pricing' | 'unavailable'

export interface PricingHistoryPoint {
  at: number
  available: boolean
  pricing: CorePricing
}

export interface PricingHistorySeries {
  endpointId: string
  points: PricingHistoryPoint[]
  provider: {
    displayName: string
    modelId: string
    name: string
    slug: string
  }
}

export interface PricingHistory {
  asOf: number
  modelSlug: string
  series: PricingHistorySeries[]
  since: number
}

interface BoundsRow {
  first_crawl_id: string | null
  last_crawl_id: string | null
}

interface CurrentEndpointRow {
  id: string
  state_json: string
}

interface PricingRevisionRow {
  crawl_id: string
  endpoint_id: string
  pricing_json: string | null
  provider_display_name: string
  provider_model_id: string
  provider_name: string
  provider_slug: string
  revision_kind: PricingRevisionKind
}

type MutablePricingSeries = {
  endpointId: string
  points: PricingHistoryPoint[]
  provider: PricingHistorySeries['provider']
}

const decodeEndpoint = Schema.decodeUnknownSync(Core.CoreEndpoint)
const decodePricing = Schema.decodeUnknownSync(Core.CorePricing)

const parseStoredJson = (value: string, description: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`stored ${description} is not valid JSON`)
  }
}

/**
 * Reads chart-ready endpoint price states for one model from the compact Area 2 pricing projection.
 * Active endpoints receive a terminal point at the latest crawl so a standing rate extends to the
 * current database boundary without duplicating unchanged price cards on every crawl.
 */
export const readPricingHistory = (filename: string, modelSlug: string): PricingHistory => {
  const database = new Database(filename, { readonly: true })

  try {
    const bounds = database
      .query<BoundsRow, []>(
        'SELECT MIN(crawl_id) AS first_crawl_id, MAX(crawl_id) AS last_crawl_id FROM crawls',
      )
      .get()
    if (bounds === null || bounds.first_crawl_id === null || bounds.last_crawl_id === null) {
      throw new Error(`product database ${filename} contains no crawls`)
    }

    const revisions = database
      .query<PricingRevisionRow, [string]>(`
        SELECT
          crawl_id, endpoint_id, provider_name, provider_display_name, provider_slug,
          provider_model_id, revision_kind, pricing_json
        FROM endpoint_pricing_revisions
        WHERE model_slug = ?
        ORDER BY CAST(crawl_id AS INTEGER), endpoint_id
      `)
      .all(modelSlug)

    const seriesByEndpoint = new Map<string, MutablePricingSeries>()
    for (const revision of revisions) {
      let series = seriesByEndpoint.get(revision.endpoint_id)
      if (series === undefined) {
        series = {
          endpointId: revision.endpoint_id,
          points: [],
          provider: {
            displayName: revision.provider_display_name,
            modelId: revision.provider_model_id,
            name: revision.provider_name,
            slug: revision.provider_slug,
          },
        }
        seriesByEndpoint.set(revision.endpoint_id, series)
      }

      const available = revision.revision_kind !== 'unavailable'
      series.points.push({
        at: Number(revision.crawl_id),
        available,
        pricing:
          revision.pricing_json === null
            ? {}
            : decodePricing(
                parseStoredJson(revision.pricing_json, `pricing ${revision.endpoint_id}`),
              ),
      })
    }

    const asOf = Number(bounds.last_crawl_id)
    const currentEndpoints = database
      .query<CurrentEndpointRow, [string]>(
        'SELECT id, state_json FROM endpoints WHERE model_slug = ?',
      )
      .all(modelSlug)
    for (const current of currentEndpoints) {
      const series = seriesByEndpoint.get(current.id)
      if (series === undefined || series.points.at(-1)?.at === asOf) {
        continue
      }
      const endpoint = decodeEndpoint(parseStoredJson(current.state_json, `endpoint ${current.id}`))
      series.points.push({ at: asOf, available: true, pricing: endpoint.pricing })
    }

    return {
      asOf,
      modelSlug,
      series: [...seriesByEndpoint.values()].toSorted(
        (left, right) =>
          left.provider.name.localeCompare(right.provider.name) ||
          left.endpointId.localeCompare(right.endpointId),
      ),
      since: Number(bounds.first_crawl_id),
    }
  } finally {
    database.close()
  }
}
