import * as R from 'remeda'
import { z } from 'zod'

import { defineMutationSpec } from '../lib/functionSpec'
import { bumpVersion, createIngestSummary, ingestArgsValidator } from './shared'

const zPrice = z.coerce
  .number()
  .transform((value) => (value === 0 ? undefined : value))
  .optional()

function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

const rawEndpointSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    context_length: z.number(),
    model_variant_slug: z.string(),
    model_variant_permaslug: z.string(),
    provider_name: z.string(),
    provider_display_name: z.string(),
    provider_slug: z.string(),
    provider_region: z.string().nullable(),
    max_prompt_tokens: z.number().nullable(),
    max_completion_tokens: z.number().nullable(),
    max_tokens_per_image: z.number().nullable(),
    limit_rpm: z.number().nullable(),
    limit_rpd: z.number().nullable(),
    variant: z.string(),
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
    const uuid = raw.id
    const [providerSlug = raw.provider_slug, providerVariant] = raw.provider_slug.split('/')

    const endpointRecord = compact({
      id: uuid,
      modelId: raw.model_variant_slug,
      providerId: providerSlug,
      modelVersionSlug: raw.model_variant_permaslug,
      modelVariant: raw.variant,
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

    const endpointPricingRecord = compact({
      id: uuid,
      modelId: raw.model_variant_slug,
      providerId: providerSlug,
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
      id: uuid,
      endpointRecord,
      endpointPricingRecord,
    }
  })

export function parseEndpointBundle(args: { item: Record<string, unknown> }) {
  return rawEndpointSchema.parse(args.item)
}

export const ingestEndpoints = defineMutationSpec({
  args: ingestArgsValidator,
  handler: async (ctx, args) => {
    const summary = createIngestSummary()

    for (const item of args.items) {
      summary.processed += 1

      try {
        const { id, endpointRecord, endpointPricingRecord } = parseEndpointBundle({ item })

        let itemChanged = false

        // Check version and insert endpoint base record if changed
        const endpointWithVersion = await bumpVersion(ctx, {
          table: 'catalog_endpoints',
          id,
          data: endpointRecord,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
        })
        if (endpointWithVersion) {
          await ctx.db.insert('catalog_endpoints', endpointWithVersion)
          itemChanged = true
        }

        // Check version and insert endpoint pricing record if changed
        const pricingWithVersion = await bumpVersion(ctx, {
          table: 'catalog_endpoint_pricing',
          id,
          data: endpointPricingRecord,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
        })
        if (pricingWithVersion) {
          await ctx.db.insert('catalog_endpoint_pricing', pricingWithVersion)
          itemChanged = true
        }

        if (itemChanged) {
          summary.changed += 1
        } else {
          summary.unchanged += 1
        }
      } catch (error) {
        summary.failed += 1
        console.log('[ingestion:endpoint] failed to parse or store item', {
          firstSeenAt: args.firstSeenAt,
          source: args.source,
          item,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return summary
  },
})
