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
  rowId: v.id('catalog_providers_content'),
  unavailableAt: v.optional(v.number()),
}).index('by_entity_id__observedAt', ['entity.id', 'observedAt'])

// Content

export const contentFields = {
  datacenters: v.optional(v.array(v.string())),
  headquarters: v.optional(v.string()),
  id: v.string(),
  name: v.string(),
  privacyPolicyUrl: v.optional(v.string()),
  sendClientIp: v.boolean(),
  statusPageUrl: v.optional(v.string()),
  termsOfServiceUrl: v.optional(v.string()),
}

export const contentTable = defineTable(contentFields)
