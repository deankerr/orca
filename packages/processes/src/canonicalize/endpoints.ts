import * as R from 'remeda'
import { z } from 'zod'

// * see notes/data-architecture/provider-identity.md before touching any provider_* field:
// * they are ENDPOINT properties referring to a provider, not denormalized provider fields.
// * provider_name is the only reliable join to the providers entity.

// * endpoint feature flags; key presence varies wildly per endpoint (only supports_tool_choice
// * is universal). Kept verbatim in the canonical shape as capability signal.
const Features = z.strictObject({
  disable_free_endpoint_limits: z.boolean().optional(),
  is_mandatory_reasoning: z.boolean().optional(),
  reasoning_return_mechanism: z.string().optional(),
  should_send_reasoning_text_in_text_content: z.boolean().optional(),
  supported_parameters: z.record(z.string(), z.boolean()).optional(),
  supports_base64_file_input: z.boolean().optional(),
  supports_base64_video_input: z.boolean().optional(),
  supports_file_urls: z.boolean().optional(),
  supports_implicit_caching: z.boolean().optional(),
  supports_input_audio: z.boolean().optional(),
  supports_multipart: z.boolean().optional(),
  supports_native_apply_patch: z.boolean().optional(),
  supports_native_web_fetch: z.boolean().optional(),
  supports_native_web_search: z.boolean().optional(),
  supports_tool_choice: z.strictObject({
    literal_auto: z.boolean().optional(),
    literal_none: z.boolean().optional(),
    literal_required: z.boolean().optional(),
    type_function: z.boolean().optional(),
  }),
  supports_video_urls: z.boolean().optional(),
})

const DataPolicy = z.strictObject({
  canPublish: z.boolean(),
  privacyPolicyURL: z.string().optional(),
  requiresUserIDs: z.boolean().optional(),
  retainsPrompts: z.boolean(),
  retentionDays: z.number().optional(),
  termsOfServiceURL: z.string().optional(),
  training: z.boolean(),
  trainingOpenRouter: z.boolean(),
})

// * raw endpoint exactly as the deduped pass view ships it (embedded model/provider_info
// * already stripped by the worker) — strict, so any schema drift in a new pass fails loudly
const RawEndpoint = z.strictObject({
  // * OR-internal wiring (which adapter class serves this endpoint) — not an endpoint fact
  adapter_name: z.string(),
  allowed_passthrough_parameters: z.array(z.string()),
  can_abort: z.boolean(),
  capacity_tpm: z.number().nullable(),
  context_length: z.number(),
  created_at: z.string(),
  data_policy: DataPolicy,
  deprecation_date: z.string().nullable(),
  // * pricing is carried loosely, not modelled: providers charge for whatever they want,
  // * OR models it as best they can, and so do we (capture first, ask questions later).
  // * All three views are kept — pricing_json is the source of truth (adapter SKU keys),
  // * pricing is the normalized token view for text models, display_pricing carries the
  // * semantics behind exotic price categories (see notes/data-architecture/modality-split.md).
  display_pricing: z.array(z.unknown()),
  excluded_parameters: z.array(z.string()),
  features: Features,
  has_chat_completions: z.boolean(),
  has_completions: z.boolean(),
  id: z.string(),
  is_byok: z.boolean(),
  is_byok_only: z.boolean(),
  is_deranked: z.boolean(),
  is_disabled: z.boolean(),
  is_free: z.boolean(),
  // * always false in a public capture; hidden/private endpoints never reach this API
  is_hidden: z.boolean(),
  is_private: z.boolean(),
  limit_rpd: z.number().nullable(),
  limit_rpm: z.number().nullable(),
  // * null on every endpoint observed so far — nothing to model yet
  limit_rpm_cf: z.null(),
  max_completion_tokens: z.number().nullable(),
  max_prompt_tokens: z.number().nullable(),
  max_tokens_per_image: z.number().nullable(),
  model_variant_permaslug: z.string(),
  model_variant_slug: z.string(),
  moderation_required: z.boolean(),
  // * fully derivable: `${provider_name} | ${model_variant_permaslug}` (verified 1052/1052)
  name: z.string(),
  // * pricing.display_pricing is a byte-identical duplicate of the top-level field
  // * (verified 1052/1052) — dropped in the canonical shape
  pricing: z.record(z.string(), z.unknown()),
  pricing_json: z.record(z.string(), z.union([z.string(), z.number()])),
  pricing_version_id: z.string(),
  provider_display_name: z.string(),
  provider_model_id: z.string(),
  provider_name: z.string(),
  provider_region: z.string().nullable(),
  provider_slug: z.string(),
  quantization: z.string(),
  // * volatile telemetry — a separate analytics concern, never part of the canonical entity
  routing_heuristics_by_tier: z.unknown().optional(),
  stats: z.unknown().optional(),
  statsByTier: z.unknown().optional(),
  status: z.number(),
  status_heuristics: z.unknown().optional(),
  status_heuristics_1d: z.unknown().optional(),
  status_heuristics_5m: z.unknown().optional(),
  supported_image_parameters: z.record(z.string(), z.unknown()).nullable(),
  supported_parameters: z.array(z.string()),
  supported_video_parameters: z.record(z.string(), z.unknown()).nullable(),
  supports_multipart: z.boolean(),
  supports_reasoning: z.boolean(),
  supports_tool_parameters: z.boolean(),
  // * per-tier pricing variants (flex/priority), present on ~53 endpoints
  tiers: z.unknown().optional(),
  variant: z.string(),
})

// * canonical endpoint: flat and snake_cased for SQL storage, one row per endpoint id.
// * Statistics are excluded (volatile telemetry — a separate analytics product). All three
// * upstream pricing views are carried loosely; diff noise between them is muted at the
// * diff point, not filtered out here.
export const Endpoint = z.strictObject({
  allowed_passthrough_parameters: z.array(z.string()),
  can_abort: z.boolean(),
  capacity_tpm: z.number().nullable(),
  context_length: z.number(),
  created_at: z.string(),
  // * endpoint-level policy is authoritative for the behavioural fields; the policy document
  // * URLs live on the provider (identical across every endpoint of a provider — verified)
  data_policy: z.strictObject({
    can_publish: z.boolean(),
    requires_user_ids: z.boolean().nullable(),
    retains_prompts: z.boolean(),
    retention_days: z.number().nullable(),
    training: z.boolean(),
    training_openrouter: z.boolean(),
  }),
  deprecation_date: z.string().nullable(),
  display_pricing: z.array(z.unknown()),
  excluded_parameters: z.array(z.string()),
  features: Features,
  has_chat_completions: z.boolean(),
  has_completions: z.boolean(),
  id: z.string(),
  is_byok: z.boolean(),
  is_byok_only: z.boolean(),
  is_deranked: z.boolean(),
  is_disabled: z.boolean(),
  is_free: z.boolean(),
  limit_rpd: z.number().nullable(),
  limit_rpm: z.number().nullable(),
  max_completion_tokens: z.number().nullable(),
  max_prompt_tokens: z.number().nullable(),
  max_tokens_per_image: z.number().nullable(),
  model_variant_permaslug: z.string(),
  model_variant_slug: z.string(),
  moderation_required: z.boolean(),
  // * upstream's normalized token view, minus its embedded display_pricing duplicate
  pricing: z.record(z.string(), z.unknown()),
  // * source of truth: adapter-namespaced SKU keys ("openai_responses:prompt_tokens");
  // * values are decimal strings except a few adapters (krea) that ship raw numbers
  pricing_json: z.record(z.string(), z.union([z.string(), z.number()])),
  // * opaque upstream id; kept permissively with the rest of pricing — refine after we've
  // * analysed diff output across passes
  pricing_version_id: z.string(),
  provider_display_name: z.string(),
  provider_model_id: z.string(),
  provider_name: z.string(),
  provider_region: z.string().nullable(),
  provider_slug: z.string(),
  quantization: z.string(),
  status: z.number(),
  supported_image_parameters: z.record(z.string(), z.unknown()).nullable(),
  supported_parameters: z.array(z.string()),
  supported_video_parameters: z.record(z.string(), z.unknown()).nullable(),
  supports_multipart: z.boolean(),
  supports_reasoning: z.boolean(),
  supports_tool_parameters: z.boolean(),
  // * per-tier pricing variants (flex/priority) — null when the endpoint has none
  tiers: z.unknown(),
  variant: z.string(),
})
export type Endpoint = z.infer<typeof Endpoint>

export function canonicalizeEndpoints(raws: unknown[]): Endpoint[] {
  const endpoints = new Map<string, Endpoint>()
  for (const raw of raws) {
    const e = RawEndpoint.parse(raw)
    const endpoint = Endpoint.parse({
      allowed_passthrough_parameters: e.allowed_passthrough_parameters,
      can_abort: e.can_abort,
      capacity_tpm: e.capacity_tpm,
      context_length: e.context_length,
      created_at: e.created_at,
      data_policy: {
        can_publish: e.data_policy.canPublish,
        requires_user_ids: e.data_policy.requiresUserIDs ?? null,
        retains_prompts: e.data_policy.retainsPrompts,
        retention_days: e.data_policy.retentionDays ?? null,
        training: e.data_policy.training,
        training_openrouter: e.data_policy.trainingOpenRouter,
      },
      deprecation_date: e.deprecation_date,
      display_pricing: e.display_pricing,
      excluded_parameters: e.excluded_parameters,
      features: e.features,
      has_chat_completions: e.has_chat_completions,
      has_completions: e.has_completions,
      id: e.id,
      is_byok: e.is_byok,
      is_byok_only: e.is_byok_only,
      is_deranked: e.is_deranked,
      is_disabled: e.is_disabled,
      is_free: e.is_free,
      limit_rpd: e.limit_rpd,
      limit_rpm: e.limit_rpm,
      max_completion_tokens: e.max_completion_tokens,
      max_prompt_tokens: e.max_prompt_tokens,
      max_tokens_per_image: e.max_tokens_per_image,
      model_variant_permaslug: e.model_variant_permaslug,
      model_variant_slug: e.model_variant_slug,
      moderation_required: e.moderation_required,
      pricing: R.omit(e.pricing, ['display_pricing']),
      pricing_json: e.pricing_json,
      pricing_version_id: e.pricing_version_id,
      provider_display_name: e.provider_display_name,
      provider_model_id: e.provider_model_id,
      provider_name: e.provider_name,
      provider_region: e.provider_region,
      provider_slug: e.provider_slug,
      quantization: e.quantization,
      status: e.status,
      supported_image_parameters: e.supported_image_parameters,
      supported_parameters: e.supported_parameters,
      supported_video_parameters: e.supported_video_parameters,
      supports_multipart: e.supports_multipart,
      supports_reasoning: e.supports_reasoning,
      supports_tool_parameters: e.supports_tool_parameters,
      tiers: e.tiers ?? null,
      variant: e.variant,
    })

    // * ids must be globally unique across the pass — a collision means an endpoint appeared
    // * in two scopes and our "one row per id" premise broke
    if (endpoints.has(endpoint.id)) {
      throw new Error(`duplicate endpoint id ${endpoint.id}`)
    }
    endpoints.set(endpoint.id, endpoint)
  }
  return [...endpoints.values()].toSorted(
    (a, b) =>
      a.model_variant_slug.localeCompare(b.model_variant_slug) ||
      a.provider_slug.localeCompare(b.provider_slug),
  )
}
