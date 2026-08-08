// oxlint-disable sort-keys -- fields are grouped by what they are, not alphabetised

// * product → orca-legacy projection (decode-only).
// *
// * We validate and throw away what we do not need; we never re-encode back to product.
// * Effect Schema is bi-directional by construction, so encode is marked `forbidden` unless a
// * reverse mapping is free (e.g. pure `encodeKeys` renames). Nested cards (pricing, data policy)
// * are transformed as their own schemas and composed into the endpoint source; a final one-way
// * structural transform nests model/provider/limits and renames the remaining flat fields.
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as SchemaTransformation from 'effect/SchemaTransformation'

import * as Legacy from './orca-legacy.ts'
import * as Product from './product.ts'

// * ── helpers ───────────────────────────────────────────────────────────────────────────────

/** Decode-only transform: encode is intentionally unsupported. */
const decodeOnly = <T, E>(decode: (input: E) => T) =>
  SchemaTransformation.make<T, E>({
    decode: SchemaGetter.transform(decode),
    encode: SchemaGetter.forbidden<E, T>(
      () => 'encode is not supported (product → legacy is decode-only)',
    ),
  })

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined
}

// * ── pricing ───────────────────────────────────────────────────────────────────────────────
// * Product keeps decimal strings; legacy wants numbers. Zero / non-finite → absent (legacy
// * materializer convention). Keys renamed via encodeKeys (reverse rename is free).

const priceFromString = Schema.optional(Schema.String).pipe(
  Schema.decodeTo(
    Schema.optional(Schema.Number),
    decodeOnly((value: string | undefined): number | undefined => {
      if (value === undefined || value === '') {
        return undefined
      }
      const n = Number(value)
      if (!Number.isFinite(n) || n === 0) {
        return undefined
      }
      return n
    }),
  ),
)

// * Type = legacy names; Encoded = product names.
export const PricingFromProduct = Schema.Struct({
  text_input: priceFromString,
  text_output: priceFromString,
  text_cache_read: priceFromString,
  text_cache_write: priceFromString,
  audio_input: priceFromString,
  audio_cache_write: priceFromString,
  image_input: priceFromString,
  image_output: priceFromString,
  web_search: priceFromString,
  discount: Schema.optional(Schema.Number),
}).pipe(
  Schema.encodeKeys({
    text_input: 'prompt',
    text_output: 'completion',
    text_cache_read: 'input_cache_read',
    text_cache_write: 'input_cache_write',
    audio_input: 'audio',
    audio_cache_write: 'input_audio_cache',
    image_input: 'image',
  }),
)
export type PricingFromProduct = Schema.Schema.Type<typeof PricingFromProduct>

// * ── data policy ───────────────────────────────────────────────────────────────────────────
// * Pure key renames only — encodeKeys reverse is free and correct.

export const DataPolicyFromProduct = Schema.Struct({
  may_train_on_data: Schema.optional(Schema.Boolean),
  may_publish_data: Schema.optional(Schema.Boolean),
  shares_user_id: Schema.optional(Schema.Boolean),
  may_retain_data: Schema.optional(Schema.Boolean),
  data_retention_days: Schema.optional(Schema.Number),
}).pipe(
  Schema.encodeKeys({
    may_train_on_data: 'training',
    may_publish_data: 'canPublish',
    shares_user_id: 'requiresUserIDs',
    may_retain_data: 'retainsPrompts',
    data_retention_days: 'retentionDays',
  }),
)
export type DataPolicyFromProduct = Schema.Schema.Type<typeof DataPolicyFromProduct>

// * ── endpoint source ───────────────────────────────────────────────────────────────────────
// * Product.Endpoint is flat and lacks model display fields / catalog clocks. Nested cards are
// * already the FromProduct schemas so decode of the source runs pricing + data-policy first.

export const EndpointSource = Schema.Struct({
  ...Product.Endpoint.fields,
  // * override product cards with composed transforms (Encoded still product-shaped)
  pricing: PricingFromProduct,
  data_policy: DataPolicyFromProduct,
  // * join: model entity for this variant
  model: Product.Model,
  // * join: catalog availability clock
  updated_at: Schema.Number,
  unavailable_at: Schema.optional(Schema.Number),
})
export type EndpointSource = Schema.Schema.Type<typeof EndpointSource>

// * ── structural projection ─────────────────────────────────────────────────────────────────

function displayModelName(model: Product.Model, variant: string): string {
  if (variant === 'beta') {
    return `${model.name} (self-moderated)`
  }
  if (variant === 'standard') {
    return model.short_name
  }
  return `${model.short_name} (${variant})`
}

function authorName(model: Product.Model): string {
  const [prefix] = model.name.split(':')
  return model.name.includes(':') && prefix !== undefined ? prefix.trim() : model.author
}

function toLegacyEndpoint(source: EndpointSource): Legacy.Endpoint {
  const { model } = source
  const maxCompletion = nullToUndefined(source.max_completion_tokens)

  return {
    uuid: source.id,

    model: {
      slug: source.model_variant_slug,
      version_slug: source.model_variant_permaslug,
      variant: source.variant,
      name: displayModelName(model, source.variant),
      author_slug: model.author,
      author_name: authorName(model),
      or_added_at: Date.parse(model.created_at),
      input_modalities: model.input_modalities,
      output_modalities: model.output_modalities,
      reasoning: source.supports_reasoning,
    },

    provider: {
      slug: source.provider_slug.split('/')[0] ?? source.provider_slug,
      tag_slug: source.provider_slug,
      name: source.provider_display_name,
      model_id: source.provider_model_id,
      region: nullToUndefined(source.provider_region),
    },

    // * already projected by nested schemas
    data_policy: source.data_policy,
    pricing: source.pricing,

    limits: {
      text_input_tokens: nullToUndefined(source.max_prompt_tokens),
      image_input_tokens: nullToUndefined(source.max_tokens_per_image),
      images_per_input: nullToUndefined(source.max_prompt_images),
      requests_per_minute: nullToUndefined(source.limit_rpm),
      requests_per_day: nullToUndefined(source.limit_rpd),
    },

    max_output: maxCompletion ?? source.context_length,

    context_length: source.context_length,
    quantization: nullToUndefined(source.quantization),
    supported_parameters: source.supported_parameters,

    completions: source.has_completions,
    chat_completions: source.has_chat_completions,
    implicit_caching: source.supports_implicit_caching,
    native_web_search: source.supports_native_web_search,

    moderated: source.moderation_required,
    deranked: source.is_deranked,
    disabled: source.is_disabled,

    stats: source.stats,

    unavailable_at: source.unavailable_at,
    updated_at: source.updated_at,
  }
}

// * Compose: decode source (incl. nested cards) → structural map → validate as Legacy.Endpoint.
export const EndpointFromProduct = EndpointSource.pipe(
  Schema.decodeTo(Legacy.Endpoint, decodeOnly(toLegacyEndpoint)),
)
export type EndpointFromProduct = Schema.Schema.Type<typeof EndpointFromProduct>
