import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

const vMetadataRecord = v.record(
  v.string(),
  v.union(v.boolean(), v.number(), v.null(), v.string(), v.array(v.string())),
)

/** Convex table name for append-only endpoint listing transitions. */
export const V3_ENDPOINTS_LISTING_SERIES_TABLE = 'v3_endpoints_listing_series' as const

/** Schema for append-only endpoint listing transitions. */
export const endpointsListingTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  state: v.union(v.literal('listed'), v.literal('unlisted')),
}).index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

/** Convex table name for append-only endpoint pricing samples. */
export const V3_ENDPOINTS_PRICING_SERIES_TABLE = 'v3_endpoints_pricing_series' as const

/** Schema for append-only endpoint pricing samples. */
export const endpointsPricingTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  discount: v.number(),
  meters: v.record(v.string(), v.string()),
  overrides: v.optional(v.array(vMetadataRecord)),
})
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

/** One complete endpoint pricing sample. */
export type EndpointPricingRow = Infer<typeof endpointsPricingTable.validator>

/** Convex table name for append-only endpoint stats samples. */
export const V3_ENDPOINTS_STATS_SERIES_TABLE = 'v3_endpoints_stats_series' as const

/** Schema for append-only endpoint stats samples. */
export const endpointsStatsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  /** Currently always `default` for the endpoint `stats` object. */
  tier: v.string(),
  /** Upstream stats values, minus `endpoint_id`. */
  sample: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
})
  .index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

/** One endpoint stats sample. */
export type EndpointStatsRow = Infer<typeof endpointsStatsTable.validator>
