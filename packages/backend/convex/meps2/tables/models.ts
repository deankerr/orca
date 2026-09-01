import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { vMetadataRecord } from './shared'

/**
 * Current catalog models. `scan_at` is last write. Catalog-absent models stay.
 */
export const modelsTable = defineTable({
  /** Scan that last wrote this row. */
  scan_at: v.string(),
  model_id: v.string(),
  permaslug: v.string(),
  variant: v.string(),

  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  /** OpenRouter `created_at`. */
  or_created_at: v.string(),

  /** OpenRouter `name`. */
  display_name: v.string(),
  author_display_name: v.string(),

  /** Remaining source fields. Nested objects and non-string arrays are dropped. */
  metadata: vMetadataRecord,
}).index('by_model_id', ['model_id'])
