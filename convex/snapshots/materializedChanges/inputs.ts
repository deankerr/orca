import { literals } from 'convex-helpers/validators'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'

export const getLatestCrawlId = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query('or_views_changes')
      .withIndex('by_crawl_id')
      .order('desc')
      .first()
    return doc?.crawl_id ?? null
  },
})

export const listArchives = internalQuery({
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
