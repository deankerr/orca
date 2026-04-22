import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const identityFields = {
  id: v.string(),
}

const componentStateFields = {
  coreVersion: v.number(),
  coreContentHash: v.string(),
  descriptionVersion: v.number(),
  descriptionContentHash: v.string(),
}

// Entity State

export const stateFields = {
  ...identityFields,
  ...componentStateFields,
  firstSeenAt: v.number(),
  version: v.number(),
  unavailableAt: v.optional(v.number()),
}

export const stateTable = defineTable(stateFields)
  .index('by_id__version', ['id', 'version'])
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_unavailableAt', ['unavailableAt'])

// Core Component

export const coreContentFields = {
  ...identityFields,
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

export const coreTable = defineTable({
  ...coreContentFields,
  firstSeenAt: v.number(),
  version: v.number(),
  contentHash: v.string(),
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])

// Description Component

export const descriptionContentFields = {
  ...identityFields,
  description: v.string(),
}

export const descriptionTable = defineTable({
  ...descriptionContentFields,
  firstSeenAt: v.number(),
  version: v.number(),
  contentHash: v.string(),
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])
