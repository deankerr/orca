import { literals, nullable } from 'convex-helpers/validators'
import { defineTable, paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, internalQuery, query } from '../../../_generated/server'
import { createTableVHelper } from '../../../lib/vTable'

export const table = defineTable({
  crawl_id: v.string(),
  storage_id: v.id('_storage'),
  data: v.record(v.string(), v.any()),
}).index('by_crawl_id', ['crawl_id'])

export const vTable = createTableVHelper('snapshot_crawl_archives', table.validator)

export const insert = internalMutation({
  args: {
    crawl_id: v.string(),
    storage_id: v.id('_storage'),
    data: v.record(v.string(), v.any()),
  },
  returns: vTable._id,
  handler: async (ctx, args) => {
    return await ctx.db.insert('snapshot_crawl_archives', args)
  },
})

export const getByCrawlId = internalQuery({
  args: {
    crawl_id: v.string(),
  },
  returns: nullable(vTable.doc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
      .first()
  },
})

export const getLatestCrawlId = internalQuery({
  returns: nullable(v.string()),
  handler: async (ctx) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id')
      .order('desc')
      .first()
      .then((r) => r?.crawl_id)
  },
})

export const list = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    fromCrawlId: v.optional(v.string()),
    order: v.optional(literals('asc', 'desc')),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('snapshot_crawl_archives')
      .withIndex('by_crawl_id', (q) => q.gte('crawl_id', args.fromCrawlId ?? ''))
      .order(args.order ?? 'asc')
      .paginate(args.paginationOpts)
  },
})

export const feed = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.query('snapshot_crawl_archives').order('desc').paginate(args.paginationOpts)
  },
})

export const collect = query({
  handler: async (ctx) => {
    return await ctx.db.query('snapshot_crawl_archives').collect()
  },
})
