import * as R from 'remeda'
import { z } from 'zod'

const zPrice = z.coerce
  .number()
  .transform((value) => (value === 0 ? undefined : value))
  .optional()

const zStatNumber = z.preprocess((value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}, z.number().optional())

const zStats = z
  .looseObject({
    p50_latency: zStatNumber,
    p50_throughput: zStatNumber,
    p75_latency: zStatNumber,
    p75_throughput: zStatNumber,
    p90_latency: zStatNumber,
    p90_throughput: zStatNumber,
    p95_latency: zStatNumber,
    p95_throughput: zStatNumber,
    p99_latency: zStatNumber,
    p99_throughput: zStatNumber,
    request_count: zStatNumber,
    window_minutes: zStatNumber,
  })
  .optional()
  .catch(undefined)

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

    model: z.object({
      created_at: z
        .string()
        .transform((value) => Date.parse(value))
        .pipe(z.number()),
      input_modalities: z
        .string()
        .array()
        .transform((value) => value.toSorted()),
      output_modalities: z
        .string()
        .array()
        .transform((value) => value.toSorted()),
      short_name: z.string(),
    }),

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
      supports_implicit_caching: z.boolean().optional(),
      supports_native_web_search: z.boolean().optional(),
    }),

    deprecation_date: z.string().nullable(),
    is_deranked: z.boolean(),
    is_disabled: z.boolean(),
    moderation_required: z.boolean(),
    stats: zStats,
    status: z.number().optional(),
  })
  .transform((raw) => {
    const { id } = raw
    const modelId = raw.model_variant_slug
    const [providerId = raw.provider_slug, providerVariant] = raw.provider_slug.split('/')

    const content = compact({
      id,
      modelCreatedAt: raw.model.created_at,
      modelId,
      modelName: raw.model.short_name,
      modelVariant: raw.variant,
      modelVersionId: raw.model_variant_permaslug,

      providerId,
      providerName: raw.provider_display_name,
      providerRegion: raw.provider_region,
      providerVariant,

      inputModalities: raw.model.input_modalities,
      outputModalities: raw.model.output_modalities,
      reasoning: raw.supports_reasoning,

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
        implicitCaching: raw.features.supports_implicit_caching ?? false,
        nativeWebSearch: raw.features.supports_native_web_search ?? false,
      },

      flags: {
        deranked: raw.is_deranked,
        disabled: raw.is_disabled,
        moderated: raw.moderation_required,
      },
    })

    const stats =
      raw.stats === undefined
        ? undefined
        : compact({
            p50Latency: raw.stats.p50_latency,
            p50Throughput: raw.stats.p50_throughput,
            p75Latency: raw.stats.p75_latency,
            p75Throughput: raw.stats.p75_throughput,
            p90Latency: raw.stats.p90_latency,
            p90Throughput: raw.stats.p90_throughput,
            p95Latency: raw.stats.p95_latency,
            p95Throughput: raw.stats.p95_throughput,
            p99Latency: raw.stats.p99_latency,
            p99Throughput: raw.stats.p99_throughput,
            requestCount: raw.stats.request_count,
            windowMinutes: raw.stats.window_minutes,
          })

    return {
      catalog: {
        content,
        entity: {
          id,
          label: `${id} ${providerId} ${providerVariant}`,
          modelId,
          providerId,
        },
      },
      stats,
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
