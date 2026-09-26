import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Cumulative model knowledge; departed models retain their last-known facts. */
export const V4_CURRENT_MODELS_TABLE = 'v4_models' as const

export const currentModelsTable = defineTable({
  model_id: v.string(),
  scan_at: v.string(),
  slug: v.string(),
  permaslug: v.string(),
  variant: v.string(),
  display_name: v.string(),
  or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  metadata_json: v.string(),
}).index('by_model_id', ['model_id'])

export type CurrentModelRow = Infer<typeof currentModelsTable.validator>
