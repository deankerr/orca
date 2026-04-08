import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { availabilityFields } from '../shared/availability'

export const modelsTable = defineTable({
  slug: v.string(),
  base_slug: v.string(),
  version_slug: v.string(),
  variant: v.string(),

  name: v.string(),
  icon_url: v.string(), // deprecated

  author_slug: v.string(),
  author_name: v.string(),

  or_added_at: v.number(),

  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),

  reasoning: v.boolean(),

  hugging_face_id: v.optional(v.string()),
  tokenizer: v.optional(v.string()),
  instruct_type: v.optional(v.string()),
  promotion_message: v.optional(v.string()),
  warning_message: v.optional(v.string()),

  ...availabilityFields,
})
  .index('by_or_added_at', ['or_added_at'])
  .index('by_slug', ['slug'])

export const modelDescriptionsTable = defineTable({
  slug: v.string(),
  description: v.string(),
  updated_at: v.number(),
}).index('by_slug', ['slug'])
