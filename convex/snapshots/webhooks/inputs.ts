import { v } from 'convex/values'

import { internalQuery, QueryCtx } from '../../_generated/server'
import { transformChanges } from '../../transforms/changes'

// * Queries

export const getEnabledSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('webhook_subscriptions')
      .withIndex('by_enabled', (q) => q.eq('enabled', true))
      .collect()
  },
})

export type WebhookChange = Awaited<Promise<ReturnType<typeof changesByCrawlIdHandler>>>[number]

async function changesByCrawlIdHandler(ctx: QueryCtx, args: { crawl_id: string }) {
  return await ctx.db
    .query('or_views_changes')
    .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
    .collect()
    .then(transformChanges)
    .then((c) => c.filter((c) => c.entity_type !== 'provider'))
}

export const changesByCrawlId = internalQuery({
  args: { crawl_id: v.string() },
  handler: async (ctx, args) => await changesByCrawlIdHandler(ctx, args),
})

export const getRecentCrawlIds = internalQuery({
  args: { limit: v.number() },
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
