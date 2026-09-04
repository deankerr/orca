import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const vMetadataRecord = v.record(
  v.string(),
  v.union(v.boolean(), v.number(), v.null(), v.string(), v.array(v.string())),
)

export const V3_ENDPOINTS_VIEW_TABLE = 'v3_endpoints_view' as const

/**
 * Current catalog endpoints. Listing is `unlisted_at`. `scan_at` is last write.
 */
export const endpointsTable = defineTable({
  /** Scan that last wrote this row (upsert or unlist). */
  scan_at: v.string(),
  /** Upstream endpoint UUID. */
  endpoint_id: v.string(),
  model_id: v.string(),
  variant: v.string(),
  /** Upstream `provider_slug`. */
  provider_tag: v.string(),
  /** `provider_info.slug`. */
  provider_id: v.string(),

  metadata: vMetadataRecord,

  /** Start of this catalog absence. Unset means listed. */
  unlisted_at: v.optional(v.string()),
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_unlisted_at', ['unlisted_at'])

/**
 * Current catalog models. `scan_at` is last write. Catalog-absent models stay.
 */
export const V3_MODELS_VIEW_TABLE = 'v3_models_view' as const

export const modelsTable = defineTable({
  /** Scan that last wrote this row. */
  scan_at: v.string(),
  model_id: v.string(),
  permaslug: v.string(),
  variant: v.string(),

  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  /** OpenRouter `created_at`. */
  or_created_at: v.string(),

  /** OpenRouter `short_name`. */
  display_name: v.string(),
  author_display_name: v.string(),

  /** Remaining source fields. Nested objects and non-string arrays are dropped. */
  metadata: vMetadataRecord,
}).index('by_model_id', ['model_id'])

/**
 * Providers derived from `endpoint.provider_info` at apply. Catalog-absent stay.
 */
export const V3_PROVIDERS_VIEW_TABLE = 'v3_providers_view' as const

export const providersTable = defineTable({
  /** Scan that last wrote this row. */
  scan_at: v.string(),
  /** `provider_info.slug`. */
  provider_id: v.string(),
  /** `provider_info.displayName`. */
  display_name: v.string(),

  metadata: vMetadataRecord,
}).index('by_provider_id', ['provider_id'])

export type MetadataRecord = Infer<typeof vMetadataRecord>
export type EndpointRow = Infer<typeof endpointsTable.validator>
export type ModelRow = Infer<typeof modelsTable.validator>
export type ProviderRow = Infer<typeof providersTable.validator>
