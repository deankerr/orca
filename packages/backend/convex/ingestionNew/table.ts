import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import type { Id } from '#generated/dataModel'

export const ingestKeys = [
  'currentModels',
  'currentProviders',
  'currentEndpoints',
  'currentStats',
  'listingHistory',
  'observations',
  'pricingHistory',
  'statsHistory',
  'events',
] as const

export type IngestKey = (typeof ingestKeys)[number]

export const INGESTIONS_TABLE = 'scan_ingestions' as const
export const ingestionId = v.id(INGESTIONS_TABLE)
export type InputId = Id<typeof INGESTIONS_TABLE>

export const sourceInput = v.object({
  from_scan_at: v.union(v.string(), v.null()),
  scan_at: v.string(),
})

export const ingestionsTable = defineTable({
  ...sourceInput.fields,
  progress: v.union(
    v.object({ kind: v.literal('pending'), completed: v.array(literals(...ingestKeys)) }),
    v.object({ kind: v.literal('complete') }),
  ),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_progress_kind_and_scan_at', ['progress.kind', 'scan_at'])
