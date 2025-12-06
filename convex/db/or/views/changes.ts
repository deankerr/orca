import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { Doc } from '../../../_generated/dataModel'
import { internalQuery } from '../../../_generated/server'

const changeKindValidator = v.union(v.literal('create'), v.literal('update'), v.literal('delete'))

const baseFields = {
  crawl_id: v.string(),
  previous_crawl_id: v.string(),

  change_kind: changeKindValidator,

  path: v.optional(v.string()),
  path_level_1: v.optional(v.string()),
  path_level_2: v.optional(v.string()),

  before: v.optional(v.any()),
  after: v.optional(v.any()),
}

const modelChangesValidator = v.object({
  entity_type: v.literal('model'),
  model_slug: v.string(),
  ...baseFields,
})

const endpointChangesValidator = v.object({
  entity_type: v.literal('endpoint'),
  model_slug: v.string(),
  provider_slug: v.string(),
  provider_tag_slug: v.string(),
  endpoint_uuid: v.string(),
  ...baseFields,
})

const providerChangesValidator = v.object({
  entity_type: v.literal('provider'),
  provider_slug: v.string(),
  ...baseFields,
})

export const table = defineTable(
  v.union(modelChangesValidator, providerChangesValidator, endpointChangesValidator),
)
  .index('by_previous_crawl_id__crawl_id', ['previous_crawl_id', 'crawl_id'])
  .index('by_crawl_id', ['crawl_id'])
  .index('by_change_kind', ['change_kind'])
  .index('by_entity_type__crawl_id', ['entity_type', 'crawl_id'])
  .index('by_model_slug__crawl_id', ['model_slug', 'crawl_id'])
  .index('by_entity_type__model_slug__crawl_id', ['entity_type', 'model_slug', 'crawl_id'])

// NOTE: we can't create the vTable helper with a union validator
// export const vTable = createTableVHelper('or_views_changes', table.validator)

export type ChangeTypeModelDoc = Extract<Doc<'or_views_changes'>, { entity_type: 'model' }>
export type ChangeTypeEndpointDoc = Extract<Doc<'or_views_changes'>, { entity_type: 'endpoint' }>

export const getLatestCrawlId = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => {
    const doc = await ctx.db
      .query('or_views_changes')
      .withIndex('by_crawl_id')
      .order('desc')
      .first()
    return doc?.crawl_id ?? null
  },
})
