import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

const vMetadataRecord = v.record(
  v.string(),
  v.union(v.boolean(), v.number(), v.null(), v.string(), v.array(v.string())),
)

/** Convex table name for the latest known endpoint views. */
export const V3_ENDPOINTS_VIEW_TABLE = 'v3_endpoints_view' as const

/**
 * Schema for the latest known endpoint views.
 * Listing is represented by `unlisted_at`; `scan_at` is the last write.
 */
export const endpointsViewTable = defineTable({
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

  model_display_name: v.string(),
  model_permaslug: v.string(),
  model_or_created_at: v.string(),
  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),
  provider_display_name: v.string(),

  metadata: vMetadataRecord,

  /** Start of this catalog absence. Unset means listed. */
  unlisted_at: v.optional(v.string()),
})
  .index('by_endpoint_id', ['endpoint_id'])
  .index('by_unlisted_at', ['unlisted_at'])

/** Convex table name for the latest known model views. */
export const V3_MODELS_VIEW_TABLE = 'v3_models_view' as const

/** Schema for the latest known model views, including catalog-absent models. */
export const modelsViewTable = defineTable({
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

  /** Remaining source fields. Nested objects and non-string arrays are dropped. */
  metadata: vMetadataRecord,
}).index('by_model_id', ['model_id'])

/** Convex table name for the latest known provider views. */
export const V3_PROVIDERS_VIEW_TABLE = 'v3_providers_view' as const

/** Schema for provider views derived from `endpoint.provider_info`, including absent providers. */
export const providersViewTable = defineTable({
  /** Scan that last wrote this row. */
  scan_at: v.string(),
  /** `provider_info.slug`. */
  provider_id: v.string(),
  /** `provider_info.displayName`. */
  display_name: v.string(),

  metadata: vMetadataRecord,
}).index('by_provider_id', ['provider_id'])

/** Metadata values retained from upstream entity objects. */
export type MetadataRecord = Infer<typeof vMetadataRecord>
/** Row stored in the endpoint view table. */
export type EndpointRow = Infer<typeof endpointsViewTable.validator>
/** Row stored in the model view table. */
export type ModelRow = Infer<typeof modelsViewTable.validator>
/** Row stored in the provider view table. */
export type ProviderRow = Infer<typeof providersViewTable.validator>
