import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { vMetadataRecord } from './shared'

export const endpointsTable = defineTable({
  scan_at: v.string(),
  endpoint_id: v.string(),
  model_id: v.string(),
  variant: v.string(),
  provider_tag: v.string(),
  provider_id: v.string(),

  metadata: vMetadataRecord,

  // start of the current catalog absence; unset means listed in the latest complete scan
  unlisted_at: v.optional(v.string()),
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_unlisted_at', ['unlisted_at'])
