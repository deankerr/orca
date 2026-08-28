import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const statsTable = defineTable({
  endpoint_id: v.string(),
  timestamp: v.number(),
  tier: v.string(),
  sample: v.record(v.string(), v.number()),
})
  .index('by_endpoint_timestamp', ['endpoint_id', 'timestamp'])
  .index('by_timestamp', ['timestamp'])
