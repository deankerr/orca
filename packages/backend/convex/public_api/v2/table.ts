import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const publicApiV2CacheTable = defineTable({
  // Transitional: old cache rows have no identity and refresh on the next cron run.
  scan_id: v.optional(v.string()),
  content_type: v.string(),
  storage_id: v.id('_storage'),
  size: v.number(),
})
