// Product-facing fields only
import * as Schema from 'effect/Schema'

export const CoreModel = Schema.Struct({
  slug: Schema.String,
  permaslug: Schema.String,
  name: Schema.String,
  short_name: Schema.String,
  description: Schema.String,
  author: Schema.String,
  created_at: Schema.String,
  context_length: Schema.Number,
  input_modalities: Schema.Array(Schema.String),
  output_modalities: Schema.Array(Schema.String),
  group: Schema.String,
  hf_slug: Schema.NullOr(Schema.String),
  instruct_type: Schema.NullOr(Schema.String),
  reasoning_config: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  supports_reasoning: Schema.optional(Schema.Boolean),
  promotion_message: Schema.optional(Schema.NullOr(Schema.String)),
  warning_message: Schema.NullOr(Schema.String),
})
export type CoreModel = Schema.Schema.Type<typeof CoreModel>

const Price = Schema.optional(Schema.String)

export const CorePricing = Schema.Struct({
  prompt: Price,
  completion: Price,
  audio: Price,
  input_audio_cache: Price,
  image: Price,
  image_output: Price,
  input_cache_read: Price,
  input_cache_write: Price,
  input_cache_write_1h: Price,
  internal_reasoning: Price,
  request: Price,
  web_search: Price,
  discount: Schema.optional(Schema.Number),
})
export type CorePricing = Schema.Schema.Type<typeof CorePricing>

export const CoreDataPolicy = Schema.Struct({
  training: Schema.optional(Schema.Boolean),
  retainsPrompts: Schema.optional(Schema.Boolean),
  canPublish: Schema.optional(Schema.Boolean),
  retentionDays: Schema.optional(Schema.Number),
  requiresUserIDs: Schema.optional(Schema.Boolean),
})
export type CoreDataPolicy = Schema.Schema.Type<typeof CoreDataPolicy>

export const CoreEndpointStats = Schema.Struct({
  p50_latency: Schema.Number,
  p50_throughput: Schema.Number,
})
export type CoreEndpointStats = Schema.Schema.Type<typeof CoreEndpointStats>

export const CoreFeatures = Schema.Struct({
  supports_implicit_caching: Schema.optional(Schema.Boolean),
  supports_native_web_search: Schema.optional(Schema.Boolean),
  supported_parameters: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
})
export type CoreFeatures = Schema.Schema.Type<typeof CoreFeatures>

export const CoreEndpoint = Schema.Struct({
  id: Schema.String,
  model_variant_slug: Schema.String,
  model_variant_permaslug: Schema.String,
  variant: Schema.String,
  provider_name: Schema.String,
  provider_display_name: Schema.String,
  provider_slug: Schema.String,
  provider_model_id: Schema.String,
  provider_region: Schema.NullOr(Schema.String),
  context_length: Schema.Number,
  max_prompt_tokens: Schema.NullOr(Schema.Number),
  max_completion_tokens: Schema.NullOr(Schema.Number),
  quantization: Schema.NullOr(Schema.String),
  supported_parameters: Schema.Array(Schema.String),
  pricing: CorePricing,
  data_policy: CoreDataPolicy,
  features: CoreFeatures,
  supports_reasoning: Schema.Boolean,
  supports_tool_parameters: Schema.Boolean,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  moderation_required: Schema.Boolean,
  is_free: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,
})
export type CoreEndpoint = Schema.Schema.Type<typeof CoreEndpoint>
