import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogVersionFields } from '../shared'

export const modelDataFields = {
  id: v.string(),
  version_slug: v.string(),
  variant: v.string(),

  name: v.string(),
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
  ...catalogVersionFields,
})
  .index('by_id__first_seen_at', ['id', 'first_seen_at'])
  .index('by_id__version', ['id', 'version'])

export const modelDescriptionDataFields = {
  id: v.string(),
  description: v.string(),
}

export const catalogModelDescriptionsTable = defineTable({
  ...modelDescriptionDataFields,
  ...catalogVersionFields,
})
  .index('by_id__first_seen_at', ['id', 'first_seen_at'])
  .index('by_id__version', ['id', 'version'])
