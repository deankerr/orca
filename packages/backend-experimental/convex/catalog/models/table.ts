import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogVersionFields } from '../shared'

export const modelDataFields = {
  id: v.string(),
  versionSlug: v.string(),
  variant: v.string(),

  name: v.string(),
  authorSlug: v.string(),
  authorName: v.string(),

  orAddedAt: v.number(),

  inputModalities: v.array(v.string()),
  outputModalities: v.array(v.string()),

  reasoning: v.boolean(),

  huggingFaceId: v.optional(v.string()),
  promotionMessage: v.optional(v.string()),
  warningMessage: v.optional(v.string()),
  routingErrorMessage: v.optional(v.string()),
}

export const catalogModelsTable = defineTable({
  ...modelDataFields,
  ...catalogVersionFields,
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])

export const modelDescriptionDataFields = {
  id: v.string(),
  description: v.string(),
}

export const catalogModelDescriptionsTable = defineTable({
  ...modelDescriptionDataFields,
  ...catalogVersionFields,
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])
