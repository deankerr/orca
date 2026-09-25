import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import type { Id } from '../../_generated/dataModel'

/** Convex table for admitted pairs, execution status and completed checkpoints. */
export const V4_INGESTIONS_TABLE = 'v4_scan_ingestions' as const

/** One admitted real scan pair and its ingestion progress. */
export const ingestionsTable = defineTable({
  from_scan_at: v.string(),
  scan_at: v.string(),
  phase: v.string(),
  status: v.union(
    v.literal('ready'),
    v.literal('running'),
    v.literal('failed'),
    v.literal('complete'),
  ),
  baseline: v.boolean(),
})
  .index('by_from_scan_at_and_scan_at', ['from_scan_at', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
  .index('by_status_and_scan_at', ['status', 'scan_at'])

/** A scan ingestion row, before Convex system fields. */
export type IngestionRow = Infer<typeof ingestionsTable.validator>

export type Ingestion = IngestionRow & { id: Id<typeof V4_INGESTIONS_TABLE> }
