import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const publicApiV2CacheTable = defineTable({
  content_type: v.string(),
  storage_id: v.id('_storage'),
  size: v.number(),
})
