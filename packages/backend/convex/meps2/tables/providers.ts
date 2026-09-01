import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { vMetadataRecord } from './shared'

/**
 * Providers derived from `endpoint.provider_info` at apply. Catalog-absent stay.
 */
export const providersTable = defineTable({
  /** Scan that last wrote this row. */
  scan_at: v.string(),
  /** `provider_info.slug`. */
  provider_id: v.string(),
  /** `provider_info.displayName`. */
  display_name: v.string(),

  metadata: vMetadataRecord,
}).index('by_provider_id', ['provider_id'])
