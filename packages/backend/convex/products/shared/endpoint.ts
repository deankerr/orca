import { convexToZod } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { z } from 'zod'

import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../../catalogNew/tables/current'
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
      prompt: price,
      completion: price,
      input_cache_read: price,
      input_cache_write: price,
      audio: price,
      input_audio_cache: price,
      image: price,
      image_output: price,
      web_search: price,
    }),
  })
  .transform(({ meters }) => ({
    text_input: meters.prompt,
    text_output: meters.completion,
    cache_read: meters.input_cache_read,
    cache_write: meters.input_cache_write,
    audio_input: meters.audio,
    audio_cache_read: meters.input_audio_cache,
    image_input: meters.image,
    image_output: meters.image_output,
    web_search: meters.web_search,
  }))

const EndpointMetadata = z
  .object({
    context_length: quantity,
    max_completion_tokens: quantity,
    max_prompt_tokens: quantity,
    max_tokens_per_image: quantity,
    max_prompt_images: quantity,
    limit_rpm: quantity,
    limit_rpd: quantity,
    quantization: z.string().nullable().catch(null),
    supported_parameters: stringsOrNull,
    supports_reasoning: flagOrNull,
    has_completions: flagOrNull,
    has_chat_completions: flagOrNull,
    features: z
      .object({
        supports_implicit_caching: flagOrNull,
        supports_native_web_search: flagOrNull,
      })
      .nullable()
      .catch(null),
    moderation_required: flagOrNull,
    is_deranked: flagOrNull,
    is_disabled: flagOrNull,
    data_policy: z
      .object({
        training: flagOrNull,
        canPublish: flagOrNull,
        requiresUserIDs: flagOrNull,
        retainsPrompts: flagOrNull,
        retentionDays: quantity,
      })
      .nullable()
      .catch(null),
  })
  .transform((facts) => ({
    context_length: facts.context_length,
    // Preserve V3's context-length fallback until output-limit semantics change.
    max_output: facts.max_completion_tokens ?? facts.context_length,
    quantization: facts.quantization,
    supported_parameters: facts.supported_parameters,
    reasoning: facts.supports_reasoning,
    completions: facts.has_completions,
    chat_completions: facts.has_chat_completions,
    implicit_caching: facts.features?.supports_implicit_caching ?? null,
    native_web_search: facts.features?.supports_native_web_search ?? null,
    moderated: facts.moderation_required,
    deranked: facts.is_deranked,
    disabled: facts.is_disabled,
    data_policy: {
      may_train_on_data: facts.data_policy?.training ?? null,
      may_publish_data: facts.data_policy?.canPublish ?? null,
      shares_user_id: facts.data_policy?.requiresUserIDs ?? null,
      may_retain_data: facts.data_policy?.retainsPrompts ?? null,
      data_retention_days: facts.data_policy?.retentionDays ?? null,
    },
    limits: {
      text_input_tokens: facts.max_prompt_tokens,
      image_input_tokens: facts.max_tokens_per_image,
      images_per_input: facts.max_prompt_images,
      requests_per_minute: facts.limit_rpm,
      requests_per_day: facts.limit_rpd,
    },
  }))

/** Endpoint product fields from typed Catalog values and endpoint-owned nested metadata. */
export const Endpoint = convexToZod(docValidator(CURRENT_ENDPOINTS_TABLE, currentEndpointsTable))
  .extend({
    model_or_created_at: isoDate,
    pricing: EndpointPricing,
    metadata_json: JsonObjectFromString.pipe(EndpointMetadata),
  })
  .transform(({ metadata_json: facts, ...identity }) => ({ ...identity, ...facts }))
