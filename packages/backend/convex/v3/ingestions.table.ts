import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Sentinel preceding the first ingested scan artifact. */
export const INITIAL_SCAN_ARTIFACT_ID = 'initial' as const
/** Convex table name for completed scan ingestions. */
export const V3_SCAN_INGESTIONS_TABLE = 'v3_scan_ingestions' as const

/** Schema for completed scan ingestions. */
export const scanIngestionsTable = defineTable({
  from_artifact_id: v.string(),
  to_artifact_id: v.string(),
  scan_at: v.string(),
})
