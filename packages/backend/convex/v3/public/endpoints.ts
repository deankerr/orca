import { z } from 'zod'

import { query } from '../../_generated/server'
import { V3_ENDPOINTS_VIEW_TABLE } from '../entities.table'
import { getCurrentScan } from '../ingestions'
import { Model } from './models'
import { Provider } from './providers'

// Missing or invalid metadata remains unknown rather than implying a value.
const zQuantity = z.number().nonnegative().nullable().catch(null)
const zPolicy = z.boolean().nullable().catch(null)
const zCapability = z.boolean().nullable().catch(null)

// The grid treats zero prices as absent, alongside missing or malformed meters.
const zPrice = z
  .string()
  .trim()
  .min(1)
  .pipe(z.coerce.number<string>().positive())
  .optional()
  .catch(undefined)

const EndpointPricing = z
  .object({
    meters: z.object({
      prompt: zPrice,
      completion: zPrice,
      input_cache_read: zPrice,
      input_cache_write: zPrice,
      audio: zPrice,
      input_audio_cache: zPrice,
      image: zPrice,
      image_output: zPrice,
      web_search: zPrice,
    }),
  })
  .transform(({ meters }) => ({
    text_input: meters.prompt,
    text_output: meters.completion,
    cache_read: meters.input_cache_read,
    cache_write: meters.input_cache_write,
    audio_input: meters.audio,
    audio_cache_read: meters.input_audio_cache,
    image_input: meters.image,
    image_output: meters.image_output,
    web_search: meters.web_search,
  }))

const EndpointMetadata = z
  .object({
    context_length: zQuantity,
    max_completion_tokens: zQuantity,
    max_prompt_tokens: zQuantity,
    max_tokens_per_image: zQuantity,
    max_prompt_images: zQuantity,
    limit_rpm: zQuantity,
    limit_rpd: zQuantity,
    quantization: z.string().nullable().catch(null),
    supported_parameters: z.array(z.string()).nullable().catch(null),
    supports_reasoning: zCapability,
    has_completions: zCapability,
    has_chat_completions: zCapability,
    'features.supports_implicit_caching': zCapability,
    'features.supports_native_web_search': zCapability,
    moderation_required: zCapability,
    is_deranked: zCapability,
    is_disabled: zCapability,
    'data_policy.training': zPolicy,
    'data_policy.canPublish': zPolicy,
    'data_policy.requiresUserIDs': zPolicy,
    'data_policy.retainsPrompts': zPolicy,
    'data_policy.retentionDays': zQuantity,
  })
  .transform((metadata) => ({
    context_length: metadata.context_length,
    // Preserve the simple context-length fallback until output-limit semantics are refined.
    max_output: metadata.max_completion_tokens ?? metadata.context_length,
    quantization: metadata.quantization,
    supported_parameters: metadata.supported_parameters,
    reasoning: metadata.supports_reasoning,
    completions: metadata.has_completions,
    chat_completions: metadata.has_chat_completions,
    implicit_caching: metadata['features.supports_implicit_caching'],
    native_web_search: metadata['features.supports_native_web_search'],
    moderated: metadata.moderation_required,
    deranked: metadata.is_deranked,
    disabled: metadata.is_disabled,
    data_policy: {
      may_train_on_data: metadata['data_policy.training'],
      may_publish_data: metadata['data_policy.canPublish'],
      shares_user_id: metadata['data_policy.requiresUserIDs'],
      may_retain_data: metadata['data_policy.retainsPrompts'],
      data_retention_days: metadata['data_policy.retentionDays'],
    },
    limits: {
      text_input_tokens: metadata.max_prompt_tokens,
      image_input_tokens: metadata.max_tokens_per_image,
      images_per_input: metadata.max_prompt_images,
      requests_per_minute: metadata.limit_rpm,
      requests_per_day: metadata.limit_rpd,
    },
  }))

/** Normalize stored metadata while retaining entity identity and creation time. */
export const Endpoint = z
  .object({
    _id: z.string(),
    _creationTime: z.number(),
    endpoint_id: z.string(),
    unlisted_at: z.string().optional(),
    model_id: z.string(),
    provider_id: z.string(),
    provider_tag: z.string(),
    variant: z.string(),
    model_display_name: Model.shape.display_name,
    model_permaslug: Model.shape.permaslug,
    model_or_created_at: Model.shape.or_created_at,
    input_modalities: Model.shape.input_modalities,
    output_modalities: Model.shape.output_modalities,
    provider_display_name: Provider.shape.display_name,
    pricing: EndpointPricing,
    metadata: EndpointMetadata,
  })
  .transform(({ metadata, ...identity }) => ({ ...identity, ...metadata }))

export type Endpoint = z.infer<typeof Endpoint>

/** List current endpoint details, including endpoints unlisted in the last 30 scan days. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const scan = await getCurrentScan(ctx)

    if (scan === null) {
      return []
    }

    const cutoff = new Date(Date.parse(scan.scan_at) - 30 * 24 * 60 * 60 * 1000).toISOString()
    const listed = await ctx.db
      .query(V3_ENDPOINTS_VIEW_TABLE)
      .withIndex('by_unlisted_at', (q) => q.eq('unlisted_at', undefined))
      .collect()

    const unlisted = await ctx.db
      .query(V3_ENDPOINTS_VIEW_TABLE)
      .withIndex('by_unlisted_at', (q) => q.gte('unlisted_at', cutoff))
      .collect()

    return [...listed, ...unlisted].map((row) => Endpoint.parse(row))
  },
})
