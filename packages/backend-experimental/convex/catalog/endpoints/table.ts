import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogVersionFields } from '../shared'

const endpointIdentityFields = {
  id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
}

// endpoints

export const endpointCoreDataFields = {
  ...endpointIdentityFields,

  model_version_slug: v.string(),
  model_variant: v.string(),
  provider_variant: v.optional(v.string()),
  provider_name: v.string(),
  provider_region: v.optional(v.string()),

  context_length: v.number(),
  max_output: v.optional(v.number()),
  quantization: v.string(),
  supported_parameters: v.array(v.string()),

  data_policy: v.object({
    may_train_on_data: v.optional(v.boolean()),
    may_publish_data: v.optional(v.boolean()),
    shares_user_id: v.optional(v.boolean()),
    may_retain_data: v.optional(v.boolean()),
    data_retention_days: v.optional(v.number()),
  }),

  limits: v.object({
    text_input_tokens: v.optional(v.number()),
    image_input_tokens: v.optional(v.number()),
    requests_per_minute: v.optional(v.number()),
    requests_per_day: v.optional(v.number()),
  }),

  capabilities: v.object({
    completions: v.boolean(),
    chat_completions: v.boolean(),
    implicit_caching: v.boolean(),
    native_web_search: v.boolean(),
  }),

  flags: v.object({
    moderated: v.boolean(),
    deranked: v.boolean(),
    disabled: v.boolean(),
  }),
}

export const catalogEndpointsTable = defineTable({
  ...endpointCoreDataFields,
  ...catalogVersionFields,
})
  .index('by_id__first_seen_at', ['id', 'first_seen_at'])
  .index('by_id__version', ['id', 'version'])

// endpoints_pricing

export const endpointPricingDataFields = {
  ...endpointIdentityFields,
  text_input: v.optional(v.number()),
  text_output: v.optional(v.number()),
  reasoning_output: v.optional(v.number()),
  audio_input: v.optional(v.number()),
  audio_cache_write: v.optional(v.number()),
  text_cache_read: v.optional(v.number()),
  text_cache_write: v.optional(v.number()),
  image_input: v.optional(v.number()),
  image_output: v.optional(v.number()),
  per_request: v.optional(v.number()),
  web_search: v.optional(v.number()),
  discount: v.optional(v.number()),
}

export const catalogEndpointPricingTable = defineTable({
  ...endpointPricingDataFields,
  ...catalogVersionFields,
})
  .index('by_id__first_seen_at', ['id', 'first_seen_at'])
  .index('by_id__version', ['id', 'version'])
