import { z } from 'zod'

import { query } from '../../_generated/server'
import { V3_ENDPOINTS_VIEW_TABLE } from '../entities.table'

// Missing or invalid metadata remains unknown rather than implying a value.
const zQuantity = z.number().nonnegative().nullable().catch(null)
const zPolicy = z.boolean().nullable().catch(null)
const zCapability = z.boolean().nullable().catch(null)

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
    metadata: EndpointMetadata,
  })
  .transform(({ metadata, ...identity }) => ({ ...identity, ...metadata }))

export type Endpoint = z.infer<typeof Endpoint>

/** List baseline endpoint details with model/provider references for client joins. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query(V3_ENDPOINTS_VIEW_TABLE)
      .withIndex('by_unlisted_at', (q) => q.eq('unlisted_at', undefined))
      .collect()

    return rows.map((row) => Endpoint.parse(row))
  },
})
