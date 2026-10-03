import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const V4_ENDPOINT_STATS_TABLE = 'v4_endpoint_stats' as const

/** One supplied performance sample for an endpoint, scan, and tier. */
export const endpointStatsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  tier: v.string(),
  sample: v.record(v.string(), v.union(v.number(), v.string(), v.null())),
}).index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

export type EndpointStatsRow = Infer<typeof endpointStatsTable.validator>
