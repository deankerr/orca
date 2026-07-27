// The raw shape mirrors the upstream payload; the canonical shape is grouped by what a field is
// (identity, provider handle, serving shape, capability, commercial, policy, pricing).

// * Layer 1 for the endpoint entity: parse one raw upstream endpoint, emit the canonical row.
// * ⚠️ `RawEndpoint` is STRICT — decoded with `onExcessProperty: 'error'` — so any upstream drift
// * fails here instead of passing through unseen. That includes `features`, declared as the exact
// * set of flags observed: a new flag is a signal, and this is the only place it is visible.
// *
// * ⚠️ See notes/data-architecture/provider-identity.md before touching any `provider_*` field:
// * they are ENDPOINT properties referring to a provider, not denormalized provider fields.
// * `provider_name` is the only reliable join to the providers entity.
import * as Schema from 'effect/Schema'

// * endpoint feature flags; key presence varies wildly per endpoint (only supports_tool_choice is
// * universal). Carried verbatim into the canonical shape as capability signal.
const Features = Schema.Struct({
  disable_free_endpoint_limits: Schema.optional(Schema.Boolean),
  is_mandatory_reasoning: Schema.optional(Schema.Boolean),
  reasoning_return_mechanism: Schema.optional(Schema.String),
  should_send_reasoning_text_in_text_content: Schema.optional(Schema.Boolean),
  supported_parameters: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  supports_base64_file_input: Schema.optional(Schema.Boolean),
  supports_base64_video_input: Schema.optional(Schema.Boolean),
  supports_file_urls: Schema.optional(Schema.Boolean),
  supports_implicit_caching: Schema.optional(Schema.Boolean),
  supports_input_audio: Schema.optional(Schema.Boolean),
  supports_multipart: Schema.optional(Schema.Boolean),
  supports_native_apply_patch: Schema.optional(Schema.Boolean),
  supports_native_web_fetch: Schema.optional(Schema.Boolean),
  supports_native_web_search: Schema.optional(Schema.Boolean),
  supports_tool_choice: Schema.Struct({
    literal_auto: Schema.optional(Schema.Boolean),
    literal_none: Schema.optional(Schema.Boolean),
    literal_required: Schema.optional(Schema.Boolean),
    type_function: Schema.optional(Schema.Boolean),
  }),
  supports_video_urls: Schema.optional(Schema.Boolean),
})

const RawDataPolicy = Schema.Struct({
  canPublish: Schema.Boolean,
  privacyPolicyURL: Schema.optional(Schema.String),
  requiresUserIDs: Schema.optional(Schema.Boolean),
  retainsPrompts: Schema.Boolean,
  retentionDays: Schema.optional(Schema.Number),
  termsOfServiceURL: Schema.optional(Schema.String),
  training: Schema.Boolean,
  trainingOpenRouter: Schema.Boolean,
})

// * ── raw ───────────────────────────────────────────────────────────────────────────────────
// * exactly as the deduped pass view ships it (embedded model / provider_info already stripped
// * by the capture worker)
const RawEndpoint = Schema.Struct({
  // * OR-internal wiring (which adapter class serves this endpoint) — not an endpoint fact
  adapter_name: Schema.String,
  allowed_passthrough_parameters: Schema.Array(Schema.String),
  can_abort: Schema.Boolean,
  capacity_tpm: Schema.NullOr(Schema.Number),
  context_length: Schema.Number,
  created_at: Schema.String,
  data_policy: RawDataPolicy,
  deprecation_date: Schema.NullOr(Schema.String),
  // * pricing is carried loosely, not modelled: providers charge for whatever they want, OR models
  // * it as best they can, and so do we (capture first, ask questions later). All three views are
  // * kept — pricing_json is the source of truth (adapter SKU keys), pricing is the normalized
  // * per-unit view, display_pricing carries the semantics behind exotic price categories
  // * (see notes/data-architecture/modality-split.md).
  display_pricing: Schema.Array(Schema.Unknown),
  excluded_parameters: Schema.Array(Schema.String),
  features: Features,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  id: Schema.String,
  is_byok: Schema.Boolean,
  is_byok_only: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,
  is_free: Schema.Boolean,
  // * always false in a public capture; hidden/private endpoints never reach this API
  is_hidden: Schema.Boolean,
  is_private: Schema.Boolean,
  limit_rpd: Schema.NullOr(Schema.Number),
  limit_rpm: Schema.NullOr(Schema.Number),
  // * null on every endpoint observed so far — nothing to model yet
  limit_rpm_cf: Schema.Null,
  max_completion_tokens: Schema.NullOr(Schema.Number),
  max_prompt_tokens: Schema.NullOr(Schema.Number),
  max_tokens_per_image: Schema.NullOr(Schema.Number),
  model_variant_permaslug: Schema.String,
  model_variant_slug: Schema.String,
  moderation_required: Schema.Boolean,
  // * fully derivable: `${provider_name} | ${model_variant_permaslug}` (verified 1052/1052)
  name: Schema.String,
  // * pricing.display_pricing is a byte-identical duplicate of the top-level field
  // * (verified 1052/1052) — dropped in the canonical shape
  pricing: Schema.Record(Schema.String, Schema.Unknown),
  pricing_json: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
  pricing_version_id: Schema.String,
  provider_display_name: Schema.String,
  provider_model_id: Schema.String,
  provider_name: Schema.String,
  provider_region: Schema.NullOr(Schema.String),
  provider_slug: Schema.String,
  quantization: Schema.String,
  // * volatile telemetry — a separate analytics concern, never part of the canonical entity
  routing_heuristics_by_tier: Schema.optional(Schema.Unknown),
  stats: Schema.optional(Schema.Unknown),
  statsByTier: Schema.optional(Schema.Unknown),
  status: Schema.Number,
  status_heuristics: Schema.optional(Schema.Unknown),
  status_heuristics_1d: Schema.optional(Schema.Unknown),
  status_heuristics_5m: Schema.optional(Schema.Unknown),
  supported_image_parameters: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  supported_parameters: Schema.Array(Schema.String),
  supported_video_parameters: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  supports_multipart: Schema.Boolean,
  supports_reasoning: Schema.Boolean,
  supports_tool_parameters: Schema.Boolean,
  // * per-tier pricing variants (flex/priority), present on ~53 endpoints
  tiers: Schema.optional(Schema.Unknown),
  variant: Schema.String,
})

// * ── canonical ─────────────────────────────────────────────────────────────────────────────
// * One (model variant × provider config) offering — the atom of pricing and capability, keyed by
// * a stable upstream UUID. Statistics are excluded (volatile telemetry, a separate analytics
// * concern). All three upstream pricing views are carried loosely; diff noise between them is
// * muted at the diff point, not filtered out here.
export const Endpoint = Schema.Struct({
  id: Schema.String,
  model_variant_slug: Schema.String,
  model_variant_permaslug: Schema.String,
  variant: Schema.String,

  provider_slug: Schema.String,
  provider_name: Schema.String,
  provider_display_name: Schema.String,
  provider_model_id: Schema.String,
  provider_region: Schema.NullOr(Schema.String),

  quantization: Schema.String,
  context_length: Schema.Number,
  max_prompt_tokens: Schema.NullOr(Schema.Number),
  max_completion_tokens: Schema.NullOr(Schema.Number),
  max_tokens_per_image: Schema.NullOr(Schema.Number),

  supports_reasoning: Schema.Boolean,
  supports_multipart: Schema.Boolean,
  supports_tool_parameters: Schema.Boolean,
  can_abort: Schema.Boolean,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  moderation_required: Schema.Boolean,
  supported_parameters: Schema.Array(Schema.String),
  excluded_parameters: Schema.Array(Schema.String),
  allowed_passthrough_parameters: Schema.Array(Schema.String),
  // * ⚠️ modality-specific, and non-null on text endpoints with a *different* meaning — only
  // * interpretable within a modality group. See notes/data-architecture/modality-split.md
  supported_image_parameters: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  supported_video_parameters: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  features: Features,

  is_free: Schema.Boolean,
  is_byok: Schema.Boolean,
  is_byok_only: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,
  capacity_tpm: Schema.NullOr(Schema.Number),
  deprecation_date: Schema.NullOr(Schema.String),
  limit_rpm: Schema.NullOr(Schema.Number),
  limit_rpd: Schema.NullOr(Schema.Number),

  // * endpoint-level policy is authoritative for the behavioural fields; the policy document URLs
  // * live on the provider (identical across every endpoint of a provider — verified)
  data_policy: Schema.Struct({
    can_publish: Schema.Boolean,
    requires_user_ids: Schema.NullOr(Schema.Boolean),
    retains_prompts: Schema.Boolean,
    retention_days: Schema.NullOr(Schema.Number),
    training: Schema.Boolean,
    training_openrouter: Schema.Boolean,
  }),

  // * source of truth: adapter-namespaced SKU keys ("openai_responses:prompt_tokens"); values are
  // * decimal strings except a few adapters (krea) that ship raw numbers
  pricing_json: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
  // * upstream's normalized per-unit view, minus its embedded display_pricing duplicate
  pricing: Schema.Record(Schema.String, Schema.Unknown),
  // * the presentation view — the only place exotic SKU semantics are *labelled*
  display_pricing: Schema.Array(Schema.Unknown),
  // * per-tier pricing variants (flex/priority) — null when the endpoint has none
  tiers: Schema.Unknown,

  created_at: Schema.String,
})
export type Endpoint = Schema.Schema.Type<typeof Endpoint>

const decodeRawEndpoint = Schema.decodeUnknownSync(RawEndpoint, { onExcessProperty: 'error' })

// * One raw endpoint in, one canonical endpoint out. ⚠️ `id` is globally unique across a pass, but
// * asserting that — and ordering the results — is the caller's job, not this function's.
export function canonicalizeEndpoint(raw: unknown): Endpoint {
  const e = decodeRawEndpoint(raw)

  return {
    id: e.id,
    model_variant_slug: e.model_variant_slug,
    model_variant_permaslug: e.model_variant_permaslug,
    variant: e.variant,

    provider_slug: e.provider_slug,
    provider_name: e.provider_name,
    provider_display_name: e.provider_display_name,
    provider_model_id: e.provider_model_id,
    provider_region: e.provider_region,

    quantization: e.quantization,
    context_length: e.context_length,
    max_prompt_tokens: e.max_prompt_tokens,
    max_completion_tokens: e.max_completion_tokens,
    max_tokens_per_image: e.max_tokens_per_image,

    supports_reasoning: e.supports_reasoning,
    supports_multipart: e.supports_multipart,
    supports_tool_parameters: e.supports_tool_parameters,
    can_abort: e.can_abort,
    has_chat_completions: e.has_chat_completions,
    has_completions: e.has_completions,
    moderation_required: e.moderation_required,
    supported_parameters: e.supported_parameters,
    excluded_parameters: e.excluded_parameters,
    allowed_passthrough_parameters: e.allowed_passthrough_parameters,
    supported_image_parameters: e.supported_image_parameters,
    supported_video_parameters: e.supported_video_parameters,
    features: e.features,

    is_free: e.is_free,
    is_byok: e.is_byok,
    is_byok_only: e.is_byok_only,
    is_deranked: e.is_deranked,
    is_disabled: e.is_disabled,
    capacity_tpm: e.capacity_tpm,
    deprecation_date: e.deprecation_date,
    limit_rpm: e.limit_rpm,
    limit_rpd: e.limit_rpd,

    data_policy: {
      can_publish: e.data_policy.canPublish,
      requires_user_ids: e.data_policy.requiresUserIDs ?? null,
      retains_prompts: e.data_policy.retainsPrompts,
      retention_days: e.data_policy.retentionDays ?? null,
      training: e.data_policy.training,
      training_openrouter: e.data_policy.trainingOpenRouter,
    },

    pricing_json: e.pricing_json,
    // * drop the duplicate of the top-level display_pricing carried inside `pricing`
    pricing: Object.fromEntries(
      Object.entries(e.pricing).filter(([key]) => key !== 'display_pricing'),
    ),
    display_pricing: e.display_pricing,
    tiers: e.tiers ?? null,

    created_at: e.created_at,
  }
}
