import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const INITIAL_SCAN_ARTIFACT_ID = 'initial' as const
export const V3_SCAN_INGESTIONS_TABLE = 'v3_scan_ingestions' as const

export const scanIngestionsTable = defineTable({
  from_artifact_id: v.string(),
  to_artifact_id: v.string(),
})
