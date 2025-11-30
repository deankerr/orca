import { defineTable } from 'convex/server'
import { v } from 'convex/values'

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
  .index('by_entity_type__crawl_id', ['entity_type', 'crawl_id'])
  .index('by_change_kind', ['change_kind'])
  .index('by_model_slug__crawl_id', ['model_slug', 'crawl_id'])

// NOTE: we can't create the vTable helper with a union validator
// export const vTable = createTableVHelper('or_views_changes', table.validator)

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

export const listByModelSlugAndCrawlId = internalQuery({
  args: {
    model_slug: v.string(),
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('or_views_changes')
      .withIndex('by_model_slug__crawl_id', (q) =>
        q.eq('model_slug', args.model_slug).eq('crawl_id', args.crawl_id),
      )
      .collect()
  },
})

export const listByCrawlId = internalQuery({
  args: {
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('or_views_changes')
      .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
      .collect()
  },
})

export const listRecentCrawlIds = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const seen = new Set<string>()
    const crawlIds: string[] = []

    // * walk backwards through changes, collecting unique crawl_ids
    for await (const doc of ctx.db
      .query('or_views_changes')
      .withIndex('by_crawl_id')
      .order('desc')) {
      if (!seen.has(doc.crawl_id)) {
        seen.add(doc.crawl_id)
        crawlIds.push(doc.crawl_id)
        if (crawlIds.length >= args.limit) break
      }
    }

    return crawlIds
  },
})
