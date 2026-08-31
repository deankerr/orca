import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { vMetadataRecord } from './shared'

export const providersTable = defineTable({
  scan_at: v.string(),
  provider_id: v.string(),
  display_name: v.string(),

  metadata: vMetadataRecord,
}).index('by_provider_id', ['provider_id'])
