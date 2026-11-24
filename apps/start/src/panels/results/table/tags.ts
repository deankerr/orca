import { propertyHint } from '#endpoints/property-hint'
import type { EndpointRow } from '#endpoints/snapshot'

/** A tag beside a provider's name. `hint` is hover text, for a label that does not explain itself. */
export interface ProviderTag {
  id: 'quantization' | 'region' | 'service_tier'
  label: string
  hint?: string
}

/**
 * What tells a provider's endpoints for one model apart: the region when the endpoint reports one,
 * quantization when known, shown upper-case as `FP8`, then the service tier as `flex`.
 */
export function providerTags({
  endpoint: { quantization, service_tier: serviceTier },
  properties,
}: Pick<EndpointRow, 'endpoint' | 'properties'>): ProviderTag[] {
  const tags: ProviderTag[] = []
  const region = properties.get('region')

  if (region !== undefined) {
    tags.push({ hint: propertyHint('region'), id: 'region', label: String(region) })
  }

  const precision = quantization?.trim()

  if (precision !== undefined && precision !== '' && precision.toLowerCase() !== 'unknown') {
    tags.push({ id: 'quantization', label: precision.toUpperCase() })
  }

  const tier = serviceTier?.trim()

  if (tier !== undefined && tier !== '') {
    tags.push({ id: 'service_tier', label: tier })
  }

  return tags
}
