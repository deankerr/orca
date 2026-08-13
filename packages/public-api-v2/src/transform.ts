// * Revalidated observation → V2 wire shapes.
// * Object key order is alphabetical (sort-keys) so JSON matches Convex's
// * query-return alphabetization without a runtime reorder pass.

import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'

import type {
  EndpointObservation,
  Model as V2Model,
  ModelObservation,
  Provider as V2Provider,
} from './schema.ts'

/** OR `+00:00` (and other offsets) → ISO with `Z`, matching Convex `toISOString()`. */
function toIsoZ(value: string): string {
  return Option.match(DateTime.make(value), {
    onNone: () => value,
    onSome: DateTime.formatIso,
  })
}

function formatPrice(price: number | undefined): string | null {
  if (price === undefined || price === 0) {
    return null
  }
  return price.toLocaleString('en-US', {
    maximumFractionDigits: 20,
    minimumFractionDigits: 0,
  })
}

/** Structural map: revalidated endpoint → V2 provider. Does not check `is_disabled`. */
export function toProvider(source: EndpointObservation): V2Provider {
  return {
    chat_completions: source.has_chat_completions,
    completions: source.has_completions,
    context_length: source.context_length,
    data_policy: {
      data_retention_days: source.data_policy.retentionDays ?? null,
      may_publish_data: source.data_policy.canPublish ?? false,
      may_retain_data: source.data_policy.retainsPrompts ?? false,
      may_train_on_data: source.data_policy.training ?? false,
      shares_user_id: source.data_policy.requiresUserIDs ?? false,
    },
    deranked: source.is_deranked,
    implicit_caching: source.features.supports_implicit_caching ?? false,
    limits: {
      image_input_tokens: source.max_tokens_per_image,
      images_per_input: source.max_prompt_images ?? null,
      requests_per_day: source.limit_rpd,
      requests_per_minute: source.limit_rpm,
      text_input_tokens: source.max_prompt_tokens,
      text_output_tokens: source.max_completion_tokens,
    },
    moderated: source.moderation_required,
    native_web_search: source.features.supports_native_web_search ?? false,
    pricing: {
      audio_cache_write: formatPrice(source.pricing.input_audio_cache),
      audio_input: formatPrice(source.pricing.audio),
      image_input: formatPrice(source.pricing.image),
      image_output: formatPrice(source.pricing.image_output),
      per_request: formatPrice(source.pricing.request),
      reasoning_output: formatPrice(source.pricing.internal_reasoning),
      text_cache_read: formatPrice(source.pricing.input_cache_read),
      text_cache_write: formatPrice(source.pricing.input_cache_write),
      text_input: formatPrice(source.pricing.prompt),
      text_output: formatPrice(source.pricing.completion),
      // * Abandoned upstream (`variable_pricings`); newer tier model not handled yet.
      tiers: null,
    },
    provider_id: source.provider_slug,
    provider_name: source.provider_display_name,
    provider_region: source.provider_region,
    quantization: source.quantization ?? 'unknown',
    stats_last_30m: source.stats
      ? {
          latency_ms_p50: source.stats.p50_latency,
          tokens_per_sec_p50: source.stats.p50_throughput,
        }
      : null,
    // * Match snapshot materialize: alphabetize string arrays.
    supported_parameters: source.supported_parameters.toSorted(),
  }
}

/**
 * Match Convex snapshot materialize (`models.ts`):
 * prefix before first `:` in display `name`, else OR author slug.
 */
function authorName(source: ModelObservation): string {
  if (source.name.includes(':')) {
    return source.name.split(':')[0]?.trim() ?? source.author
  }
  return source.author
}

/**
 * Map revalidated hoisted model + providers → full V2 model.
 * Variant is already healed into slug / permaslug / short_name by prep.
 * V2 `name` is `short_name` (not the full "Author: Model" `name`).
 * Keys are declared alphabetically, with `providers` in place (not spread-appended).
 */
export function toModel(source: ModelObservation, providers: ReadonlyArray<V2Provider>): V2Model {
  return {
    author_name: authorName(source),
    created_at: toIsoZ(source.created_at),
    id: source.slug,
    // * Match snapshot materialize: alphabetize string arrays.
    input_modalities: source.input_modalities.toSorted(),
    name: source.short_name,
    output_modalities: source.output_modalities.toSorted(),
    providers: [...providers],
    reasoning: source.supports_reasoning,
    variant: source.variant,
    version_id: source.permaslug,
  }
}
