import * as R from 'remeda'
import { z } from 'zod'

const zPrice = z.coerce
  .number()
  .transform((value) => (value === 0 ? undefined : value))
  .optional()

// Drop nullish values so version hashes only track meaningful pricing and capability changes.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw endpoint payload into the independent endpoint components we store.
const rawEndpointSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    context_length: z.number(),
    model_variant_permaslug: z.string(),
    variant: z.string(),

    provider_name: z.string(),
    provider_display_name: z.string(),
    provider_slug: z.string(),
    provider_region: z.string().nullable(),

    max_prompt_tokens: z.number().nullable(),
    max_completion_tokens: z.number().nullable(),
    max_tokens_per_image: z.number().nullable(),
    limit_rpm: z.number().nullable(),
    limit_rpd: z.number().nullable(),

    quantization: z.string(),
    supported_parameters: z.array(z.string()).transform((value) => value.toSorted()),

    data_policy: z.object({
      training: z.boolean().optional(),
      retainsPrompts: z.boolean().optional(),
      canPublish: z.boolean().optional(),
      retentionDays: z.number().optional(),
      requiresUserIDs: z.boolean().optional(),
    }),

    pricing: z.object({
      prompt: zPrice,
      completion: zPrice,
      image: zPrice,
      image_output: zPrice,
      request: zPrice,
      web_search: zPrice,
      internal_reasoning: zPrice,
      input_cache_read: zPrice,
      input_cache_write: zPrice,
      audio: zPrice,
      input_audio_cache: zPrice,
      discount: zPrice,
    }),

    can_abort: z.boolean(),
    has_completions: z.boolean(),
    has_chat_completions: z.boolean(),
    supports_tool_parameters: z.boolean(),
    supports_reasoning: z.boolean(),
    supports_multipart: z.boolean(),

    features: z.object({
      supports_implicit_caching: z.coerce.boolean(),
      supports_file_urls: z.coerce.boolean(),
      supports_native_web_search: z.coerce.boolean(),
    }),

    moderation_required: z.boolean(),
    is_deranked: z.boolean(),
    is_disabled: z.boolean(),
    status: z.number().optional(),
    deprecation_date: z.string().nullable(),
  })
  .transform((raw) => {
    const { id } = raw
    const [providerId = raw.provider_slug, providerVariant] = raw.provider_slug.split('/')

    const core = compact({
      id,
      modelVersionId: raw.model_variant_permaslug,
      modelVariant: raw.variant,

      providerId,
      providerVariant,
      providerName: raw.provider_display_name,
      providerRegion: raw.provider_region,
      contextLength: raw.context_length,

      maxOutput: raw.max_completion_tokens,
      quantization: raw.quantization,
      supportedParameters: raw.supported_parameters,

      dataPolicy: compact({
        mayTrainOnData: raw.data_policy.training,
        mayPublishData: raw.data_policy.canPublish,
        sharesUserId: raw.data_policy.requiresUserIDs,
        mayRetainData: raw.data_policy.retainsPrompts,
        dataRetentionDays: raw.data_policy.retentionDays,
      }),

      limits: compact({
        textInputTokens: raw.max_prompt_tokens,
        imageInputTokens: raw.max_tokens_per_image,
        requestsPerMinute: raw.limit_rpm,
        requestsPerDay: raw.limit_rpd,
      }),

      capabilities: {
        completions: raw.has_completions,
        chatCompletions: raw.has_chat_completions,
        implicitCaching: raw.features.supports_implicit_caching,
        nativeWebSearch: raw.features.supports_native_web_search,
      },

      flags: {
        moderated: raw.moderation_required,
        deranked: raw.is_deranked,
        disabled: raw.is_disabled,
      },
    })

    const pricing = compact({
      id,
      providerId,
      textInput: raw.pricing.prompt,
      textOutput: raw.pricing.completion,
      reasoningOutput: raw.pricing.internal_reasoning,
      audioInput: raw.pricing.audio,
      audioCacheWrite: raw.pricing.input_audio_cache,
      textCacheRead: raw.pricing.input_cache_read,
      textCacheWrite: raw.pricing.input_cache_write,
      imageInput: raw.pricing.image,
      imageOutput: raw.pricing.image_output,
      perRequest: raw.pricing.request,
      webSearch: raw.pricing.web_search,
      discount: raw.pricing.discount,
    })

    return {
      id,
      core,
      pricing,
    }
  })

export function parseEndpointBundle(args: { item: Record<string, unknown>; modelId: string }) {
  const entity = rawEndpointSchema.parse(args.item)

  return {
    id: entity.id,
    modelId: args.modelId,
    core: {
      ...entity.core,
      modelId: args.modelId,
    },
    pricing: {
      ...entity.pricing,
      modelId: args.modelId,
    },
  }
}
