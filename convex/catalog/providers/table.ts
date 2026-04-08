import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { availabilityFields } from '../shared/availability'

export const providersTable = defineTable({
  slug: v.string(),

  name: v.string(),
  icon_url: v.string(), // deprecated

  headquarters: v.optional(v.string()),
  datacenters: v.optional(v.array(v.string())),
  status_page_url: v.optional(v.string()),
  terms_of_service_url: v.optional(v.string()),
  privacy_policy_url: v.optional(v.string()),

  ...availabilityFields,
})
  .index('by_name', ['name'])
  .index('by_slug', ['slug'])
