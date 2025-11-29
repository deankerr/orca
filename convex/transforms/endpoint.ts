/**
 * Endpoint Transform Layer
 *
 * Defines the canonical output shape for endpoint data (called "provider" in the public API)
 * using Zod schemas with transform functions.
 *
 * The schema does three things:
 * 1. INPUT SCHEMA: Validates input from database (via convexToZod)
 * 2. OUTPUT SCHEMA: Declares the shape of API responses (for docs/OpenAPI)
 * 3. TRANSFORM: Converts from database shape to output shape
 */

import { convexToZod } from 'convex-helpers/server/zod4'
import { z } from 'zod'

import { db } from '../db'

// * Input Schema from database table
export const EndpointInputSchema = convexToZod(db.or.views.endpoints.table.validator)
export type EndpointInput = z.infer<typeof EndpointInputSchema>

// * Helpers

export function formatPrice(price: number | undefined): string | null {
  if (!price) return null
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
  })
}

// * Output Schema: Data Policy

const DataPolicyOutputSchema = z.object({
  may_publish_data: z.boolean(),
  may_retain_data: z.boolean(),
  data_retention_days: z.number().nullable(),
  may_train_on_data: z.boolean(),
  shares_user_id: z.boolean(),
})

export type DataPolicyOutput = z.infer<typeof DataPolicyOutputSchema>

// * Output Schema: Pricing Tier

const PricingTierOutputSchema = z.object({
  tokens: z.number(),
  text_input: z.string().nullable(),
  text_output: z.string().nullable(),
  text_cache_read: z.string().nullable(),
  text_cache_write: z.string().nullable(),
})

export type PricingTierOutput = z.infer<typeof PricingTierOutputSchema>

// * Output Schema: Pricing

const PricingOutputSchema = z.object({
  text_input: z.string().nullable(),
  text_output: z.string().nullable(),
  image_input: z.string().nullable(),
  image_output: z.string().nullable(),
  audio_input: z.string().nullable(),
  audio_cache_write: z.string().nullable(),
  text_cache_read: z.string().nullable(),
  text_cache_write: z.string().nullable(),
  reasoning_output: z.string().nullable(),
  per_request: z.string().nullable(),
  tiers: z.array(PricingTierOutputSchema).nullable(),
})

export type PricingOutput = z.infer<typeof PricingOutputSchema>

// * Output Schema: Limits

const LimitsOutputSchema = z.object({
  text_input_tokens: z.number().nullable(),
  text_output_tokens: z.number().nullable(),
  image_input_tokens: z.number().nullable(),
  images_per_input: z.number().nullable(),
  requests_per_minute: z.number().nullable(),
  requests_per_day: z.number().nullable(),
})

export type LimitsOutput = z.infer<typeof LimitsOutputSchema>

// * Output Schema: Endpoint (Provider in API terms)

export const EndpointOutputSchema = z.object({
  provider_id: z.string(),
  provider_name: z.string(),
  provider_region: z.string().nullable(),
  context_length: z.number(),
  pricing: PricingOutputSchema,
  supported_parameters: z.array(z.string()),
  quantization: z.string(),
  data_policy: DataPolicyOutputSchema,
  limits: LimitsOutputSchema,
  completions: z.boolean(),
  chat_completions: z.boolean(),
  deranked: z.boolean(),
  implicit_caching: z.boolean(),
  moderated: z.boolean(),
  native_web_search: z.boolean(),
})

export type OrcaEndpoint = z.infer<typeof EndpointOutputSchema>

// * Transform function

export function transformEndpoint(input: EndpointInput): OrcaEndpoint {
  const variablePricingTiers =
    input.variable_pricings?.map((tier) => ({
      tokens: tier.threshold,
      text_input: formatPrice(tier.text_input),
      text_output: formatPrice(tier.text_output),
      text_cache_read: formatPrice(tier.cache_read),
      text_cache_write: formatPrice(tier.cache_write),
    })) ?? []

  const pricing: PricingOutput = {
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
    tiers: variablePricingTiers.length > 0 ? variablePricingTiers : null,
  }

  const dataPolicy: DataPolicyOutput = {
    may_publish_data: input.data_policy.can_publish ?? false,
    may_retain_data: input.data_policy.retains_prompts ?? false,
    data_retention_days: input.data_policy.retains_prompts_days ?? null,
    may_train_on_data: input.data_policy.training ?? false,
    shares_user_id: input.data_policy.requires_user_ids ?? false,
  }

  const limits: LimitsOutput = {
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
  }
}

// * Zod schema with transform (input → output)

export const EndpointTransformSchema = EndpointInputSchema.transform(transformEndpoint)
