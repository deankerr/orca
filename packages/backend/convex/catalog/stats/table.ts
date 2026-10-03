import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Singleton cache of the latest published endpoint stats. */
export const V4_CURRENT_STATS_TABLE = 'v4_current_stats_snapshot' as const

/** An endpoint's current default-tier readings; endpoints with no reading have no row. */
export const currentStatsRow = v.object({
  endpoint_id: v.string(),
  p50_throughput: v.optional(v.number()),
  p50_latency: v.optional(v.number()),
})

export type CurrentStatsRow = Infer<typeof currentStatsRow>

// ponytail: one document, bounded by 1 MiB / 8,192 rows; shard the snapshot if it approaches either limit.
export const currentStatsTable = defineTable({
  scan_at: v.string(),
  rows: v.array(currentStatsRow),
})
