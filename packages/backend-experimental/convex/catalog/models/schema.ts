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
  snapshotId: v.id('catalog_models_snapshots'),
  unavailableAt: v.optional(v.number()),
  viewId: v.id('catalog_models_views'),
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

export const snapshotsTable = defineTable(contentFields)

export const viewsTable = defineTable({
  ...contentFields,
  unavailableAt: v.optional(v.number()),
  // MAX_SAFE_INTEGER when available, actual unavailableAt when not — enables single range query
  unavailableAtSortKey: v.number(),
})
  .index('by_entityId', ['id'])
  .index('by_unavailableAtSortKey', ['unavailableAtSortKey'])
