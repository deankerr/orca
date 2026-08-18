// * Normalized ModelEndpoints → V2 wire shapes.
// * Object key order is alphabetical (sort-keys) so JSON matches Convex's
// * query-return alphabetization without a runtime reorder pass.

import type { ModelEndpoints } from '@orca/inventory'
import * as DateTime from 'effect/DateTime'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import type { Model as V2Model, Provider as V2Provider } from './schema.ts'

/** OR prices arrive as string or number; zero means “not set” for V2. */
const OptionalPrice = Schema.optional(Schema.Union([Schema.Finite, Schema.FiniteFromString]))

// These schemas are private product requirements. The shared inventory schemas deliberately
// accept a wider set of useful upstream data than the legacy V2 response can represent.
const ModelInput = Schema.Struct({
  author: Schema.String,
  created_at: Schema.String,
  input_modalities: Schema.Array(Schema.String),
  name: Schema.String,
  output_modalities: Schema.Array(Schema.String),
  permaslug: Schema.String,
  short_name: Schema.String,
  slug: Schema.String,
  supports_reasoning: Schema.Boolean,
  variant: Schema.String,
})

const EndpointInput = Schema.Struct({
  context_length: Schema.Finite,
  data_policy: Schema.Struct({
    canPublish: Schema.optional(Schema.Boolean),
    requiresUserIDs: Schema.optional(Schema.Boolean),
    retainsPrompts: Schema.optional(Schema.Boolean),
    retentionDays: Schema.optional(Schema.Finite),
    training: Schema.optional(Schema.Boolean),
  }),
  features: Schema.Struct({
    supports_implicit_caching: Schema.optional(Schema.NullOr(Schema.Boolean)),
    supports_native_web_search: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,
  limit_rpd: Schema.NullOr(Schema.Finite),
  limit_rpm: Schema.NullOr(Schema.Finite),
  max_completion_tokens: Schema.NullOr(Schema.Finite),
  max_prompt_images: Schema.optional(Schema.NullOr(Schema.Finite)),
  max_prompt_tokens: Schema.NullOr(Schema.Finite),
  max_tokens_per_image: Schema.NullOr(Schema.Finite),
  moderation_required: Schema.Boolean,
  pricing: Schema.Struct({
    audio: OptionalPrice,
    completion: OptionalPrice,
    image: OptionalPrice,
    image_output: OptionalPrice,
    input_audio_cache: OptionalPrice,
    input_cache_read: OptionalPrice,
    input_cache_write: OptionalPrice,
    internal_reasoning: OptionalPrice,
    prompt: OptionalPrice,
    request: OptionalPrice,
  }),
  provider_display_name: Schema.String,
  provider_region: Schema.NullOr(Schema.String),
  provider_slug: Schema.String,
  quantization: Schema.optional(Schema.NullOr(Schema.String)),
  stats: Schema.optionalKey(
    Schema.Struct({
      p50_latency: Schema.Finite,
      p50_throughput: Schema.Finite,
    }),
  ),
  supported_parameters: Schema.Array(Schema.String),
})

type ModelInput = typeof ModelInput.Type
type EndpointInput = typeof EndpointInput.Type

const decodeModel = Schema.decodeUnknownOption(ModelInput)
const decodeEndpoint = Schema.decodeUnknownOption(EndpointInput)

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

/** Structural map: validated endpoint → V2 provider. Does not check `is_disabled`. */
function toProvider(source: EndpointInput): V2Provider {
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
function authorName(source: ModelInput): string {
  if (source.name.includes(':')) {
    return source.name.split(':')[0]?.trim() ?? source.author
  }
  return source.author
}

/**
 * Map a validated normalized model and its providers to a full V2 model.
 * OpenRouterClient has already healed the variant into slug, permaslug, and short_name.
 * V2 `name` is `short_name` (not the full "Author: Model" `name`).
 * Keys are declared alphabetically, with `providers` in place (not spread-appended).
 */
function toModel(source: ModelInput, providers: ReadonlyArray<V2Provider>): V2Model {
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

/** Project one normalized ModelEndpoints, soft-skipping fields V2 cannot safely represent. */
export function projectModelEndpoints(source: ModelEndpoints): Option.Option<V2Model> {
  const model = decodeModel(source.model)
  if (Option.isNone(model)) {
    return Option.none()
  }

  const providers: V2Provider[] = []
  for (const row of source.endpoints) {
    const endpoint = decodeEndpoint(row)
    if (Option.isSome(endpoint) && !endpoint.value.is_disabled) {
      providers.push(toProvider(endpoint.value))
    }
  }

  return providers.length === 0 ? Option.none() : Option.some(toModel(model.value, providers))
}
