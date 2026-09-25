import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Convex table for declared scan pairs; the latest row is the Catalog clock. */
export const V4_INGESTIONS_TABLE = 'v4_scan_ingestions' as const
/** Convex table for each following module's progress through declared pairs. */
export const V4_CURSORS_TABLE = 'v4_ingestion_cursors' as const

/** Modules that follow the Catalog through declared pairs. */
export const moduleName = v.union(
  v.literal('pricing'),
  v.literal('listings'),
  v.literal('current_stats'),
  v.literal('stats'),
)
export type ModuleName = Infer<typeof moduleName>

/** One declared scan pair, committed together with the Catalog writes it produced. */
export const ingestionsTable = defineTable({
  from_scan_at: v.string(),
  scan_at: v.string(),
})
  .index('by_from_scan_at', ['from_scan_at'])
  .index('by_scan_at', ['scan_at'])

/** A module's output reflects every declared pair through `scan_at`; null before its baseline. */
export const cursorsTable = defineTable({
  module: moduleName,
  scan_at: v.union(v.null(), v.string()),
}).index('by_module', ['module'])

/** A declared pair, before Convex system fields. */
export type IngestionRow = Infer<typeof ingestionsTable.validator>
