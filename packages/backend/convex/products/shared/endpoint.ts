import { convexToZod } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { z } from 'zod'

import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../../catalog/tables/current'
import { flagOrNull, stringsOrNull, isoDate } from '../../fields'
import { JsonObjectFromString } from '../../json'

// Malformed optional facts are unknown, not invented defaults.
const quantity = z.number().nonnegative().nullable().catch(null)

// The grid treats zero prices as absent; stored pricing and history still preserve zero.
const price = z
  .string()
  .trim()
  .min(1)
  .pipe(z.coerce.number<string>().positive())
  .optional()
  .catch(undefined)

const EndpointPricing = z
  .object({
    meters: z.object({
      audio: price,
      completion: price,
      image: price,
      image_output: price,
      input_audio_cache: price,
      input_cache_read: price,
      input_cache_write: price,
      prompt: price,
      web_search: price,
    }),
  })
  .transform(({ meters }) => ({
    audio_cache_read: meters.input_audio_cache,
    audio_input: meters.audio,
    cache_read: meters.input_cache_read,
    cache_write: meters.input_cache_write,
    image_input: meters.image,
    image_output: meters.image_output,
    text_input: meters.prompt,
    text_output: meters.completion,
    web_search: meters.web_search,
  }))

const EndpointMetadata = z
  .object({
    context_length: quantity,
    data_policy: z
      .object({
        canPublish: flagOrNull,
        requiresUserIDs: flagOrNull,
        retainsPrompts: flagOrNull,
        retentionDays: quantity,
        training: flagOrNull,
      })
      .nullable()
      .catch(null),
    features: z
      .object({
        supports_implicit_caching: flagOrNull,
        supports_native_web_search: flagOrNull,
      })
      .nullable()
      .catch(null),
    has_chat_completions: flagOrNull,
    has_completions: flagOrNull,
    is_deranked: flagOrNull,
    is_disabled: flagOrNull,
    limit_rpd: quantity,
    limit_rpm: quantity,
    max_completion_tokens: quantity,
    max_prompt_images: quantity,
    max_prompt_tokens: quantity,
    max_tokens_per_image: quantity,
    moderation_required: flagOrNull,
    quantization: z.string().nullable().catch(null),
    supported_parameters: stringsOrNull,
    supports_reasoning: flagOrNull,
  })
  .transform((facts) => ({
    chat_completions: facts.has_chat_completions,
    completions: facts.has_completions,
    context_length: facts.context_length,
    data_policy: {
      data_retention_days: facts.data_policy?.retentionDays ?? null,
      may_publish_data: facts.data_policy?.canPublish ?? null,
      may_retain_data: facts.data_policy?.retainsPrompts ?? null,
      may_train_on_data: facts.data_policy?.training ?? null,
      shares_user_id: facts.data_policy?.requiresUserIDs ?? null,
    },
    deranked: facts.is_deranked,
    disabled: facts.is_disabled,
    implicit_caching: facts.features?.supports_implicit_caching ?? null,
    limits: {
      image_input_tokens: facts.max_tokens_per_image,
      images_per_input: facts.max_prompt_images,
      requests_per_day: facts.limit_rpd,
      requests_per_minute: facts.limit_rpm,
      text_input_tokens: facts.max_prompt_tokens,
    },
    // Preserve V3's context-length fallback until output-limit semantics change.
    max_output: facts.max_completion_tokens ?? facts.context_length,
    moderated: facts.moderation_required,
    native_web_search: facts.features?.supports_native_web_search ?? null,
    quantization: facts.quantization,
    reasoning: facts.supports_reasoning,
    supported_parameters: facts.supported_parameters,
  }))

/** Endpoint product fields from typed Catalog values and endpoint-owned nested metadata. */
export const Endpoint = convexToZod(docValidator(CURRENT_ENDPOINTS_TABLE, currentEndpointsTable))
  .extend({
    metadata_json: JsonObjectFromString.pipe(EndpointMetadata),
    model_or_created_at: isoDate,
    pricing: EndpointPricing,
  })
  .transform(({ metadata_json: facts, ...identity }) => ({ ...identity, ...facts }))
