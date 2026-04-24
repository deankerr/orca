import { defineTable } from 'convex/server'
import { v } from 'convex/values'

// Entity State

export const stateTable = defineTable({
  entity: v.object({
    id: v.string(),
    label: v.string(),
  }),
  observedAt: v.number(),
  rowId: v.id('catalog_providers_content'),
  contentHash: v.string(),
  unavailableAt: v.optional(v.number()),
}).index('by_entity_id__observedAt', ['entity.id', 'observedAt'])

// Content

export const contentFields = {
  id: v.string(),
  name: v.string(),
  headquarters: v.optional(v.string()),
  datacenters: v.optional(v.array(v.string())),
  statusPageUrl: v.optional(v.string()),
  termsOfServiceUrl: v.optional(v.string()),
  privacyPolicyUrl: v.optional(v.string()),
  sendClientIp: v.boolean(),
}

export const contentTable = defineTable(contentFields)
