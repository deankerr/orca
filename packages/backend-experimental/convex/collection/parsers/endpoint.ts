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
export const rawEndpointTransformSchema = z
  .object({
    id: z.string(),

    context_length: z.number(),
    model_variant_permaslug: z.string(),
    model_variant_slug: z.string(),
    variant: z.string(),

    provider_display_name: z.string(),
    provider_name: z.string(),
    provider_region: z.string().nullable(),
    provider_slug: z.string(),

    max_completion_tokens: z.number().nullable(),
    max_prompt_tokens: z.number().nullable(),
    max_tokens_per_image: z.number().nullable(),

    limit_rpd: z.number().nullable(),
    limit_rpm: z.number().nullable(),

    quantization: z.string(),
    supported_parameters: z.array(z.string()).transform((value) => value.toSorted()),

    data_policy: z.object({
      canPublish: z.boolean().optional(),
      requiresUserIDs: z.boolean().optional(),
      retainsPrompts: z.boolean().optional(),
      retentionDays: z.number().optional(),
      training: z.boolean().optional(),
    }),

    pricing: z.object({
      audio: zPrice,
      completion: zPrice,
      discount: zPrice,
      image: zPrice,
      image_output: zPrice,
      input_audio_cache: zPrice,
      input_cache_read: zPrice,
      input_cache_write: zPrice,
      internal_reasoning: zPrice,
      prompt: zPrice,
      request: zPrice,
      web_search: zPrice,
    }),

    has_chat_completions: z.boolean(),
    has_completions: z.boolean(),
    supports_reasoning: z.boolean(),

    features: z.object({
      supports_implicit_caching: z.coerce.boolean(),
      supports_native_web_search: z.coerce.boolean(),
    }),

    deprecation_date: z.string().nullable(),
    is_deranked: z.boolean(),
    is_disabled: z.boolean(),
    moderation_required: z.boolean(),
    status: z.number().optional(),
  })
  .transform((raw) => {
    const { id } = raw
    const modelId = raw.model_variant_slug
    const [providerId = raw.provider_slug, providerVariant] = raw.provider_slug.split('/')

    const content = compact({
      id,
      modelId,
      modelVariant: raw.variant,
      modelVersionId: raw.model_variant_permaslug,

      providerId,
      providerName: raw.provider_display_name,
      providerRegion: raw.provider_region,
      providerVariant,

      contextLength: raw.context_length,

      maxOutput: raw.max_completion_tokens,
      quantization: raw.quantization,
      supportedParameters: raw.supported_parameters,

      pricing: compact({
        audioCacheWrite: raw.pricing.input_audio_cache,
        audioInput: raw.pricing.audio,
        discount: raw.pricing.discount,
        imageInput: raw.pricing.image,
        imageOutput: raw.pricing.image_output,
        perRequest: raw.pricing.request,
        reasoningOutput: raw.pricing.internal_reasoning,
        textCacheRead: raw.pricing.input_cache_read,
        textCacheWrite: raw.pricing.input_cache_write,
        textInput: raw.pricing.prompt,
        textOutput: raw.pricing.completion,
        webSearch: raw.pricing.web_search,
      }),

      dataPolicy: compact({
        dataRetentionDays: raw.data_policy.retentionDays,
        mayPublishData: raw.data_policy.canPublish,
        mayRetainData: raw.data_policy.retainsPrompts,
        mayTrainOnData: raw.data_policy.training,
        sharesUserId: raw.data_policy.requiresUserIDs,
      }),

      limits: compact({
        imageInputTokens: raw.max_tokens_per_image,
        requestsPerDay: raw.limit_rpd,
        requestsPerMinute: raw.limit_rpm,
        textInputTokens: raw.max_prompt_tokens,
      }),

      capabilities: {
        chatCompletions: raw.has_chat_completions,
        completions: raw.has_completions,
        implicitCaching: raw.features.supports_implicit_caching,
        nativeWebSearch: raw.features.supports_native_web_search,
      },

      flags: {
        deranked: raw.is_deranked,
        disabled: raw.is_disabled,
        moderated: raw.moderation_required,
      },
    })

    return {
      content,
      entity: {
        id,
        label: `${id} ${providerId} ${providerVariant}`,
        modelId,
        providerId,
      },
    }
  })

// Endpoint identity is the critical success boundary for a model's endpoint crawl.
export const rawEndpointIdentitySchema = z
  .looseObject({
    id: z.string(),
    model_variant_permaslug: z.string(),
    model_variant_slug: z.string(),
    variant: z.string(),
  })
  .transform((raw) => ({
    id: raw.id,
    rawEndpoint: raw,
  }))
