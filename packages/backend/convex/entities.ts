import { v } from 'convex/values'
import { z } from 'zod'

import { ScannedEndpoint, ScannedModel, ScannedProvider } from '#scan/model'

import { isoDate } from './fields'
import { canonicalJson, JsonObject } from './json'

/** ORCA model fields shared by Catalog and Events; remaining source fields belong to metadata. */
export const Model = z.object({
  model_id: z.string(),
  slug: z.string(),
  permaslug: z.string(),
  variant: z.string(),
  display_name: z.string(),
  or_created_at: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  metadata: JsonObject,
})

/** ORCA provider fields, independent of endpoint-specific provider labels. */
export const Provider = z.object({
  provider_id: z.string(),
  display_name: z.string(),
  metadata: JsonObject,
})

/** Normalized prices shared by Catalog, History and Events before storage encoding. */
export const Pricing = z.object({
  discount: z.number(),
  meters: z.record(z.string(), z.string()),
  overrides: z.array(z.record(z.string(), z.json())).optional(),
})

/** ORCA endpoint fields and normalized pricing; stats are handled separately. */
export const Endpoint = z.object({
  endpoint_id: z.string(),
  model_id: z.string(),
  provider_id: z.string(),
  provider_tag: z.string(),
  variant: z.string(),
  provider_display_name: z.string(),
  pricing: Pricing,
  metadata: JsonObject,
})

/** Storage encoding shared by Catalog and price history. */
export const pricing = v.object({
  discount: v.number(),
  meters: v.record(v.string(), v.string()),
  overrides_json: v.optional(v.string()),
})

/** Source fields required to normalize prices; other JSON fields may contain decimal meters. */
const PricingInput = z
  .object({
    discount: z.number(),
    overrides: z.array(z.record(z.string(), z.json())).optional(),
  })
  .catchall(z.json())

const ModelInput = ScannedModel.extend({ short_name: z.string(), created_at: isoDate })
const ProviderInput = ScannedProvider.extend({ displayName: z.string() })
const EndpointInput = ScannedEndpoint.extend({
  provider_display_name: z.string(),
  pricing: z.json().transform(normalizePricing),
})

/** Normalize a model before storage encoding or enrichment with related entities. */
export function normalizeModel(model: ScannedModel): z.infer<typeof Model> {
  const {
    id,
    variant,
    slug,
    permaslug,
    input_modalities,
    output_modalities,
    short_name,
    created_at,
    ...metadata
  } = ModelInput.parse(model)

  return {
    model_id: id,
    slug,
    permaslug,
    variant,
    display_name: short_name,
    or_created_at: created_at,
    input_modalities: input_modalities.toSorted(),
    output_modalities: output_modalities.toSorted(),
    metadata,
  }
}

export function normalizeProvider(provider: ScannedProvider): z.infer<typeof Provider> {
  const { provider_id, displayName, ...metadata } = ProviderInput.parse(provider)
  return { provider_id, display_name: displayName, metadata }
}

export function normalizeEndpoint(endpoint: ScannedEndpoint): z.infer<typeof Endpoint> {
  const {
    id,
    variant,
    provider_tag,
    model_id,
    provider_id,
    stats: _stats,
    statsByTier: _statsByTier,
    provider_display_name,
    pricing,
    ...metadata
  } = EndpointInput.parse(endpoint)

  return {
    endpoint_id: id,
    model_id,
    provider_id,
    provider_tag,
    variant,
    provider_display_name,
    pricing,
    metadata,
  }
}

/** Select decimal meters and preserve complete overrides; discount is already reflected in rates. */
export function normalizePricing(value: ScannedEndpoint['pricing']): z.infer<typeof Pricing> {
  const { discount, overrides, display_pricing: _display, ...source } = PricingInput.parse(value)

  const meters = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  return overrides === undefined ? { discount, meters } : { discount, meters, overrides }
}

/** Encode arbitrary override keys only when crossing into storage. */
export function encodePricing(value: ReturnType<typeof normalizePricing>) {
  const { overrides, ...fields } = value
  return overrides === undefined ? fields : { ...fields, overrides_json: canonicalJson(overrides) }
}
