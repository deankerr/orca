import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const ENDPOINT_STATS_TABLE = 'catalog_stats_history' as const

/** One supplied reading per endpoint, scan, and tier; absent readings do not carry forward. */
export const endpointStatsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  tier: v.string(),
  sample: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
}).index('by_endpoint_id_and_scan_at_and_tier', ['endpoint_id', 'scan_at', 'tier'])

export type EndpointStatsRow = Infer<typeof endpointStatsTable.validator>
