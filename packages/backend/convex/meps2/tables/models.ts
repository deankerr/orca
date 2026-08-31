import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { vMetadataRecord } from './shared'

export const modelsTable = defineTable({
  scan_at: v.string(),
  model_id: v.string(),
  permaslug: v.string(),
  variant: v.string(),

  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  or_created_at: v.string(),

  display_name: v.string(),
  author_display_name: v.string(),

  metadata: vMetadataRecord,
}).index('by_model_id', ['model_id'])
