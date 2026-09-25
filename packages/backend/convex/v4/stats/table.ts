import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Convex table for the grid's readings from the current stats cursor's scan. */
export const V4_CURRENT_STATS_TABLE = 'v4_current_stats' as const

/** An endpoint's current default-tier readings; endpoints with no reading have no row. */
export const currentStatsTable = defineTable({
  endpoint_id: v.string(),
  p50_throughput: v.optional(v.number()),
  p50_latency: v.optional(v.number()),
})

/** A current stats row, before Convex system fields. */
export type CurrentStatsRow = Infer<typeof currentStatsTable.validator>
