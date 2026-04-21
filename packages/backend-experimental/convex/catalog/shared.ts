import { v } from 'convex/values'

export const catalogScopeTableNames = [
  'catalog_models',
  'catalog_model_descriptions',
  'catalog_providers',
] as const

export type CatalogScopeTable = (typeof catalogScopeTableNames)[number]

export const catalogScopeTableValidator = v.union(
  v.literal('catalog_models'),
  v.literal('catalog_model_descriptions'),
  v.literal('catalog_providers'),
)

export const catalogVersionFields = {
  id: v.string(),
  versionId: v.id('catalog_versions'),
  firstSeenAt: v.number(),
  version: v.number(),
}
