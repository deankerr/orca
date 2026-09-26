import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { query } from '../../../_generated/server'
import { clock } from '../../clock'
import { flag, strings, date, metadata } from '../fields'
import { V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from './table'

const UNLISTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

// Keep V3's product meanings: malformed optional facts are unknown, not invented defaults.
const quantity = z.number().nonnegative().nullable().catch(null)

// V3's grid treats zero prices as absent; stored pricing and history still preserve zero.
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
    supported_parameters: strings,
    supports_reasoning: flag,
    has_completions: flag,
    has_chat_completions: flag,
    features: z
      .object({
        supports_implicit_caching: flag,
        supports_native_web_search: flag,
      })
      .nullable()
      .catch(null),
    moderation_required: flag,
    is_deranked: flag,
    is_disabled: flag,
    data_policy: z
      .object({
        training: flag,
        canPublish: flag,
        requiresUserIDs: flag,
        retainsPrompts: flag,
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
export const Endpoint = convexToZod(docValidator(V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable))
  .extend({
    model_or_created_at: date,
    pricing: EndpointPricing,
    metadata_json: metadata.pipe(EndpointMetadata),
  })
  .transform(({ metadata_json: facts, ...identity }) => ({ ...identity, ...facts }))

/**
 * Listed endpoints plus those unlisted within 30 days of the observation clock.
 * Older last-known rows stay stored and are absent from this window.
 */
export const grid = query({
  args: {},
  returns: v.array(zodOutputToConvex(Endpoint)),
  handler: async (ctx) => {
    const listed = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.eq('unlisted_at', undefined))
      .collect()

    const scanAt = await clock(ctx)
    // Before the clock starts, listed baseline rows need no time window.
    if (scanAt === null) {
      return listed.map((row) => Endpoint.parse(row))
    }
    const cutoff = new Date(Date.parse(scanAt) - UNLISTED_WINDOW_MS).toISOString()
    const unlisted = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.gte('unlisted_at', cutoff))
      .collect()

    return [...listed, ...unlisted].map((row) => Endpoint.parse(row))
  },
})

/** Current or last-known endpoint. */
export const get = query({
  args: { endpoint_id: v.string() },
  returns: v.union(v.null(), zodOutputToConvex(Endpoint)),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', args.endpoint_id))
      .unique()
    return row === null ? null : Endpoint.parse(row)
  },
})

/** Current endpoints for one model. */
export const byModel = query({
  args: { model_id: v.string() },
  returns: v.array(zodOutputToConvex(Endpoint)),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', args.model_id))
      .collect()
    return rows.map((row) => Endpoint.parse(row))
  },
})

/** Current endpoints for one provider and model. */
export const byProviderModel = query({
  args: { provider_id: v.string(), model_id: v.string() },
  returns: v.array(zodOutputToConvex(Endpoint)),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_provider_id_and_model_id', (q) =>
        q.eq('provider_id', args.provider_id).eq('model_id', args.model_id),
      )
      .collect()
    return rows.map((row) => Endpoint.parse(row))
  },
})
