import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const modelsTable = defineTable({
  updated_at: v.number(),
  model_id: v.string(),
  permaslug: v.string(),
  variant: v.string(),

  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  or_created_at: v.string(),

  display_name: v.string(),
  author_display_name: v.string(),

  metadata: v.record(v.string(), v.union(v.boolean(), v.number(), v.string(), v.array(v.string()))),
}).index('by_model_id', ['model_id'])
