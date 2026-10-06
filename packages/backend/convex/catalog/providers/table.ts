import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Cumulative provider knowledge; departed providers retain their last-known facts. */
export const CURRENT_PROVIDERS_TABLE = 'v4_providers' as const

export const currentProvidersTable = defineTable({
  provider_id: v.string(),
  scan_at: v.string(),
  /** First retained observation of this identity; absent when first-observation evidence is unknown. */
  from_scan_at: v.optional(v.string()),
  display_name: v.string(),
  metadata_json: v.string(),
}).index('by_provider_id', ['provider_id'])

export type CurrentProviderRow = Infer<typeof currentProvidersTable.validator>
