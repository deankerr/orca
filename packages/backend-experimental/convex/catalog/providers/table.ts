import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogVersionFields } from '../shared'

export const providerDataFields = {
  id: v.string(),
  name: v.string(),
  headquarters: v.optional(v.string()),
  datacenters: v.optional(v.array(v.string())),
  statusPageUrl: v.optional(v.string()),
  termsOfServiceUrl: v.optional(v.string()),
  privacyPolicyUrl: v.optional(v.string()),
  sendClientIp: v.boolean(),
}

export const catalogProvidersTable = defineTable({
  ...providerDataFields,
  ...catalogVersionFields,
})
  .index('by_id__firstSeenAt', ['id', 'firstSeenAt'])
  .index('by_id__version', ['id', 'version'])
