import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const statsTable = defineTable({
  endpoint_id: v.string(),
  timestamp: v.number(),
  p50_latency: v.number(),
  p50_throughput: v.number(),
  request_count: v.number(),
})
