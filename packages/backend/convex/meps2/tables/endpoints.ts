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
}).index('by_endpoint_id', ['endpoint_id'])
