import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const providersTable = defineTable({
  updated_at: v.number(),
  provider_id: v.string(),
  display_name: v.string(),

  metadata: v.record(v.string(), v.union(v.boolean(), v.number(), v.string(), v.array(v.string()))),
}).index('by_provider_id', ['provider_id'])
