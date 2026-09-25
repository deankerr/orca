import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { pricing } from '../pricing'

/** Convex table for retained endpoint prices. */
export const V4_ENDPOINT_PRICES_TABLE = 'v4_endpoint_pricing_history' as const
/** Convex table for endpoint listing transitions. */
export const V4_ENDPOINT_LISTINGS_TABLE = 'v4_endpoint_listing_history' as const
/** Convex table for supplied performance samples. */
export const V4_ENDPOINT_STATS_TABLE = 'v4_endpoint_stats' as const

/** Endpoint availability at a listing transition. */
export const listingState = v.union(v.literal('listed'), v.literal('unlisted'))

/** Selected pricing for an endpoint at an observation time. */
export const endpointPricesTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  ...pricing.fields,
}).index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

/** One endpoint's availability, associations and addressable tag at a context change. */
export const endpointListingsTable = defineTable({
  scan_at: v.string(),
  endpoint_id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
  provider_tag: v.string(),
  state: listingState,
})
  .index('by_model_id_and_scan_at', ['model_id', 'scan_at'])
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

/** One supplied performance sample for an endpoint, scan, and tier. */
export const endpointStatsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  tier: v.string(),
  sample: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
})
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

/** A historical pricing row, before Convex system fields. */
export type EndpointPriceRow = Infer<typeof endpointPricesTable.validator>
/** A historical listing row, before Convex system fields. */
export type EndpointListingRow = Infer<typeof endpointListingsTable.validator>
/** An upstream stats row, before Convex system fields. */
export type EndpointStatsRow = Infer<typeof endpointStatsTable.validator>
