// * Public API V2 response contract.
// * Response field order is alphabetical so encode/decode wire matches Convex key order.

import * as Schema from 'effect/Schema'

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

/** Full GET payload: watermark + models. Empty is not a valid projection. */
export const ModelsResponse = Schema.Struct({
  models: Schema.NonEmptyArray(Model),
  updated_at: Schema.String,
})

export type ModelsResponse = typeof ModelsResponse.Type
