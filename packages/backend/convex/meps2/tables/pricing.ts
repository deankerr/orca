import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const pricingTable = defineTable({
  endpoint_id: v.string(),
  timestamp: v.number(),

  prompt: v.string(),
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

  display_pricing: v.optional(v.array(v.any())),
  overrides: v.optional(v.array(v.any())),
})
  .index('by_endpoint_timestamp', ['endpoint_id', 'timestamp'])
  .index('by_timestamp', ['timestamp'])
