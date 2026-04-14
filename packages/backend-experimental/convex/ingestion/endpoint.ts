import * as R from 'remeda'
import { z } from 'zod'

import { registry } from '../catalog/registry'
import { defineMutationSpec } from '../lib/functionSpec'
import { createIngestSummary, ingestArgsValidator, ingestSummaryValidator } from './shared'

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
    const [provider_slug = raw.provider_slug, provider_variant] = raw.provider_slug.split('/')

    const endpoint_base = compact({
      uuid,
      model_slug: raw.model_variant_slug,
      provider_slug,
      model_version_slug: raw.model_variant_permaslug,
      model_variant: raw.variant,
      provider_variant,
      provider_name: raw.provider_display_name,
      provider_region: raw.provider_region,
      context_length: raw.context_length,
      max_output: raw.max_completion_tokens,
      quantization: raw.quantization,
      supported_parameters: raw.supported_parameters,
      data_policy: compact({
        may_train_on_data: raw.data_policy.training,
        may_publish_data: raw.data_policy.canPublish,
        shares_user_id: raw.data_policy.requiresUserIDs,
        may_retain_data: raw.data_policy.retainsPrompts,
        data_retention_days: raw.data_policy.retentionDays,
      }),
      limits: compact({
        text_input_tokens: raw.max_prompt_tokens,
        image_input_tokens: raw.max_tokens_per_image,
        requests_per_minute: raw.limit_rpm,
        requests_per_day: raw.limit_rpd,
      }),
      capabilities: {
        completions: raw.has_completions,
        chat_completions: raw.has_chat_completions,
        implicit_caching: raw.features.supports_implicit_caching,
        native_web_search: raw.features.supports_native_web_search,
      },
      flags: {
        moderated: raw.moderation_required,
        deranked: raw.is_deranked,
        disabled: raw.is_disabled,
      },
    })

    const endpoint_pricing = compact({
      uuid,
      model_slug: raw.model_variant_slug,
      provider_slug,
      text_input: raw.pricing.prompt,
      text_output: raw.pricing.completion,
      reasoning_output: raw.pricing.internal_reasoning,
      audio_input: raw.pricing.audio,
      audio_cache_write: raw.pricing.input_audio_cache,
      text_cache_read: raw.pricing.input_cache_read,
      text_cache_write: raw.pricing.input_cache_write,
      image_input: raw.pricing.image,
      image_output: raw.pricing.image_output,
      per_request: raw.pricing.request,
      web_search: raw.pricing.web_search,
      discount: raw.pricing.discount,
    })

    return {
      endpoint_base,
      endpoint_pricing,
    }
  })

export function parseEndpointBundle(args: { item: Record<string, unknown> }) {
  return rawEndpointSchema.parse(args.item)
}

export const ingestEndpoints = defineMutationSpec({
  args: ingestArgsValidator,
  returns: ingestSummaryValidator,
  handler: async (ctx, args) => {
    const summary = createIngestSummary()

    for (const item of args.items) {
      summary.processed += 1

      try {
        const { endpoint_base, endpoint_pricing } = parseEndpointBundle({ item })
        const entityKey = endpoint_base.uuid
        const baseData = endpoint_base
        const pricingData = endpoint_pricing

        let itemChanged = false

        const baseState = await registry.bump.handler(ctx, {
          entityKind: 'endpoint',
          entityAspect: 'base',
          entityKey,
          sinceAt: args.sinceAt,
          source: args.source,
          data: baseData,
        })

        if (baseState) {
          await ctx.db.insert('catalog_endpoints_base', {
            ...baseData,
            since_at: args.sinceAt,
            state_id: baseState.stateId,
            sequence: baseState.sequence,
          })

          itemChanged = true
        }

        const pricingState = await registry.bump.handler(ctx, {
          entityKind: 'endpoint',
          entityAspect: 'pricing',
          entityKey,
          sinceAt: args.sinceAt,
          source: args.source,
          data: pricingData,
        })

        if (pricingState) {
          await ctx.db.insert('catalog_endpoint_pricing', {
            ...pricingData,
            since_at: args.sinceAt,
            state_id: pricingState.stateId,
            sequence: pricingState.sequence,
          })

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
          sinceAt: args.sinceAt,
          source: args.source,
          item,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return summary
  },
})
