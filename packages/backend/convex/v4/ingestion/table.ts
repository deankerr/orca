import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Completed ingestions release their observation pairs to downstream processing. */
export const V4_INGESTIONS_TABLE = 'v4_scan_ingestions' as const
/** Current-stats publication cursor and frozen legacy cursors used by the work migration. */
export const V4_CURSORS_TABLE = 'v4_ingestion_cursors' as const

/** Retained for compatibility with existing deployments; only current_stats still advances. */
export const moduleName = v.union(
  v.literal('pricing'),
  v.literal('listings'),
  v.literal('current_stats'),
  v.literal('stats'),
)
export type ModuleName = Infer<typeof moduleName>

/** One completed ingestion, committed atomically with its prerequisites (currently Catalog). */
export const ingestionsTable = defineTable({
  from_scan_at: v.string(),
  scan_at: v.string(),
})
  .index('by_from_scan_at', ['from_scan_at'])
  .index('by_scan_at', ['scan_at'])

/** Legacy processor progress; current_stats uses this as its latest successfully published scan. */
export const cursorsTable = defineTable({
  module: moduleName,
  scan_at: v.union(v.null(), v.string()),
}).index('by_module', ['module'])

/** A declared pair, before Convex system fields. */
export type IngestionRow = Infer<typeof ingestionsTable.validator>

export const V4_PROCESSOR_WORK_TABLE = 'v4_processor_work' as const
export const processorName = v.union(
  v.literal('pricing'),
  v.literal('listings'),
  v.literal('stats'),
)
export type ProcessorName = Infer<typeof processorName>
export const workState = v.union(v.literal('pending'), v.literal('complete'))

/** One processor's obligation for one ingestion; completion commits with the entire payload. */
export const processorWorkTable = defineTable({
  ingestion_id: v.id(V4_INGESTIONS_TABLE),
  processor: processorName,
  scan_at: v.string(),
  state: workState,
})
  .index('by_ingestion_id_and_processor', ['ingestion_id', 'processor'])
  .index('by_processor_and_state_and_scan_at', ['processor', 'state', 'scan_at'])
