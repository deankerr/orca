import { z } from 'zod'

import { date } from './fields'
import { Pricing, PricingSnapshot, selectPricing } from './pricing'
import { Endpoint, Model, Provider } from './scan/entities'

const ModelFacts = Model.extend({ short_name: z.string(), created_at: date })
const ProviderFacts = Provider.extend({ displayName: z.string() })
const EndpointFacts = Endpoint.extend({ provider_display_name: z.string(), pricing: Pricing })

const Metadata = z.record(z.string(), z.json())

/** Producer-owned structure; external metadata remains arbitrary JSON. */
export const ModelSnapshot = z.object({
  model_id: ModelFacts.shape.id,
  slug: ModelFacts.shape.slug,
  permaslug: ModelFacts.shape.permaslug,
  variant: ModelFacts.shape.variant,
  display_name: ModelFacts.shape.short_name,
  or_created_at: z.string(),
  input_modalities: ModelFacts.shape.input_modalities,
  output_modalities: ModelFacts.shape.output_modalities,
  metadata: Metadata,
})

export const ProviderSnapshot = z.object({
  provider_id: ProviderFacts.shape.provider_id,
  display_name: ProviderFacts.shape.displayName,
  metadata: Metadata,
})

export const EndpointSnapshot = z.object({
  endpoint_id: EndpointFacts.shape.id,
  model_id: EndpointFacts.shape.model_id,
  provider_id: EndpointFacts.shape.provider_id,
  provider_tag: EndpointFacts.shape.provider_tag,
  variant: EndpointFacts.shape.variant,
  provider_display_name: EndpointFacts.shape.provider_display_name,
  pricing: PricingSnapshot,
  metadata: Metadata,
})

/** Entity-owned facts shared by Catalog and Events, before storage encoding or related context. */
export function selectModel(model: Model): z.infer<typeof ModelSnapshot> {
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
  } = ModelFacts.parse(model)

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

export function selectProvider(provider: Provider): z.infer<typeof ProviderSnapshot> {
  const { provider_id, displayName, ...metadata } = ProviderFacts.parse(provider)
  return { provider_id, display_name: displayName, metadata }
}

export function selectEndpoint(endpoint: Endpoint): z.infer<typeof EndpointSnapshot> {
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
  } = EndpointFacts.parse(endpoint)

  return {
    endpoint_id: id,
    model_id,
    provider_id,
    provider_tag,
    variant,
    provider_display_name,
    pricing: selectPricing(pricing),
    metadata,
  }
}
