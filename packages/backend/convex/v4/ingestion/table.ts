import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Convex table for admitted scan pairs and their phase. */
export const V4_INGESTIONS_TABLE = 'v4_ingestions' as const

/** One admitted real scan pair and its ingestion progress. */
export const ingestionsTable = defineTable({
  from_scan_at: v.string(),
  scan_at: v.string(),
  phase: v.string(),
})
  .index('by_from_scan_at_and_scan_at', ['from_scan_at', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
  .index('by_phase_and_scan_at', ['phase', 'scan_at'])

/** Row stored in `v4_ingestions`, before Convex system fields. */
export type IngestionRow = Infer<typeof ingestionsTable.validator>
