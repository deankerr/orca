import { z } from 'zod'

import { date } from './fields'
import { Pricing, selectPricing } from './pricing'
import { Endpoint, Model, Provider } from './scan/entities'

const ModelFacts = Model.extend({ short_name: z.string(), created_at: date })
const ProviderFacts = Provider.extend({ displayName: z.string() })
const EndpointFacts = Endpoint.extend({ provider_display_name: z.string(), pricing: Pricing })

/** Entity-owned facts shared by Catalog and Events, before storage encoding or related context. */
export function selectModel(model: Model) {
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

export function selectProvider(provider: Provider) {
  const { provider_id, displayName, ...metadata } = ProviderFacts.parse(provider)
  return { provider_id, display_name: displayName, metadata }
}

export function selectEndpoint(endpoint: Endpoint) {
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
