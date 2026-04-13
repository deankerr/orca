import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const archivesTable = defineTable({
  crawl_id: v.string(),
  storage_id: v.id('_storage'),
  data: v.record(v.string(), v.any()),
}).index('by_crawl_id', ['crawl_id'])
