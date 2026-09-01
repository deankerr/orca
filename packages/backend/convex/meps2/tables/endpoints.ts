import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { vMetadataRecord } from './shared'

/**
 * Current catalog endpoints. Listing is `unlisted_at`. `scan_at` is last write.
 */
export const endpointsTable = defineTable({
  /** Scan that last wrote this row (upsert or unlist). */
  scan_at: v.string(),
  /** Upstream endpoint UUID. */
  endpoint_id: v.string(),
  model_id: v.string(),
  variant: v.string(),
  /** Upstream `provider_slug`. */
  provider_tag: v.string(),
  /** `provider_info.slug`. */
  provider_id: v.string(),

  metadata: vMetadataRecord,

  /** Start of this catalog absence. Unset means listed. */
  unlisted_at: v.optional(v.string()),
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_unlisted_at', ['unlisted_at'])
