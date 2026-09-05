import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const vMetadataRecord = v.record(
  v.string(),
  v.union(v.boolean(), v.number(), v.null(), v.string(), v.array(v.string())),
)

/** Append-only endpoint listing transitions. */
export const V3_ENDPOINTS_LISTING_SERIES_TABLE = 'v3_endpoints_listing_series' as const

export const endpointsListingTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  state: v.union(v.literal('listed'), v.literal('unlisted')),
}).index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

export type EndpointListingRow = Infer<typeof endpointsListingTable.validator>

export const V3_ENDPOINTS_PRICING_SERIES_TABLE = 'v3_endpoints_pricing_series' as const

export const endpointsPricingTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),

  prompt: v.string(),
  completion: v.string(),
  discount: v.number(),

  image: v.optional(v.string()),
  image_output: v.optional(v.string()),

  input_cache_read: v.optional(v.string()),
  input_cache_write: v.optional(v.string()),
  input_cache_write_1h: v.optional(v.string()),

  audio: v.optional(v.string()),
  input_audio_cache: v.optional(v.string()),

  web_search: v.optional(v.string()),

  overrides: v.optional(v.array(vMetadataRecord)),
})
  .index('by_endpoint_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

export type EndpointsPricingRow = Infer<typeof endpointsPricingTable.validator>

/**
 * Append-only stats samples. Unique on (`endpoint_id`, `scan_at`, `tier`).
 */
export const V3_ENDPOINTS_STATS_SERIES_TABLE = 'v3_endpoints_stats_series' as const

export const endpointsStatsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  /** `statsByTier` key, or `default` for a legacy `stats` object. */
  tier: v.string(),
  /** Numeric fields of the upstream stats object, minus `endpoint_id`. */
  sample: v.record(v.string(), v.number()),
})
  .index('by_endpoint_scan_at', ['endpoint_id', 'scan_at', 'tier'])
  .index('by_scan_at', ['scan_at'])

export type StatsRow = Infer<typeof endpointsStatsTable.validator>
