import { v } from 'convex/values'
import { z } from 'zod'

/** Normalized prices shared by Catalog, History and Events before storage encoding. */
export const Pricing = z.object({
  discount: z.number(),
  meters: z.record(z.string(), z.string()),
  overrides: z.array(z.record(z.string(), z.json())).optional(),
})

/** Storage encoding shared by Catalog and price history. */
export const pricing = v.object({
  discount: v.number(),
  meters: v.record(v.string(), v.string()),
  overrides_json: v.optional(v.string()),
})

/** Encode arbitrary override keys only when crossing into storage. */
export function encodePricing(value: z.infer<typeof Pricing>) {
  const { overrides, ...fields } = value
  return overrides === undefined ? fields : { ...fields, overrides_json: JSON.stringify(overrides) }
}
