import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const endpointsTable = defineTable({
  updated_at: v.number(),
  endpoint_id: v.string(),
  model_id: v.string(),
  variant: v.string(),
  provider_tag: v.string(),
  provider_id: v.string(),

  metadata: v.record(v.string(), v.union(v.boolean(), v.number(), v.string(), v.array(v.string()))),

  // start of the current catalog absence; unset means listed in the latest complete scan
  unlisted_at: v.optional(v.number()),
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_unlisted_at', ['unlisted_at'])
