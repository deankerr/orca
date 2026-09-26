import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { pricing } from '../../pricing'

/** Current or last-known endpoints; unlisting retains the row rather than deleting it. */
export const V4_CURRENT_ENDPOINTS_TABLE = 'v4_endpoints' as const

export const currentEndpointsTable = defineTable({
  endpoint_id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
  provider_tag: v.string(),
  variant: v.string(),
  scan_at: v.string(),
  unlisted_at: v.optional(v.string()),
  model_display_name: v.string(),
  model_permaslug: v.string(),
  model_or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  provider_display_name: v.string(),
  pricing,
  metadata_json: v.string(),
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_model_id', ['model_id'])
  .index('by_provider_id_and_model_id', ['provider_id', 'model_id'])
  .index('by_unlisted_at', ['unlisted_at'])

export type CurrentEndpointRow = Infer<typeof currentEndpointsTable.validator>
