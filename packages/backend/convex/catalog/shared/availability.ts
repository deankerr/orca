import { v } from 'convex/values'

export const availabilityFields = {
  unavailable_at: v.optional(v.number()),
  updated_at: v.number(),
}
