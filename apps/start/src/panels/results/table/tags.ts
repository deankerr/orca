import type { Endpoint } from '@orca/contract/endpoint'

/** Quantization when known, shown upper-case as `FP8`, then the service tier as `flex`. */
export function providerTags({
  quantization,
  service_tier: serviceTier,
}: Pick<Endpoint, 'quantization' | 'service_tier'>): string[] {
  const tags: string[] = []
  const precision = quantization?.trim()

  if (precision !== undefined && precision !== '' && precision.toLowerCase() !== 'unknown') {
    tags.push(precision.toUpperCase())
  }

  const tier = serviceTier?.trim()

  if (tier !== undefined && tier !== '') {
    tags.push(tier)
  }

  return tags
}
