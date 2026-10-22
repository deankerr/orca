import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const ENDPOINT_STATS_TABLE = 'catalog_stats_history' as const

/** One supplied reading per endpoint, scan, and tier; absent readings do not carry forward. */
export const endpointStatsTable = defineTable({
  endpoint_id: v.string(),
  sample: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
  scan_at: v.string(),
  tier: v.string(),
})
  .index('by_endpoint_id_and_scan_at_and_tier', ['endpoint_id', 'scan_at', 'tier'])
  .index('by_scan_at', ['scan_at'])

export type EndpointStatsRow = Infer<typeof endpointStatsTable.validator>
