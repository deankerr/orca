import { z } from 'zod'

const DataPolicyOutputSchema = z.object({
  may_publish_data: z.boolean(),
  may_retain_data: z.boolean(),
  data_retention_days: z.number().nullable(),
  may_train_on_data: z.boolean(),
  shares_user_id: z.boolean(),
})

const PricingOutputSchema = z.object({
  text_input: z.string().nullable(),
  text_output: z.string().nullable(),
  image_input: z.string().nullable(),
  image_output: z.string().nullable(),
  audio_input: z.string().nullable(),
  audio_cache_write: z.string().nullable(),
  text_cache_read: z.string().nullable(),
  text_cache_write: z.string().nullable(),
  reasoning_output: z.string().nullable(),
  per_request: z.string().nullable(),
  // the source of this property has been deprecated upstream, so the original transform would
  // always result in null. the non-functional transform itself has now been removed.
  tiers: z.null(),
})

const LimitsOutputSchema = z.object({
  text_input_tokens: z.number().nullable(),
  text_output_tokens: z.number().nullable(),
  image_input_tokens: z.number().nullable(),
  images_per_input: z.number().nullable(),
  requests_per_minute: z.number().nullable(),
  requests_per_day: z.number().nullable(),
})

const OrcaPublicApiV2EndpointSchema = z.object({
  provider_id: z.string(),
  provider_name: z.string(),
  provider_region: z.string().nullable(),
  context_length: z.number(),
  pricing: PricingOutputSchema,
  supported_parameters: z.array(z.string()),
  quantization: z.string(),
  data_policy: DataPolicyOutputSchema,
  limits: LimitsOutputSchema,
  completions: z.boolean(),
  chat_completions: z.boolean(),
  deranked: z.boolean(),
  implicit_caching: z.boolean(),
  moderated: z.boolean(),
  native_web_search: z.boolean(),
  stats_last_30m: z
    .object({
      latency_ms_p50: z.number(),
      tokens_per_sec_p50: z.number(),
    })
    .nullable(),
})

export type OrcaPublicApiV2Endpoint = z.infer<typeof OrcaPublicApiV2EndpointSchema>

export const OrcaPublicApiV2ModelSchema = z.object({
  id: z.string(),
  version_id: z.string(),
  name: z.string(),
  author_name: z.string(),
  variant: z.string(),
  created_at: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  reasoning: z.boolean(),
  providers: z.array(OrcaPublicApiV2EndpointSchema),
})

export type OrcaPublicApiV2Model = z.infer<typeof OrcaPublicApiV2ModelSchema>

export const OrcaPublicApiV2Schema = z.object({
  updated_at: z.string(),
  models: z.array(OrcaPublicApiV2ModelSchema),
})

export type OrcaPublicApiV2 = z.infer<typeof OrcaPublicApiV2Schema>
