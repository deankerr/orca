import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { pairTimes } from '../scan/time'

/** Completed ingestions release their observation pairs to downstream processing. */
export const V4_INGESTIONS_TABLE = 'v4_scan_ingestions' as const

/** One completed ingestion, committed atomically with its prerequisites (currently Catalog). */
export const ingestionsTable = defineTable(pairTimes)
  .index('by_from_scan_at', ['from_scan_at'])
  .index('by_scan_at', ['scan_at'])

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
