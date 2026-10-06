import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Accepted ingestions release their scan pairs to downstream processing. */
export const INGESTIONS_TABLE = 'v4_scan_ingestions' as const

/** One accepted scan pair, committed atomically with Catalog, Listings, Pricing and current stats. */
export const ingestionsTable = defineTable({ from_scan_at: v.string(), scan_at: v.string() })
  .index('by_from_scan_at', ['from_scan_at'])
  .index('by_scan_at', ['scan_at'])

/** Stored acceptance record, before Convex system fields; processor work may still be pending. */
export type IngestionRow = Infer<typeof ingestionsTable.validator>

export const PROCESSOR_WORK_TABLE = 'v4_processor_work' as const
export const processorName = v.union(v.literal('events'), v.literal('stats'))
export type ProcessorName = Infer<typeof processorName>

/** Read compatibility only for the retired Listings and Pricing processors. */
export const storedProcessorName = v.union(
  processorName,
  v.literal('listings'),
  v.literal('pricing'),
)
export const workState = v.union(v.literal('pending'), v.literal('complete'))

/** One processor's obligation for one ingestion; completion commits with the entire payload. */
export const processorWorkTable = defineTable({
  ingestion_id: v.id(INGESTIONS_TABLE),
  processor: storedProcessorName,
  scan_at: v.string(),
  state: workState,
  /** Deprecated and ignored; retained for compatibility with older deployments. */
  previously_known_models: v.optional(v.array(v.string())),
})
  .index('by_ingestion_id_and_processor', ['ingestion_id', 'processor'])
  .index('by_processor_and_state_and_scan_at', ['processor', 'state', 'scan_at'])
