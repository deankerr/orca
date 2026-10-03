import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const publicApiV2CacheTable = defineTable({
  // Retained for existing rows; cache identity now uses scan_at.
  scan_id: v.optional(v.string()),
  scan_at: v.optional(v.string()),
  content_type: v.string(),
  storage_id: v.id('_storage'),
  size: v.number(),
})
