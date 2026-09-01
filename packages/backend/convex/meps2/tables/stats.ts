import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Append-only stats samples. Unique on (`endpoint_id`, `scan_at`, `tier`).
 */
export const statsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  /** `statsByTier` key, or `default` for a legacy `stats` object. */
  tier: v.string(),
  /** Numeric fields of the upstream stats object, minus `endpoint_id`. */
  sample: v.record(v.string(), v.number()),
})
  .index('by_endpoint_scan_at', ['endpoint_id', 'scan_at', 'tier'])
  .index('by_scan_at', ['scan_at'])
