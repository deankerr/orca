import { literals } from 'convex-helpers/validators'
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import type { Id } from '#generated/dataModel'

export const ingestionProcesses = [
  'currentModels',
  'currentProviders',
  'currentEndpoints',
  'currentStats',
  'observations',
  'pricingHistory',
  'statsHistory',
  'events',
] as const

export type IngestionProcess = (typeof ingestionProcesses)[number]

export const REGISTRATIONS_TABLE = 'scan_registrations' as const
export const registrationId = v.id(REGISTRATIONS_TABLE)
export type RegistrationId = Id<typeof REGISTRATIONS_TABLE>

export const scanSelection = v.object({
  from_scan_at: v.union(v.string(), v.null()),
  scan_at: v.string(),
})

export const registrationsTable = defineTable({
  ...scanSelection.fields,
  progress: v.union(
    v.object({ kind: v.literal('pending'), completed: v.array(literals(...ingestionProcesses)) }),
    v.object({ kind: v.literal('complete') }),
  ),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_progress_kind_and_scan_at', ['progress.kind', 'scan_at'])
