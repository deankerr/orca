import { z } from 'zod'

import { ExtractedEndpoint } from '#scans/extraction'
import type { ExtractedModel, ExtractedProvider } from '#scans/extraction'

import type { Endpoint, Model, Provider } from '../catalog/entities'
import type { Pricing } from '../catalog/pricing'

const EndpointInput = ExtractedEndpoint.extend({ provider_display_name: z.string() })

/** Shared entity fields and unfiltered metadata; each consumer owns its retention policy. */
export function modelEntity(model: ExtractedModel): z.infer<typeof Model> {
  const {
    id,
    slug,
    permaslug,
    variant,
    short_name,
    created_at,
    input_modalities,
    output_modalities,
    ...metadata
  } = model

  return {
    model_id: id,
    slug,
    permaslug,
    variant,
    display_name: short_name,
    or_created_at: created_at,
    input_modalities,
    output_modalities,
    metadata,
  }
}

export function providerEntity(provider: ExtractedProvider): z.infer<typeof Provider> {
  const { provider_id, displayName, ...metadata } = provider
  return { provider_id, display_name: displayName, metadata }
}

export function endpointEntity(endpoint: ExtractedEndpoint): z.infer<typeof Endpoint> {
  const {
    id,
    model_id,
    provider_id,
    provider_tag,
    variant,
    provider_display_name,
    pricing,
    model_display_name,
    model_permaslug,
    model_or_created_at,
    input_modalities,
    output_modalities,
    ...metadata
  } = EndpointInput.parse(endpoint)

  return {
    endpoint_id: id,
    model_id,
    provider_id,
    provider_tag,
    variant,
    provider_display_name,
    pricing: endpointPricing(pricing),
    model_display_name,
    model_permaslug,
    model_or_created_at,
    input_modalities,
    output_modalities,
    metadata,
  }
}

const PricingInput = z
  .object({
    discount: z.number(),
    overrides: z.array(z.record(z.string(), z.json())).optional(),
  })
  .catchall(z.json())

/** Complete observed quote shared by current endpoints, pricing history, and Events. */
export function endpointPricing(value: ExtractedEndpoint['pricing']): z.infer<typeof Pricing> {
  const { discount, overrides, display_pricing: _display, ...source } = PricingInput.parse(value)
  const meters = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )

  return overrides === undefined ? { discount, meters } : { discount, meters, overrides }
}
