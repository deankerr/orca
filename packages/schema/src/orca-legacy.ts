// oxlint-disable sort-keys -- fields are grouped by what they are, not alphabetised

// * Transitional product schemas — a bridge between the legacy catalog and the new architecture.
// *
// * Starting point is the shapes the web app already uses (Convex catalog projections):
// * - packages/backend/convex/catalog/{models,endpoints,providers}/projection.ts
// * - packages/backend/convex/catalog/{models,endpoints,providers}/table.ts
// *
// * This is intentionally not a 1:1 copy. It keeps the familiar field names and nesting so
// * existing product surfaces can migrate with minimal churn, while folding in fixes and
// * cleanups the legacy path could not absorb cleanly (dropped storage-only keys, omitted
// * OpenRouter internals, deprecations, etc.). Treat divergences from the projection layer
// * as deliberate product decisions, not accidental drift.
// *
// * Convex system fields (`_id`, `_creationTime`) are omitted — storage plumbing, not product data.
// * Optional fields mirror Convex `v.optional` (key may be absent).
import * as Schema from 'effect/Schema'

// * ── model ─────────────────────────────────────────────────────────────────────────────────
// * `createModelProjection` drops `base_slug`, `icon_url`, `tokenizer`, and `instruct_type`.
// * `description` is only joined on `models.getBySlug`.
// * `unavailable_at` is storage-only — not part of the product model shape.

export const Model = Schema.Struct({
  slug: Schema.String,
  version_slug: Schema.String,
  variant: Schema.String,

  name: Schema.String,

  author_slug: Schema.String,
  author_name: Schema.String,

  or_added_at: Schema.Number,

  input_modalities: Schema.Array(Schema.String),
  output_modalities: Schema.Array(Schema.String),

  reasoning: Schema.Boolean,

  hugging_face_id: Schema.optional(Schema.String),
  promotion_message: Schema.optional(Schema.String),
  warning_message: Schema.optional(Schema.String),

  // * only present when the description table is joined (model detail page)
  description: Schema.optional(Schema.String),

  updated_at: Schema.Number,
})
export type Model = Schema.Schema.Type<typeof Model>

// * ── provider ──────────────────────────────────────────────────────────────────────────────
// * `createProviderProjection` drops `icon_url`.
// * `unavailable_at` is storage-only — not part of the product provider shape.

export const Provider = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,

  headquarters: Schema.optional(Schema.String),
  datacenters: Schema.optional(Schema.Array(Schema.String)),
  status_page_url: Schema.optional(Schema.String),
  terms_of_service_url: Schema.optional(Schema.String),
  privacy_policy_url: Schema.optional(Schema.String),

  updated_at: Schema.Number,
})
export type Provider = Schema.Schema.Type<typeof Provider>

// * ── endpoint (nested pieces) ──────────────────────────────────────────────────────────────

// * Embedded model on an endpoint — same fields as the model entity minus detail-only keys.
export const EndpointModel = Schema.Struct({
  slug: Schema.String,
  version_slug: Schema.String,
  variant: Schema.String,

  name: Schema.String,

  author_slug: Schema.String,
  author_name: Schema.String,

  or_added_at: Schema.Number,

  input_modalities: Schema.Array(Schema.String),
  output_modalities: Schema.Array(Schema.String),

  reasoning: Schema.Boolean,
})
export type EndpointModel = Schema.Schema.Type<typeof EndpointModel>

// * Embedded provider handle — endpoint-scoped (tag_slug / model_id / region), not the provider entity.
export const EndpointProvider = Schema.Struct({
  slug: Schema.String,
  // * full provider tag as upstream shipped it (may include a `/region` suffix that `slug` strips)
  tag_slug: Schema.String,

  name: Schema.String,

  model_id: Schema.String,
  region: Schema.optional(Schema.String),
})
export type EndpointProvider = Schema.Schema.Type<typeof EndpointProvider>

// * `createDataPolicyProjection` renames behavioural fields to product-facing names.
export const EndpointDataPolicy = Schema.Struct({
  may_train_on_data: Schema.optional(Schema.Boolean),
  may_publish_data: Schema.optional(Schema.Boolean),
  shares_user_id: Schema.optional(Schema.Boolean),
  may_retain_data: Schema.optional(Schema.Boolean),
  data_retention_days: Schema.optional(Schema.Number),
})
export type EndpointDataPolicy = Schema.Schema.Type<typeof EndpointDataPolicy>

// * `createPricingProjection` renames cache keys and drops `request`.
// *
// * OpenRouter internals (omitted): `internal_reasoning` / projected `reasoning_output` —
// * not product-facing pricing.
export const EndpointPricing = Schema.Struct({
  text_input: Schema.optional(Schema.Number),
  text_output: Schema.optional(Schema.Number),
  text_cache_read: Schema.optional(Schema.Number),
  text_cache_write: Schema.optional(Schema.Number),

  audio_input: Schema.optional(Schema.Number),
  audio_cache_write: Schema.optional(Schema.Number),

  image_input: Schema.optional(Schema.Number),
  image_output: Schema.optional(Schema.Number),

  web_search: Schema.optional(Schema.Number),
  discount: Schema.optional(Schema.Number),
})
export type EndpointPricing = Schema.Schema.Type<typeof EndpointPricing>

// * `createLimitsProjection` drops `text_output_tokens` (surfaced as top-level `max_output` instead).
export const EndpointLimits = Schema.Struct({
  text_input_tokens: Schema.optional(Schema.Number),
  image_input_tokens: Schema.optional(Schema.Number),
  images_per_input: Schema.optional(Schema.Number),
  requests_per_minute: Schema.optional(Schema.Number),
  requests_per_day: Schema.optional(Schema.Number),
})
export type EndpointLimits = Schema.Schema.Type<typeof EndpointLimits>

export const EndpointStats = Schema.Struct({
  p50_throughput: Schema.Number,
  p50_latency: Schema.Number,
})
export type EndpointStats = Schema.Schema.Type<typeof EndpointStats>

// * ── endpoint ──────────────────────────────────────────────────────────────────────────────
// * `createEndpointProjection` drops: stream_cancellation, file_urls, multipart, status,
// * mandatory_reasoning; renames nested pricing / data_policy; adds `max_output`.
// *
// * Deprecated (omitted): `variable_pricings` — no longer used upstream; not part of the product shape.

export const Endpoint = Schema.Struct({
  uuid: Schema.String,

  model: EndpointModel,
  provider: EndpointProvider,

  data_policy: EndpointDataPolicy,
  pricing: EndpointPricing,
  limits: EndpointLimits,

  // * text_output_tokens ?? context_length
  max_output: Schema.Number,

  context_length: Schema.Number,
  quantization: Schema.optional(Schema.String),
  supported_parameters: Schema.Array(Schema.String),

  completions: Schema.Boolean,
  chat_completions: Schema.Boolean,
  implicit_caching: Schema.Boolean,
  native_web_search: Schema.Boolean,

  moderated: Schema.Boolean,
  deranked: Schema.Boolean,
  disabled: Schema.Boolean,

  stats: Schema.optional(EndpointStats),

  unavailable_at: Schema.optional(Schema.Number),
  updated_at: Schema.Number,
})
export type Endpoint = Schema.Schema.Type<typeof Endpoint>
