import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { decodeEventRows, endpointContext } from './decode.ts'
import type { EventRow } from './decode.ts'
import type { Pricing, PricingSeries, ProductEvent, TrackedPrice } from './types.ts'
import { trackedPrices } from './types.ts'

interface BoundsRow {
  readonly first_crawl_id: string
  readonly last_crawl_id: string
}

const trackedPriceByPath: Readonly<Record<string, TrackedPrice>> = {
  'pricing.completion': 'completion',
  'pricing.input_cache_read': 'input_cache_read',
  'pricing.input_cache_write': 'input_cache_write',
  'pricing.input_cache_write_1h': 'input_cache_write_1h',
  'pricing.prompt': 'prompt',
}
const pricingPaths = new Set(Object.keys(trackedPriceByPath))

const selectedPricing = (event: ProductEvent): Pricing => {
  const { pricing } = endpointContext(event).endpoint
  return Object.fromEntries(
    trackedPrices.flatMap((field) =>
      pricing[field] === undefined ? [] : [[field, pricing[field]]],
    ),
  )
}

type MutablePricingSeries = {
  availableFrom: number
  endpointId: string
  points: Array<PricingSeries['points'][number]>
  provider: PricingSeries['provider']
  unavailableAt?: number
}

export const pricingHistory = Effect.fn('labs.pricingHistory')(function* pricingHistory(
  modelSlug: string,
) {
  const sql = yield* SqlClient.SqlClient
  const [bounds] = yield* sql<BoundsRow>`
    SELECT MIN(crawl_id) AS first_crawl_id, MAX(crawl_id) AS last_crawl_id FROM crawls`
  if (bounds === undefined || bounds.first_crawl_id === null || bounds.last_crawl_id === null) {
    return yield* Effect.fail(new Error('product database contains no crawls'))
  }

  const rows = yield* sql<EventRow>`
    SELECT
      e.event_id, e.crawl_id, e.entity_type, e.entity_id, e.event_type,
      e.model_slug, e.provider_name, e.provider_slug, e.context_json,
      f.ordinal, f.path, f.before_present, f.before_json, f.after_present, f.after_json
    FROM entity_events AS e
    LEFT JOIN event_fields AS f ON f.event_id = e.event_id
    WHERE e.entity_type = 'endpoint'
      AND e.model_slug = ${modelSlug}
      AND (
        e.event_type IN ('baseline', 'available', 'unavailable')
        OR f.path IN ${sql.in([...pricingPaths])}
      )
    ORDER BY e.crawl_id, e.entity_id, f.ordinal`
  const events = decodeEventRows(rows)
  const series: MutablePricingSeries[] = []
  const active = new Map<string, { pricing: Pricing; series: MutablePricingSeries }>()

  for (const event of events) {
    const at = Number(event.crawlId)
    if (event.eventType === 'baseline' || event.eventType === 'available') {
      const context = endpointContext(event)
      const pricing = selectedPricing(event)
      const next: MutablePricingSeries = {
        availableFrom: at,
        endpointId: event.entityId,
        points: [{ at, available: true, pricing: { ...pricing } }],
        provider: {
          displayName: context.endpoint.provider_display_name,
          name: context.endpoint.provider_name,
          slug: context.endpoint.provider_slug,
        },
      }
      series.push(next)
      active.set(event.entityId, { pricing, series: next })
      continue
    }

    const period = active.get(event.entityId)
    if (period === undefined) {
      continue
    }
    if (event.eventType === 'unavailable') {
      period.series.points.push({
        at,
        available: false,
        pricing: {},
      })
      period.series.unavailableAt = at
      active.delete(event.entityId)
      continue
    }

    const changed: Pricing = {}
    for (const field of event.fields) {
      const name = trackedPriceByPath[field.path]
      if (name === undefined) {
        continue
      }
      if (field.afterPresent) {
        if (typeof field.after !== 'string') {
          return yield* Effect.fail(new Error(`invalid stored price at ${field.path}`))
        }
        period.pricing[name] = field.after
        changed[name] = field.after
      } else {
        Reflect.deleteProperty(period.pricing, name)
        changed[name] = null
      }
    }
    period.series.points.push({
      at,
      available: true,
      pricing: changed,
    })
  }

  return {
    asOf: Number(bounds.last_crawl_id),
    modelSlug,
    series,
    since: Number(bounds.first_crawl_id),
  }
})
