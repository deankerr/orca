import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { vMetadataRecord, vNestedMetadataRecord } from './shared'

/**
 * Append-only pricing samples. Unique on (`endpoint_id`, `scan_at`).
 */
export const pricingTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),

  /** Upstream decimal string. */
  prompt: v.string(),
  /** Upstream decimal string. */
  completion: v.string(),
  discount: v.number(),

  image: v.optional(v.string()),
  image_output: v.optional(v.string()),

  input_cache_read: v.optional(v.string()),
  input_cache_write: v.optional(v.string()),
  input_cache_write_1h: v.optional(v.string()),

  audio: v.optional(v.string()),
  input_audio_cache: v.optional(v.string()),

  web_search: v.optional(v.string()),

  internal_reasoning: v.optional(v.string()),
  image_token: v.optional(v.string()),
  audio_output: v.optional(v.string()),

  display_pricing: v.optional(v.array(vNestedMetadataRecord)),
  overrides: v.optional(v.array(vMetadataRecord)),
})
  .index('by_endpoint_scan_at', ['endpoint_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
