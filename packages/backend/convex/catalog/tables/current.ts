import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { endpointIdentity, modelIdentity, providerIdentity } from '../entities'
import { pricing } from '../pricing'

/** Cumulative model knowledge; departed models retain their last-known facts. */
export const CURRENT_MODELS_TABLE = 'catalog_current_models' as const

export const currentModelsTable = defineTable({
  ...modelIdentity.fields,
  scan_at: v.string(),
  slug: v.string(),
  permaslug: v.string(),
  variant: v.string(),
  or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  metadata_json: v.string(),
}).index('by_model_id', ['model_id'])

export type CurrentModelRow = Infer<typeof currentModelsTable.validator>

/** Cumulative provider knowledge; departed providers retain their last-known facts. */
export const CURRENT_PROVIDERS_TABLE = 'catalog_current_providers' as const

export const currentProvidersTable = defineTable({
  ...providerIdentity.fields,
  scan_at: v.string(),
  metadata_json: v.string(),
}).index('by_provider_id', ['provider_id'])

export type CurrentProviderRow = Infer<typeof currentProvidersTable.validator>

/** Current or last-known endpoints; unlisting retains the row rather than deleting it. */
export const CURRENT_ENDPOINTS_TABLE = 'catalog_current_endpoints' as const

export const currentEndpointsTable = defineTable({
  ...endpointIdentity.fields,
  model_id: v.string(),
  provider_id: v.string(),
  variant: v.string(),
  scan_at: v.string(),
  unlisted_at: v.optional(v.string()),
  model_display_name: v.string(),
  model_permaslug: v.string(),
  model_or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  pricing,
  metadata_json: v.string(),
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_model_id', ['model_id'])
  .index('by_provider_id_and_model_id', ['provider_id', 'model_id'])
  .index('by_unlisted_at', ['unlisted_at'])

export type CurrentEndpointRow = Infer<typeof currentEndpointsTable.validator>

/** Singleton cache of the latest published endpoint stats. */
export const CURRENT_STATS_TABLE = 'catalog_current_stats' as const

/** An endpoint's current default-tier readings; endpoints with no reading have no row. */
const currentStatsRow = v.object({
  endpoint_id: v.string(),
  p50_throughput: v.optional(v.number()),
  p50_latency: v.optional(v.number()),
})

export type CurrentStatsRow = Infer<typeof currentStatsRow>

// One document, bounded by 1 MiB / 8,192 rows; shard the snapshot if it approaches either limit.
export const currentStatsTable = defineTable({
  scan_at: v.string(),
  rows: v.array(currentStatsRow),
})
