import { v } from 'convex/values'

export const catalogScopeTableNames = [
  'catalog_models',
  'catalog_model_descriptions',
  'catalog_providers',
  'catalog_endpoints',
  'catalog_endpoint_pricing',
] as const

export const catalogScopeTableValidator = v.union(
  v.literal('catalog_models'),
  v.literal('catalog_model_descriptions'),
  v.literal('catalog_providers'),
  v.literal('catalog_endpoints'),
  v.literal('catalog_endpoint_pricing'),
)

export const catalogSourceValidator = v.object({
  locator: v.string(),
  storageId: v.optional(v.string()),
})

export const catalogVersionFields = {
  id: v.string(),
  version_id: v.id('catalog_versions'),
  first_seen_at: v.number(),
  version: v.number(),
}
