import { z } from 'zod'

import { SupportedImageParametersSchema, SupportedVideoParametersSchema } from './media.ts'
import { EndpointPricingSourceSchema, TiersSchema } from './pricing.ts'
import { ProviderInfoSchema } from './provider.ts'

const StatsSchema = z.looseObject({
  endpoint_id: z.uuid(),
  p50_latency: z.number(),
  p50_throughput: z.number(),
  p75_latency: z.number(),
  p75_throughput: z.number(),
  p90_latency: z.number(),
  p90_throughput: z.number(),
  p95_latency: z.number(),
  p95_throughput: z.number(),
  p99_latency: z.number(),
  p99_throughput: z.number(),
  request_count: z.number().int().nonnegative(),
  window_minutes: z.number().int().positive(),
})

const EndpointDataPolicySchema = z.looseObject({
  canPublish: z.boolean(),
  privacyPolicyURL: z.url().optional(),
  requiresUserIDs: z.boolean().optional(),
  retainsPrompts: z.boolean(),
  retentionDays: z.number().int().nonnegative().optional(),
  termsOfServiceURL: z.url().optional(),
  training: z.boolean(),
  trainingOpenRouter: z.boolean(),
})

const EndpointFeaturesSchema = z.looseObject({
  disable_free_endpoint_limits: z.boolean().optional(),
  is_mandatory_reasoning: z.boolean().optional(),
  reasoning_return_mechanism: z.string().optional(),
  should_send_reasoning_text_in_text_content: z.boolean().optional(),
  supported_parameters: z
    .looseObject({
      response_format: z.boolean().optional(),
      structured_outputs: z.boolean().optional(),
    })
    .optional(),
  supports_base64_file_input: z.boolean().optional(),
  supports_base64_video_input: z.boolean().optional(),
  supports_file_urls: z.boolean().optional(),
  supports_implicit_caching: z.boolean().optional(),
  supports_input_audio: z.boolean().optional(),
  supports_multipart: z.boolean().optional(),
  supports_native_apply_patch: z.boolean().optional(),
  supports_native_web_fetch: z.boolean().optional(),
  supports_native_web_search: z.boolean().optional(),
  supports_tool_choice: z.looseObject({
    literal_auto: z.boolean(),
    literal_none: z.boolean(),
    literal_required: z.boolean(),
    type_function: z.boolean(),
  }),
  supports_video_urls: z.boolean().optional(),
  supports_voice_cloning: z.boolean().optional(),
})

const StatsByTierSchema = z.looseObject({
  default: StatsSchema.optional(),
  flex: StatsSchema.optional(),
  priority: StatsSchema.optional(),
})

export const EndpointSchema = EndpointPricingSourceSchema.extend({
  adapter_name: z.string(),
  allowed_passthrough_parameters: z.array(z.string()),
  can_abort: z.boolean(),
  capacity_tpm: z.number().nonnegative().nullable().optional(),
  context_length: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }).optional(),
  data_policy: EndpointDataPolicySchema,
  deprecation_date: z.union([z.iso.date(), z.iso.datetime()]).nullable(),
  excluded_parameters: z.array(z.string()).optional(),
  features: EndpointFeaturesSchema,
  has_chat_completions: z.boolean(),
  has_completions: z.boolean(),
  is_byok: z.boolean(),
  is_byok_only: z.boolean().optional(),
  is_deranked: z.boolean(),
  is_disabled: z.boolean(),
  is_free: z.boolean(),
  is_hidden: z.boolean(),
  is_hipaa_eligible: z.boolean().optional(),
  is_private: z.boolean(),
  limit_rpd: z.number().int().nonnegative().nullable(),
  limit_rpm: z.number().int().nonnegative().nullable(),
  max_completion_tokens: z.number().int().nonnegative().nullable(),
  max_prompt_tokens: z.number().int().positive().nullable(),
  max_tokens_per_image: z.number().int().positive().nullable(),
  model_variant_permaslug: z.string(),
  model_variant_slug: z.string(),
  moderation_required: z.boolean(),
  name: z.string(),
  provider_display_name: z.string(),
  provider_info: ProviderInfoSchema,
  provider_model_id: z.string(),
  provider_name: z.string(),
  provider_region: z.string().nullable(),
  quantization: z.string(),
  stats: StatsSchema.optional(),
  statsByTier: StatsByTierSchema.optional(),
  status: z.number().max(0).optional(),
  supported_image_parameters: SupportedImageParametersSchema.nullable().optional(),
  supported_parameters: z.array(z.string()),
  supported_video_parameters: SupportedVideoParametersSchema.nullable(),
  supports_multipart: z.boolean(),
  supports_reasoning: z.boolean(),
  supports_tool_parameters: z.boolean(),
  tiers: TiersSchema.optional(),
  variant: z.string(),
})

export type Endpoint = z.infer<typeof EndpointSchema>
