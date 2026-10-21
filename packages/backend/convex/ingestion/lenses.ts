import { pick } from 'convex-helpers'
import * as R from 'remeda'
import { z } from 'zod'

import { ExtractedEndpoint } from '#scans/extraction'
import type { ExtractedModel, ExtractedProvider } from '#scans/extraction'

import type { Endpoint, Model, Provider } from '../catalog/entities'
import type { Pricing } from '../catalog/pricing'

const EndpointInput = ExtractedEndpoint.extend({ provider_display_name: z.string() })

const modelFields = [
  'id',
  'slug',
  'permaslug',
  'variant',
  'short_name',
  'created_at',
  'input_modalities',
  'output_modalities',
] as const

/** Shared entity fields and unfiltered metadata; each consumer owns its retention policy. */
export function modelEntity(model: ExtractedModel): z.infer<typeof Model> {
  const { id, short_name, created_at, ...fields } = pick(model, [...modelFields])

  return {
    ...fields,
    model_id: id,
    display_name: short_name,
    or_created_at: created_at,
    metadata: R.omit(model, modelFields),
  }
}

export function providerEntity(provider: ExtractedProvider): z.infer<typeof Provider> {
  const { provider_id, displayName, ...metadata } = provider
  return { provider_id, display_name: displayName, metadata }
}

const endpointFields = [
  'id',
  'model_id',
  'provider_id',
  'provider_tag',
  'variant',
  'provider_display_name',
  'pricing',
  'model_display_name',
  'model_permaslug',
  'model_or_created_at',
  'input_modalities',
  'output_modalities',
] as const

export function endpointEntity(endpoint: ExtractedEndpoint): z.infer<typeof Endpoint> {
  const source = EndpointInput.parse(endpoint)
  const { id, pricing, ...fields } = pick(source, [...endpointFields])

  return {
    ...fields,
    endpoint_id: id,
    pricing: endpointPricing(pricing),
    metadata: R.omit(source, endpointFields),
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
  const meters = R.pickBy(source, R.isString)

  return overrides === undefined ? { discount, meters } : { discount, meters, overrides }
}
