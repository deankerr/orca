import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogAvailabilityFields, catalogStateFields } from '../shared'

export const modelDataFields = {
  slug: v.string(),
  version_slug: v.string(),
  variant: v.string(),

  name: v.string(),
  description: v.string(),

  author_slug: v.string(),
  author_name: v.string(),

  or_added_at: v.number(),

  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),

  reasoning: v.boolean(),

  hugging_face_id: v.optional(v.string()),
  promotion_message: v.optional(v.string()),
  warning_message: v.optional(v.string()),
  routing_error_message: v.optional(v.string()),
}

export const catalogModelsTable = defineTable({
  ...modelDataFields,
  ...catalogStateFields,
  ...catalogAvailabilityFields,
})
  .index('by_slug_and_since_at', ['slug', 'since_at'])
  .index('by_slug_and_sequence', ['slug', 'sequence'])
