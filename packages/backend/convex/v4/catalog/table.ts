import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { pricing } from '../pricing'

// ⚠️ Cumulative entity knowledge: rows are inserted or overwritten, never deleted.
// Models/providers remain known; endpoints become unlisted. These are not disposable caches.

/** Convex table for the current model cache. */
export const V4_CURRENT_MODELS_TABLE = 'v4_models' as const
/** Convex table for the current provider cache. */
export const V4_CURRENT_PROVIDERS_TABLE = 'v4_providers' as const
/** Convex table for the current endpoint cache. */
export const V4_CURRENT_ENDPOINTS_TABLE = 'v4_endpoints' as const

/** Remaining projected facts as JSON text, independent of Convex object-key restrictions. */
const metadata_json = v.string()

/** Current or last-known model projection. */
export const currentModelsTable = defineTable({
  model_id: v.string(),
  scan_at: v.string(),
  slug: v.string(),
  permaslug: v.string(),
  variant: v.string(),
  display_name: v.string(),
  or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  metadata_json,
}).index('by_model_id', ['model_id'])

/** Current or last-known provider projection. */
export const currentProvidersTable = defineTable({
  provider_id: v.string(),
  scan_at: v.string(),
  display_name: v.string(),
  metadata_json,
}).index('by_provider_id', ['provider_id'])

/** Current or last-known hydrated endpoint, including relationships and pricing. */
export const currentEndpointsTable = defineTable({
  endpoint_id: v.string(),
  model_id: v.string(),
  provider_id: v.string(),
  provider_tag: v.string(),
  variant: v.string(),
  scan_at: v.string(),
  unlisted_at: v.optional(v.string()),
  model_display_name: v.string(),
  model_permaslug: v.string(),
  model_or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  provider_display_name: v.string(),
  pricing,
  metadata_json,
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_model_id', ['model_id'])
  .index('by_provider_id_and_model_id', ['provider_id', 'model_id'])
  .index('by_unlisted_at', ['unlisted_at'])

/** A model row, before Convex system fields. */
export type CurrentModelRow = Infer<typeof currentModelsTable.validator>
/** A provider row, before Convex system fields. */
export type CurrentProviderRow = Infer<typeof currentProvidersTable.validator>
/** An endpoint row, before Convex system fields. */
export type CurrentEndpointRow = Infer<typeof currentEndpointsTable.validator>
