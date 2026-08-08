// oxlint-disable sort-keys -- fields are grouped by what they are, not alphabetised

// * Official product field selection — the facts ORCA is prepared to ship.
// *
// * Field names stay close to the OpenRouter / capture source representation (the same family
// * as `area-2-core.ts`). Nested product renames and web-app transitional shapes live in
// * `orca-legacy.ts`; this file is the selected source card those shapes project from.
// *
// * Relative to `area-2-core.ts`, extras that are not product-facing are omitted:
// * model `context_length` / `group` / `instruct_type` / full `reasoning_config`,
// * pricing `internal_reasoning` / `request` / `input_cache_write_1h`,
// * endpoint `is_free` / `supports_tool_parameters` / features parameter maps.
import * as Schema from 'effect/Schema'

// * ── model ─────────────────────────────────────────────────────────────────────────────────

export const Model = Schema.Struct({
  slug: Schema.String,
  permaslug: Schema.String,
  // * product models are per-variant (`standard`, `free`, …); `slug` already encodes non-standard
  variant: Schema.String,

  name: Schema.String,
  short_name: Schema.String,
  description: Schema.String,
  author: Schema.String,

  created_at: Schema.String,

  input_modalities: Schema.Array(Schema.String),
  output_modalities: Schema.Array(Schema.String),

  supports_reasoning: Schema.Boolean,

  hf_slug: Schema.NullOr(Schema.String),
  promotion_message: Schema.optional(Schema.NullOr(Schema.String)),
  warning_message: Schema.NullOr(Schema.String),
})
export type Model = Schema.Schema.Type<typeof Model>

// * ── provider ──────────────────────────────────────────────────────────────────────────────

export const Provider = Schema.Struct({
  slug: Schema.String,
  // * upstream `displayName` — the human label; `name` is the join key on endpoints
  name: Schema.String,

  headquarters: Schema.optional(Schema.NullOr(Schema.String)),
  datacenters: Schema.optional(Schema.Array(Schema.String)),
  status_page_url: Schema.optional(Schema.NullOr(Schema.String)),
  terms_of_service_url: Schema.optional(Schema.String),
  privacy_policy_url: Schema.optional(Schema.String),
})
export type Provider = Schema.Schema.Type<typeof Provider>

// * ── pricing / policy ──────────────────────────────────────────────────────────────────────
// * Token prices remain decimal strings (source representation). Absent ≠ zero.
// *
// * OpenRouter internals (omitted): `internal_reasoning`.
// * Not product-facing (omitted): `request`, `input_cache_write_1h`.

const Price = Schema.optional(Schema.String)

export const Pricing = Schema.Struct({
  prompt: Price,
  completion: Price,

  input_cache_read: Price,
  input_cache_write: Price,

  audio: Price,
  input_audio_cache: Price,

  image: Price,
  image_output: Price,

  web_search: Price,
  discount: Schema.optional(Schema.Number),
})
export type Pricing = Schema.Schema.Type<typeof Pricing>

// * Behavioural data-policy flags as upstream names them (camelCase).
export const DataPolicy = Schema.Struct({
  training: Schema.optional(Schema.Boolean),
  retainsPrompts: Schema.optional(Schema.Boolean),
  canPublish: Schema.optional(Schema.Boolean),
  retentionDays: Schema.optional(Schema.Number),
  requiresUserIDs: Schema.optional(Schema.Boolean),
})
export type DataPolicy = Schema.Schema.Type<typeof DataPolicy>

export const EndpointStats = Schema.Struct({
  p50_latency: Schema.Number,
  p50_throughput: Schema.Number,
})
export type EndpointStats = Schema.Schema.Type<typeof EndpointStats>

// * ── endpoint ──────────────────────────────────────────────────────────────────────────────
// * Flat source card: model-variant + provider handles are columns, not nested entities.
// * Capability flags that are only a re-statement of `supported_parameters` are omitted.

export const Endpoint = Schema.Struct({
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
  max_prompt_images: Schema.optional(Schema.NullOr(Schema.Number)),
  max_tokens_per_image: Schema.optional(Schema.NullOr(Schema.Number)),
  limit_rpm: Schema.optional(Schema.NullOr(Schema.Number)),
  limit_rpd: Schema.optional(Schema.NullOr(Schema.Number)),

  quantization: Schema.NullOr(Schema.String),
  supported_parameters: Schema.Array(Schema.String),

  pricing: Pricing,
  data_policy: DataPolicy,

  supports_reasoning: Schema.Boolean,
  supports_implicit_caching: Schema.Boolean,
  supports_native_web_search: Schema.Boolean,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,

  moderation_required: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,

  stats: Schema.optional(EndpointStats),
})
export type Endpoint = Schema.Schema.Type<typeof Endpoint>
