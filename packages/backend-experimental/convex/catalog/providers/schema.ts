import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const identityFields = {
  id: v.string(),
}

const componentStateFields = {
  coreVersion: v.number(),
  coreContentHash: v.string(),
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
  name: v.string(),
  headquarters: v.optional(v.string()),
  datacenters: v.optional(v.array(v.string())),
  statusPageUrl: v.optional(v.string()),
  termsOfServiceUrl: v.optional(v.string()),
  privacyPolicyUrl: v.optional(v.string()),
  sendClientIp: v.boolean(),
}

export const coreTable = defineTable({
  ...coreContentFields,
  firstSeenAt: v.number(),
  version: v.number(),
  contentHash: v.string(),
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])
