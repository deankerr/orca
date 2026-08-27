import { z } from 'zod'

const ReasoningConfigSchema = z.looseObject({
  default_reasoning_effort: z.string().nullable().optional(),
  default_reasoning_enabled: z.boolean().nullable().optional(),
  end_token: z.string().nullable().optional(),
  is_mandatory_reasoning: z.boolean().nullable().optional(),
  reasoning_return_mechanism: z.string().optional(),
  start_token: z.string().nullable().optional(),
  supported_reasoning_efforts: z.array(z.string()).nullable().optional(),
  supports_reasoning_effort: z.boolean().optional(),
  supports_reasoning_max_tokens: z.boolean().nullable().optional(),
  system_prompt: z.string().nullable().optional(),
})

const ModelFeaturesSchema = z.looseObject({
  chat_template_config: z
    .looseObject({
      should_hoist_and_merge_system_messages: z.boolean().nullable().optional(),
    })
    .optional(),
  reasoning_config: ReasoningConfigSchema.optional(),
  required_input_modalities: z.array(z.string()).min(1).optional(),
})

const DefaultParametersSchema = z.looseObject({
  frequency_penalty: z.null().optional(),
  presence_penalty: z.number().nullable().optional(),
  repetition_penalty: z.number().nullable().optional(),
  temperature: z.number().nullable().optional(),
  top_k: z.number().nullable().optional(),
  top_p: z.number().nullable().optional(),
})

const PreviewAssetSchema = z.looseObject({
  thumbnail_url: z.url(),
  url: z.url(),
})

const PreviewAudioSchema = z.looseObject({
  duration_ms: z.null(),
  modality: z.string(),
  sample_rate_hz: z.null(),
  transcript: z.string(),
  url: z.url(),
  voice: z.string(),
})

export const ModelSchema = z.looseObject({
  author: z.string(),
  author_display_name: z.string(),
  author_flagship_modalities: z.array(z.string()).optional(),
  author_icon_uri: z.string().nullable().optional(),
  context_length: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  default_order: z.array(z.string()),
  default_parameters: DefaultParametersSchema.nullable(),
  default_stops: z.array(z.string()),
  default_system: z.string().nullable(),
  description: z.string(),
  features: ModelFeaturesSchema.nullable(),
  group: z.string(),
  has_text_output: z.boolean(),
  hf_slug: z.string().nullable(),
  hf_updated_at: z.null(),
  hidden: z.boolean(),
  input_modalities: z.array(z.string()),
  instruct_type: z.string().nullable(),
  is_private: z.boolean(),
  is_trainable_image: z.null(),
  is_trainable_text: z.boolean().nullable(),
  knowledge_cutoff: z.string().nullable(),
  limit_rpd: z.number().int().nonnegative().nullable(),
  limit_rpm: z.number().int().nonnegative().nullable(),
  model_version_group_id: z.uuid().nullable(),
  name: z.string(),
  output_modalities: z.array(z.string()),
  permaslug: z.string(),
  preview_audio: PreviewAudioSchema.nullable().optional(),
  preview_thumbnail_url: z.url().nullable().optional(),
  previews_by_modality: z
    .looseObject({
      image: PreviewAssetSchema.optional(),
      video: PreviewAssetSchema.optional(),
    })
    .optional(),
  promotion_message: z.string().nullable(),
  quick_start_example_type: z.string().nullable(),
  reasoning_config: ReasoningConfigSchema.nullable(),
  required_attestation_types: z.array(z.string()).optional(),
  router: z.null(),
  routing_error_message: z.string().nullable(),
  short_name: z.string(),
  slug: z.string(),
  supported_tts_voices: z.array(z.string()).nullable(),
  supports_reasoning: z.boolean(),
  updated_at: z.iso.datetime({ offset: true }),
  warning_message: z.string().nullable(),
})

export type Model = z.infer<typeof ModelSchema>
