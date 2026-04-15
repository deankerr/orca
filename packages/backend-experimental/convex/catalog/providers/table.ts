import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogVersionFields } from '../shared'

export const providerDataFields = {
  id: v.string(),
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
  ...catalogVersionFields,
})
  .index('by_id__first_seen_at', ['id', 'first_seen_at'])
  .index('by_id__version', ['id', 'version'])
