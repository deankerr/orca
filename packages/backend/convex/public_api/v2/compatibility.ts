import { z } from 'zod'

import type { ScanEntry } from '#scans/collection'

import type { OrcaPublicApiV2Endpoint, OrcaPublicApiV2Model } from './schema'

const optionalNumber = z.number().nullish()

/** Upstream rates are decimal strings; absent means unmetered. */
const meter = z.coerce.number().optional()

const stat = { p50_latency: z.number(), p50_throughput: z.number() }

/** V2 publishes median stats only when both are present. */
const Stats = z.union([
  z.object(stat).transform(({ p50_latency, p50_throughput }) => ({
    latency_ms_p50: p50_latency,
    tokens_per_sec_p50: p50_throughput,
  })),
  z
    .object({
      p50_latency: stat.p50_latency.nullish(),
      p50_throughput: stat.p50_throughput.nullish(),
    })
    .optional()
    .transform(() => null),
])

const Endpoint = z.object({
  context_length: z.number(),
  data_policy: z.object({
    canPublish: z.boolean().optional(),
    requiresUserIDs: z.boolean().optional(),
    retainsPrompts: z.boolean().optional(),
    retentionDays: z.number().optional(),
    training: z.boolean().optional(),
  }),
  features: z.object({
    supports_implicit_caching: z.boolean().optional(),
    supports_native_web_search: z.boolean().optional(),
  }),
  has_chat_completions: z.boolean(),
  has_completions: z.boolean(),
  is_deranked: z.boolean(),
  is_disabled: z.boolean(),
  limit_rpd: optionalNumber,
  limit_rpm: optionalNumber,
  max_completion_tokens: optionalNumber,
  max_prompt_images: optionalNumber,
  max_prompt_tokens: optionalNumber,
  max_tokens_per_image: optionalNumber,
  model_variant_slug: z.string(),
  moderation_required: z.boolean(),
  pricing: z.object({
    audio: meter,
    completion: meter,
    image: meter,
    image_output: meter,
    input_audio_cache: meter,
    input_cache_read: meter,
    input_cache_write: meter,
    internal_reasoning: meter,
    prompt: meter,
    request: meter,
  }),
  provider_info: z.object({ displayName: z.string() }),
  provider_region: z.string().nullish(),
  provider_slug: z.string(),
  quantization: z.string().nullish(),
  stats: Stats,
  supported_parameters: z.array(z.string()),
  supports_reasoning: z.boolean(),
})

const Model = z.object({
  author: z.string(),
  created_at: z.string(),
  input_modalities: z.array(z.string()),
  name: z.string(),
  output_modalities: z.array(z.string()),
  permaslug: z.string(),
  short_name: z.string(),
})

/**
 * Frozen V2 mapping over the full scan: no product filtering or provider normalization.
 * Model short_name already includes its variant suffix. provider_info.displayName, zero prices
 * as null, and the misnamed audio_cache_write field deliberately preserve the published contract.
 */
export function transformScanToV2Models(entries: ScanEntry[]): OrcaPublicApiV2Model[] {
  const output = new Map<string, OrcaPublicApiV2Model>()

  for (const entry of entries) {
    // Null means the catalog model has no endpoint; failed fetches abort the source scan.
    for (const endpoint of entry.endpoints ?? []) {
      const facts = Endpoint.parse(endpoint)

      if (facts.is_disabled) {
        continue
      }

      let group = output.get(facts.model_variant_slug)

      if (group === undefined) {
        // oxlint-disable sort-keys -- Published V2 model field order (matches the frozen schema and cached JSON blob).
        const model = Model.parse(entry.model)
        group = {
          id: facts.model_variant_slug,
          version_id: model.permaslug,
          name: model.short_name,
          author_name: model.name.includes(':')
            ? model.name.slice(0, model.name.indexOf(':')).trim()
            : model.author,
          variant: entry.variant,
          created_at: new Date(model.created_at).toISOString(),
          input_modalities: model.input_modalities.toSorted(),
          output_modalities: model.output_modalities.toSorted(),
          reasoning: facts.supports_reasoning,
          providers: [],
        }
        // oxlint-enable sort-keys
        output.set(group.id, group)
      }

      group.providers.push(transformEndpoint(facts))
    }
  }

  return [...output.values()].toSorted((a, b) => b.created_at.localeCompare(a.created_at))
}

function formatPrice(price: number | undefined): string | null {
  if (price === undefined || price === 0) {
    return null
  }

  return price.toLocaleString('en-US', { maximumFractionDigits: 20, minimumFractionDigits: 0 })
}

function transformEndpoint(facts: z.infer<typeof Endpoint>): OrcaPublicApiV2Endpoint {
  const meters = facts.pricing

  // oxlint-disable sort-keys -- Published V2 endpoint field order (matches the frozen schema and cached JSON blob).
  return {
    provider_id: facts.provider_slug,
    provider_name: facts.provider_info.displayName,
    provider_region: facts.provider_region ?? null,
    context_length: facts.context_length,
    pricing: {
      text_input: formatPrice(meters.prompt),
      text_output: formatPrice(meters.completion),
      image_input: formatPrice(meters.image),
      image_output: formatPrice(meters.image_output),
      audio_input: formatPrice(meters.audio),
      audio_cache_write: formatPrice(meters.input_audio_cache),
      text_cache_read: formatPrice(meters.input_cache_read),
      text_cache_write: formatPrice(meters.input_cache_write),
      reasoning_output: formatPrice(meters.internal_reasoning),
      per_request: formatPrice(meters.request),
      tiers: null,
    },
    supported_parameters: facts.supported_parameters.toSorted(),
    quantization: facts.quantization ?? 'unknown',
    data_policy: {
      may_publish_data: facts.data_policy.canPublish ?? false,
      may_retain_data: facts.data_policy.retainsPrompts ?? false,
      data_retention_days: facts.data_policy.retentionDays ?? null,
      may_train_on_data: facts.data_policy.training ?? false,
      shares_user_id: facts.data_policy.requiresUserIDs ?? false,
    },
    limits: {
      text_input_tokens: facts.max_prompt_tokens ?? null,
      text_output_tokens: facts.max_completion_tokens ?? null,
      image_input_tokens: facts.max_tokens_per_image ?? null,
      images_per_input: facts.max_prompt_images ?? null,
      requests_per_minute: facts.limit_rpm ?? null,
      requests_per_day: facts.limit_rpd ?? null,
    },
    completions: facts.has_completions,
    chat_completions: facts.has_chat_completions,
    deranked: facts.is_deranked,
    implicit_caching: facts.features.supports_implicit_caching ?? false,
    moderated: facts.moderation_required,
    native_web_search: facts.features.supports_native_web_search ?? false,
    stats_last_30m: facts.stats,
  }
  // oxlint-enable sort-keys
}
