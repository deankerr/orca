import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Convex table for retained endpoint prices. */
export const V4_ENDPOINT_PRICES_TABLE = 'v4_endpointPrices' as const
/** Convex table for endpoint listing transitions. */
export const V4_ENDPOINT_LISTINGS_TABLE = 'v4_endpointListings' as const
/** Convex table for supplied performance samples. */
export const V4_ENDPOINT_READINGS_TABLE = 'v4_endpointReadings' as const

/** Endpoint availability at a listing transition. */
export const listingState = v.union(v.literal('listed'), v.literal('unlisted'))

/** Selected pricing, with the complete conditional-pricing array encoded as JSON. */
export const pricing = v.object({
  discount: v.number(),
  meters: v.record(v.string(), v.string()),
  overrides_json: v.optional(v.string()),
})

/** Selected pricing for an endpoint at an observation time. */
export const endpointPricesTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  ...pricing.fields,
})
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

/** One endpoint listing state and its model/provider associations. */
export const endpointListingsTable = defineTable({
  scan_at: v.string(),
  endpoint_id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
  state: listingState,
})
  .index('by_model_id_and_scan_at', ['model_id', 'scan_at'])
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

/** One supplied performance sample for an endpoint, scan, and tier. */
export const endpointReadingsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  tier: v.string(),
  sample: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
})
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

/** Row stored in `v4_endpointPrices`, before Convex system fields. */
export type EndpointPriceRow = Infer<typeof endpointPricesTable.validator>
/** Row stored in `v4_endpointListings`, before Convex system fields. */
export type EndpointListingRow = Infer<typeof endpointListingsTable.validator>
/** Row stored in `v4_endpointReadings`, before Convex system fields. */
export type EndpointReadingRow = Infer<typeof endpointReadingsTable.validator>
/** Selected pricing shared by price history and current endpoints. */
export type PricingRow = Infer<typeof pricing>
