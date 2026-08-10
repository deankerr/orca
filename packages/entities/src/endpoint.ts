// oxlint-disable sort-keys

// * Product endpoint transitions: observation → product card → field-level changeset.
// *
// * Pure. No Cloudflare, Convex, or storage. One observation schema validates the OpenRouter
// * row; `toEndpoint` is the only structural map to the product card. Encode/reversibility is
// * not a goal — most of the observation is discarded.
// *
// * `stats` is ignored for product-equality. Empty `changes` means unchanged — callers may treat
// * `changes.length > 0` as the boolean.
// *

import * as Schema from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'
import { diff } from 'json-diff-ts'
import type { IChange, Options as DiffOptions } from 'json-diff-ts'

export type { IChange } from 'json-diff-ts'

/** ISO-8601 timestamp string → epoch millis. */
const MillisFromIso = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (s: string) => Date.parse(s),
      encode: (n: number) => new Date(n).toISOString(),
    }),
  ),
)

const EmbeddedModel = Schema.Struct({
  slug: Schema.String,
  version_slug: Schema.String,

  name: Schema.String,

  author_slug: Schema.String,
  author_name: Schema.String,

  or_added_at: MillisFromIso,

  input_modalities: Schema.Array(Schema.String),
  output_modalities: Schema.Array(Schema.String),

  reasoning: Schema.Boolean,
}).pipe(
  Schema.encodeKeys({
    version_slug: 'permaslug',
    author_slug: 'author',
    author_name: 'author_display_name',
    or_added_at: 'created_at',
    reasoning: 'supports_reasoning',
  }),
)

// * ── observation (OpenRouter endpoint row) ─────────────────────────────────────────────────
// * Only `stats` is optional. Everything else is a required key; use NullOr where OR sends null.

const EndpointObservation = Schema.Struct({
  id: Schema.String,

  model: EmbeddedModel,

  model_variant_slug: Schema.String,
  model_variant_permaslug: Schema.String,
  variant: Schema.String,

  provider_display_name: Schema.String,
  provider_slug: Schema.String,
  provider_model_id: Schema.String,
  provider_region: Schema.NullOr(Schema.String),

  context_length: Schema.Number,
  max_prompt_tokens: Schema.NullOr(Schema.Number),
  max_completion_tokens: Schema.NullOr(Schema.Number),
  max_tokens_per_image: Schema.NullOr(Schema.Number),
  limit_rpm: Schema.NullOr(Schema.Number),
  limit_rpd: Schema.NullOr(Schema.Number),

  quantization: Schema.String,
  supported_parameters: Schema.Array(Schema.String),

  // * nested objects are required; individual price / policy keys are sparse upstream
  pricing: Schema.Struct({
    prompt: Schema.optional(Schema.FiniteFromString),
    completion: Schema.optional(Schema.FiniteFromString),
    input_cache_read: Schema.optional(Schema.FiniteFromString),
    input_cache_write: Schema.optional(Schema.FiniteFromString),
    audio: Schema.optional(Schema.FiniteFromString),
    input_audio_cache: Schema.optional(Schema.FiniteFromString),
    image: Schema.optional(Schema.FiniteFromString),
    image_output: Schema.optional(Schema.FiniteFromString),
    web_search: Schema.optional(Schema.FiniteFromString),
    discount: Schema.optional(Schema.Number),
  }),

  data_policy: Schema.Struct({
    training: Schema.optional(Schema.Boolean),
    canPublish: Schema.optional(Schema.Boolean),
    requiresUserIDs: Schema.optional(Schema.Boolean),
    retainsPrompts: Schema.optional(Schema.Boolean),
    retentionDays: Schema.optional(Schema.Number),
  }),

  features: Schema.Struct({
    supports_implicit_caching: Schema.optional(Schema.NullOr(Schema.Boolean)),
    supports_native_web_search: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),

  supports_reasoning: Schema.Boolean,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,

  moderation_required: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,

  stats: Schema.optionalKey(
    Schema.Struct({
      p50_throughput: Schema.Number,
      p50_latency: Schema.Number,
    }),
  ),
})

const decodeObservation = Schema.decodeUnknownSync(EndpointObservation)

// * ── product card (structural map only) ────────────────────────────────────────────────────

function displayModelName(shortName: string, variant: string): string {
  if (variant === 'standard') {
    return shortName
  }
  return `${shortName} (${variant})`
}

/** OpenRouter observation → product endpoint card. */
export function toEndpoint(source: Schema.Schema.Type<typeof EndpointObservation>) {
  const provider = {
    slug: source.provider_slug.split('/')[0] ?? source.provider_slug,
    tag_slug: source.provider_slug,
    name: source.provider_display_name,
    model_id: source.provider_model_id,
    ...(source.provider_region === null ? {} : { region: source.provider_region }),
  }

  return {
    uuid: source.id,

    model: {
      slug: source.model_variant_slug,
      version_slug: source.model_variant_permaslug,
      variant: source.variant,
      name: displayModelName(source.model.name, source.variant),
      author_slug: source.model.author_slug,
      author_name: source.model.author_name,
      or_added_at: source.model.or_added_at,
      input_modalities: source.model.input_modalities,
      output_modalities: source.model.output_modalities,
      reasoning: source.supports_reasoning,
    },

    provider,

    data_policy: {
      may_train_on_data: source.data_policy.training,
      may_publish_data: source.data_policy.canPublish,
      shares_user_id: source.data_policy.requiresUserIDs,
      may_retain_data: source.data_policy.retainsPrompts,
      data_retention_days: source.data_policy.retentionDays,
    },

    pricing: {
      text_input: source.pricing.prompt,
      text_output: source.pricing.completion,
      text_cache_read: source.pricing.input_cache_read,
      text_cache_write: source.pricing.input_cache_write,
      audio_input: source.pricing.audio,
      audio_cache_write: source.pricing.input_audio_cache,
      image_input: source.pricing.image,
      image_output: source.pricing.image_output,
      web_search: source.pricing.web_search,
      discount: source.pricing.discount,
    },

    // * Omit nulls — product optionals mean key absent (same idea as provider.region).
    limits: {
      ...(source.max_prompt_tokens === null ? {} : { text_input_tokens: source.max_prompt_tokens }),
      ...(source.max_tokens_per_image === null
        ? {}
        : { image_input_tokens: source.max_tokens_per_image }),
      ...(source.limit_rpm === null ? {} : { requests_per_minute: source.limit_rpm }),
      ...(source.limit_rpd === null ? {} : { requests_per_day: source.limit_rpd }),
    },

    max_output: source.max_completion_tokens ?? source.context_length,

    context_length: source.context_length,
    quantization: source.quantization,
    supported_parameters: source.supported_parameters,

    completions: source.has_completions,
    chat_completions: source.has_chat_completions,
    implicit_caching: source.features.supports_implicit_caching ?? false,
    native_web_search: source.features.supports_native_web_search ?? false,

    moderated: source.moderation_required,
    deranked: source.is_deranked,
    disabled: source.is_disabled,

    stats: source.stats,
  }
}

export type Endpoint = ReturnType<typeof toEndpoint>

/** Decode an OpenRouter endpoint observation into a product card. */
export const decodeEndpoint = (input: unknown): Endpoint => toEndpoint(decodeObservation(input))

// * ── compare ───────────────────────────────────────────────────────────────────────────────

/** Result of comparing two observations of one endpoint as product cards. */
export interface EndpointTransition {
  after: Endpoint
  /**
   * Product-relevant field changes from before → after (`json-diff-ts`).
   * Empty when equal under our ignore policy.
   */
  changes: IChange[]
}

/**
 * Diff options for product endpoints. `stats` is telemetry, not product state.
 * `supported_parameters` compared as a value set (order-insensitive membership).
 */
const ENDPOINT_DIFF_OPTIONS: DiffOptions = {
  embeddedObjKeys: {
    supported_parameters: '$value',
  },
  keysToSkip: ['stats'],
  treatTypeChangeAsReplace: false,
}

/**
 * Decode both sides from observation-shaped objects to product cards, then diff.
 *
 * @param before - Previous endpoint observation (OpenRouter-shaped)
 * @param after - Latest endpoint observation (OpenRouter-shaped)
 * @throws {Error} when either side fails observation decode
 */
export const compareEndpoint = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): EndpointTransition => {
  const beforeProduct = decodeEndpoint(before)
  const afterProduct = decodeEndpoint(after)
  return {
    after: afterProduct,
    changes: diff(beforeProduct, afterProduct, ENDPOINT_DIFF_OPTIONS),
  }
}

/** True when the transition carries any product-relevant change. */
export const endpointChanged = (transition: EndpointTransition): boolean =>
  transition.changes.length > 0
