import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const PUBLIC_API_V2_CACHE_TABLE = 'public_api_v2_cache' as const

export const publicApiV2CacheTable = defineTable({
  content_type: v.string(),
  scan_at: v.optional(v.string()),
  // Retained for existing rows; cache identity now uses scan_at.
  scan_id: v.optional(v.string()),
  size: v.number(),
  storage_id: v.id('_storage'),
})
