import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogAvailabilityFields, catalogStateFields } from '../shared'

export const providerDataFields = {
  slug: v.string(),
  name: v.string(),
  headquarters: v.optional(v.string()),
  datacenters: v.optional(v.array(v.string())),
  status_page_url: v.optional(v.string()),
  terms_of_service_url: v.optional(v.string()),
  privacy_policy_url: v.optional(v.string()),
  send_client_ip: v.boolean(),
}

export const catalogProvidersTable = defineTable({
  ...providerDataFields,
  ...catalogStateFields,
  ...catalogAvailabilityFields,
})
  .index('by_slug_and_since_at', ['slug', 'since_at'])
  .index('by_slug_and_sequence', ['slug', 'sequence'])
