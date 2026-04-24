import { defineTable } from 'convex/server'
import { v } from 'convex/values'

// Entity State

export const stateTable = defineTable({
  contentHash: v.string(),
  entity: v.object({
    id: v.string(),
    label: v.string(),
  }),
  observedAt: v.number(),
  rowId: v.id('catalog_models_content'),
  unavailableAt: v.optional(v.number()),
}).index('by_entity_id__observedAt', ['entity.id', 'observedAt'])

// Content

export const contentFields = {
  id: v.string(),
  variant: v.string(),
  versionId: v.string(),

  authorId: v.string(),
  authorName: v.string(),
  name: v.string(),

  orAddedAt: v.number(),

  inputModalities: v.array(v.string()),
  outputModalities: v.array(v.string()),

  reasoning: v.boolean(),

  description: v.string(),
  huggingFaceId: v.optional(v.string()),
  promotionMessage: v.optional(v.string()),
  routingErrorMessage: v.optional(v.string()),
  warningMessage: v.optional(v.string()),
}

export const contentTable = defineTable(contentFields)
