import { v } from 'convex/values'
import { z } from 'zod'

import { canonicalJson } from './json'
import type { Endpoint } from './scan/entities'

/** Storage encoding shared by Catalog and price history. */
export const pricing = v.object({
  discount: v.number(),
  meters: v.record(v.string(), v.string()),
  overrides_json: v.optional(v.string()),
})

/** Source pricing structure shared by Catalog and price history. */
export const Pricing = z
  .object({
    discount: z.number(),
    overrides: z.array(z.record(z.string(), z.json())).optional(),
  })
  .catchall(z.json())

/** Interpreted pricing carried by entity snapshots, before storage encoding. */
export const PricingSnapshot = z.object({
  discount: Pricing.shape.discount,
  meters: z.record(z.string(), z.string()),
  overrides: Pricing.shape.overrides,
})

/** Select decimal meters and preserve complete overrides; discount is already reflected in rates. */
export function selectPricing(value: Endpoint['pricing']): z.infer<typeof PricingSnapshot> {
  const { discount, overrides, display_pricing: _display, ...source } = Pricing.parse(value)

  const meters = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  return overrides === undefined ? { discount, meters } : { discount, meters, overrides }
}

/** Encode arbitrary override keys only when crossing into storage. */
export function encodePricing(value: ReturnType<typeof selectPricing>) {
  const { overrides, ...fields } = value
  return overrides === undefined ? fields : { ...fields, overrides_json: canonicalJson(overrides) }
}
