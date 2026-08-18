import type { Doc } from '../../_generated/dataModel'
import type { OrcaPublicApiV2Endpoint, OrcaPublicApiV2Model } from './schema'

export function transformEndpointsToV2Models({
  endpoints,
}: {
  endpoints: Doc<'or_views_endpoints'>[]
}): OrcaPublicApiV2Model[] {
  return Map.groupBy(endpoints, (endp) => endp.model.slug)
    .values()
    .map((group) => {
      const [{ model }] = group
      const providers = group.map(transformEndpoint)

      return {
        id: model.slug,
        version_id: model.version_slug,
        name: model.name,
        author_name: model.author_name,
        variant: model.variant,
        created_at: new Date(model.or_added_at).toISOString(),
        input_modalities: model.input_modalities,
        output_modalities: model.output_modalities,
        reasoning: model.reasoning,
        providers,
      }
    })
    .toArray()
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
}

function formatPrice(price: number | undefined): string | null {
  if (price === undefined || price === 0) {
    return null
  }
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
  })
}

// * Transform function
function transformEndpoint(input: Doc<'or_views_endpoints'>): OrcaPublicApiV2Endpoint {
  const pricing = {
    text_input: formatPrice(input.pricing.text_input),
    text_output: formatPrice(input.pricing.text_output),
    image_input: formatPrice(input.pricing.image_input),
    image_output: formatPrice(input.pricing.image_output),
    audio_input: formatPrice(input.pricing.audio_input),
    audio_cache_write: formatPrice(input.pricing.audio_cache_input),
    text_cache_read: formatPrice(input.pricing.cache_read),
    text_cache_write: formatPrice(input.pricing.cache_write),
    reasoning_output: formatPrice(input.pricing.internal_reasoning),
    per_request: formatPrice(input.pricing.request),
    tiers: null,
  }

  const dataPolicy = {
    may_publish_data: input.data_policy.can_publish ?? false,
    may_retain_data: input.data_policy.retains_prompts ?? false,
    data_retention_days: input.data_policy.retains_prompts_days ?? null,
    may_train_on_data: input.data_policy.training ?? false,
    shares_user_id: input.data_policy.requires_user_ids ?? false,
  }

  const limits = {
    text_input_tokens: input.limits.text_input_tokens ?? null,
    text_output_tokens: input.limits.text_output_tokens ?? null,
    image_input_tokens: input.limits.image_input_tokens ?? null,
    images_per_input: input.limits.images_per_input ?? null,
    requests_per_minute: input.limits.requests_per_minute ?? null,
    requests_per_day: input.limits.requests_per_day ?? null,
  }

  return {
    provider_id: input.provider.tag_slug,
    provider_name: input.provider.name,
    provider_region: input.provider.region ?? null,
    context_length: input.context_length,
    pricing,
    supported_parameters: input.supported_parameters,
    quantization: input.quantization ?? 'unknown',
    data_policy: dataPolicy,
    limits,
    completions: input.completions,
    chat_completions: input.chat_completions,
    deranked: input.deranked,
    implicit_caching: input.implicit_caching,
    moderated: input.moderated,
    native_web_search: input.native_web_search,
    stats_last_30m: input.stats
      ? {
          latency_ms_p50: input.stats.p50_latency,
          tokens_per_sec_p50: input.stats.p50_throughput,
        }
      : null,
  }
}
