import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { availabilityFields } from '../shared/availability'

export const endpointsTable = defineTable({
  uuid: v.string(),

  model: v.object({
    slug: v.string(),
    base_slug: v.string(),
    version_slug: v.string(),
    variant: v.string(),

    name: v.string(),
    icon_url: v.string(), // deprecated

    author_slug: v.string(),
    author_name: v.string(),

    or_added_at: v.number(),

    input_modalities: v.array(v.string()),
    output_modalities: v.array(v.string()),

    reasoning: v.boolean(),
  }),
  provider: v.object({
    slug: v.string(),
    tag_slug: v.string(),

    name: v.string(),
    icon_url: v.string(), // deprecated

    model_id: v.string(),
    region: v.optional(v.string()),
  }),

  data_policy: v.object({
    training: v.optional(v.boolean()),
    can_publish: v.optional(v.boolean()),
    requires_user_ids: v.optional(v.boolean()),

    retains_prompts: v.optional(v.boolean()),
    retains_prompts_days: v.optional(v.number()),
  }),

  pricing: v.object({
    text_input: v.optional(v.number()),
    text_output: v.optional(v.number()),

    internal_reasoning: v.optional(v.number()),

    audio_input: v.optional(v.number()),
    audio_cache_input: v.optional(v.number()),

    cache_read: v.optional(v.number()),
    cache_write: v.optional(v.number()),

    image_input: v.optional(v.number()),
    image_output: v.optional(v.number()),

    request: v.optional(v.number()),
    web_search: v.optional(v.number()),

    discount: v.optional(v.number()),
  }),

  variable_pricings: v.optional(
    v.array(
      v.object({
        type: v.literal('prompt-threshold'),
        threshold: v.number(),
        text_input: v.number(),
        text_output: v.number(),
        cache_read: v.optional(v.number()),
        cache_write: v.optional(v.number()),
      }),
    ),
  ),

  limits: v.object({
    text_input_tokens: v.optional(v.number()),
    text_output_tokens: v.optional(v.number()),

    image_input_tokens: v.optional(v.number()),
    images_per_input: v.optional(v.number()),

    requests_per_minute: v.optional(v.number()),
    requests_per_day: v.optional(v.number()),
  }),

  context_length: v.number(),
  quantization: v.optional(v.string()),
  supported_parameters: v.array(v.string()),

  completions: v.boolean(),
  chat_completions: v.boolean(),
  stream_cancellation: v.boolean(), // ignore
  implicit_caching: v.boolean(),
  file_urls: v.boolean(), // ignore
  native_web_search: v.boolean(),
  multipart: v.boolean(), // ignore
  mandatory_reasoning: v.optional(v.boolean()), // broken - source location changed

  moderated: v.boolean(),
  deranked: v.boolean(),
  disabled: v.boolean(),
  status: v.number(), // ignore

  stats: v.optional(
    v.object({
      p50_throughput: v.number(),
      p50_latency: v.number(),
    }),
  ),

  ...availabilityFields,
})
  .index('by_model_or_added_at', ['model.or_added_at'])
  .index('by_model_slug', ['model.slug'])
  .index('by_provider_slug', ['provider.slug'])
  .index('by_uuid', ['uuid'])
