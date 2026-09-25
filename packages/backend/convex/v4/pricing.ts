import { v } from 'convex/values'
import { z } from 'zod'

import { canonicalJson } from './json'
import type { Endpoint } from './scan'

/** Selected pricing shared by Catalog and historical storage. */
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

/** Select decimal meters and preserve complete overrides; discount is already reflected in rates. */
export function selectPricing(value: Endpoint['pricing']) {
  const { discount, overrides, display_pricing: _display, ...source } = Pricing.parse(value)

  const meters = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  return overrides === undefined
    ? { discount, meters }
    : { discount, meters, overrides_json: canonicalJson(overrides) }
}
