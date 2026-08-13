// * Public API V2 schemas: post-prep observation revalidation + response contract.
// * Response field order is alphabetical so encode/decode wire matches Convex key order.

import * as Schema from 'effect/Schema'

// * ── observation revalidation (post-prep) ───────────────────────────────────
// * Hoisted model + stripped endpoints from `toModelEndpoints`.
// * `variable_pricings` abandoned upstream; V2 `pricing.tiers` is always null
// * until we model the newer per-provider tier system.

/** OR prices arrive as string or number; zero means “not set” for V2. */
const ObservationPrice = Schema.optional(Schema.Union([Schema.Finite, Schema.FiniteFromString]))

/**
 * Hoisted model from `toModelEndpoints`: variant already healed into
 * slug / permaslug / short_name; `variant` set on the model itself.
 */
export const ModelObservation = Schema.Struct({
  author: Schema.String,
  created_at: Schema.String,
  input_modalities: Schema.Array(Schema.String),
  name: Schema.String,
  output_modalities: Schema.Array(Schema.String),
  permaslug: Schema.String,
  short_name: Schema.String,
  slug: Schema.String,
  supports_reasoning: Schema.Boolean,
  variant: Schema.String,
})

export type ModelObservation = typeof ModelObservation.Type

/** Endpoint row after prep — no nested `model`. */
export const EndpointObservation = Schema.Struct({
  context_length: Schema.Finite,
  data_policy: Schema.Struct({
    canPublish: Schema.optional(Schema.Boolean),
    requiresUserIDs: Schema.optional(Schema.Boolean),
    retainsPrompts: Schema.optional(Schema.Boolean),
    retentionDays: Schema.optional(Schema.Finite),
    training: Schema.optional(Schema.Boolean),
  }),
  features: Schema.Struct({
    supports_implicit_caching: Schema.optional(Schema.NullOr(Schema.Boolean)),
    supports_native_web_search: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,
  limit_rpd: Schema.NullOr(Schema.Finite),
  limit_rpm: Schema.NullOr(Schema.Finite),
  max_completion_tokens: Schema.NullOr(Schema.Finite),
  max_prompt_images: Schema.optional(Schema.NullOr(Schema.Finite)),
  max_prompt_tokens: Schema.NullOr(Schema.Finite),
  max_tokens_per_image: Schema.NullOr(Schema.Finite),
  moderation_required: Schema.Boolean,
  pricing: Schema.Struct({
    audio: ObservationPrice,
    completion: ObservationPrice,
    image: ObservationPrice,
    image_output: ObservationPrice,
    input_audio_cache: ObservationPrice,
    input_cache_read: ObservationPrice,
    input_cache_write: ObservationPrice,
    internal_reasoning: ObservationPrice,
    prompt: ObservationPrice,
    request: ObservationPrice,
  }),
  provider_display_name: Schema.String,
  provider_region: Schema.NullOr(Schema.String),
  provider_slug: Schema.String,
  quantization: Schema.NullOr(Schema.String),
  stats: Schema.optionalKey(
    Schema.Struct({
      p50_latency: Schema.Finite,
      p50_throughput: Schema.Finite,
    }),
  ),
  supported_parameters: Schema.Array(Schema.String),
})

export type EndpointObservation = typeof EndpointObservation.Type

export const decodeModelOption = Schema.decodeUnknownOption(ModelObservation)
export const decodeEndpointOption = Schema.decodeUnknownOption(EndpointObservation)

// * ── response nested ────────────────────────────────────────────────────────

const DataPolicy = Schema.Struct({
  data_retention_days: Schema.NullOr(Schema.Finite),
  may_publish_data: Schema.Boolean,
  may_retain_data: Schema.Boolean,
  may_train_on_data: Schema.Boolean,
  shares_user_id: Schema.Boolean,
})

const Pricing = Schema.Struct({
  audio_cache_write: Schema.NullOr(Schema.String),
  audio_input: Schema.NullOr(Schema.String),
  image_input: Schema.NullOr(Schema.String),
  image_output: Schema.NullOr(Schema.String),
  per_request: Schema.NullOr(Schema.String),
  reasoning_output: Schema.NullOr(Schema.String),
  text_cache_read: Schema.NullOr(Schema.String),
  text_cache_write: Schema.NullOr(Schema.String),
  text_input: Schema.NullOr(Schema.String),
  text_output: Schema.NullOr(Schema.String),
  // * Always null for now: upstream `variable_pricings` abandoned; new tier model not handled.
  tiers: Schema.Null,
})

const Limits = Schema.Struct({
  image_input_tokens: Schema.NullOr(Schema.Finite),
  images_per_input: Schema.NullOr(Schema.Finite),
  requests_per_day: Schema.NullOr(Schema.Finite),
  requests_per_minute: Schema.NullOr(Schema.Finite),
  text_input_tokens: Schema.NullOr(Schema.Finite),
  text_output_tokens: Schema.NullOr(Schema.Finite),
})

const StatsLast30m = Schema.Struct({
  latency_ms_p50: Schema.Finite,
  tokens_per_sec_p50: Schema.Finite,
})

// * ── provider (endpoint in API terms) ───────────────────────────────────────

/** One provider row in `models[].providers[]`. */
export const Provider = Schema.Struct({
  chat_completions: Schema.Boolean,
  completions: Schema.Boolean,
  context_length: Schema.Finite,
  data_policy: DataPolicy,
  deranked: Schema.Boolean,
  implicit_caching: Schema.Boolean,
  limits: Limits,
  moderated: Schema.Boolean,
  native_web_search: Schema.Boolean,
  pricing: Pricing,
  provider_id: Schema.String,
  provider_name: Schema.String,
  provider_region: Schema.NullOr(Schema.String),
  quantization: Schema.String,
  stats_last_30m: Schema.NullOr(StatsLast30m),
  supported_parameters: Schema.Array(Schema.String),
})

export type Provider = typeof Provider.Type

// * ── model ──────────────────────────────────────────────────────────────────

/** One model in the V2 `models[]` array. */
export const Model = Schema.Struct({
  author_name: Schema.String,
  created_at: Schema.String,
  id: Schema.String,
  input_modalities: Schema.Array(Schema.String),
  name: Schema.String,
  output_modalities: Schema.Array(Schema.String),
  providers: Schema.Array(Provider),
  reasoning: Schema.Boolean,
  variant: Schema.String,
  version_id: Schema.String,
})

export type Model = typeof Model.Type

// * ── response ───────────────────────────────────────────────────────────────

/** Full GET payload: watermark + models. */
export const ModelsResponse = Schema.Struct({
  models: Schema.Array(Model),
  updated_at: Schema.String,
})

export type ModelsResponse = typeof ModelsResponse.Type
