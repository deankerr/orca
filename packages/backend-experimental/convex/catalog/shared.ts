import { v } from 'convex/values'

export const catalogStateFields = {
  state_id: v.id('catalog_registry'),
  since_at: v.number(),
  sequence: v.number(),
}

export const catalogAvailabilityFields = {
  availability: v.optional(
    v.object({
      unavailable_at: v.number(),
    }),
  ),
}
