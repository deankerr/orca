import { vWorkId } from '@convex-dev/workpool'
import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Execution order minimizes visible differences between the retained projections. */
export const ingestKeys = [
  'currentModels',
  'currentProviders',
  'currentEndpoints',
  'currentStats',
  'listingHistory',
  'pricingHistory',
  'statsHistory',
  'events',
] as const

export type IngestKey = (typeof ingestKeys)[number]

export const INGESTIONS_TABLE = 'scan_ingestions' as const

export const sourceInput = v.object({
  from_scan_at: v.union(v.string(), v.null()),
  scan_at: v.string(),
})

export const ingestionsTable = defineTable({
  ...sourceInput.fields,
  /** Last committed ingest key; completed records retain no implementation-specific stage. */
  stage: v.union(v.null(), literals(...ingestKeys), v.literal('complete')),
  /** Ownership includes queuing, retry backoff and awaiting the completion callback. */
  work_id: v.optional(vWorkId),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_stage_and_scan_at', ['stage', 'scan_at'])

export const ownership = v.object({ ingestion_id: v.id(INGESTIONS_TABLE), work_id: vWorkId })
