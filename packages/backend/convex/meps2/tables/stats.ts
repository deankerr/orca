import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const statsTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  tier: v.string(),
  sample: v.record(v.string(), v.number()),
})
  .index('by_endpoint_scan_at', ['endpoint_id', 'scan_at', 'tier'])
  .index('by_scan_at', ['scan_at'])
