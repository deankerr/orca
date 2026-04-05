import { stream } from 'convex-helpers/server/stream'
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalQuery } from '../_generated/server'
import schema from '../schema'

/**
 * Dev testing action. Runs the real dispatcher for recent crawl_ids.
 *
 * Options:
 * - crawlIds: specific crawl_id(s) to process
 * - lastN: auto-fetch last N crawl batches with changes
 */
export const test = internalAction({
  args: {
    crawlIds: v.optional(v.union(v.string(), v.array(v.string()))),
    lastN: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // resolve crawl_ids
    let crawlIds: string[]
    if (args.crawlIds === undefined) {
      crawlIds = await ctx.runQuery(internal.alerts.dev.getRecentCrawlIds, {
        limit: args.lastN ?? 1,
      })
    } else {
      crawlIds = Array.isArray(args.crawlIds) ? args.crawlIds : [args.crawlIds]
    }

    if (!crawlIds.length) {
      console.log('[alerts:dev] no crawl_ids to process')
      return
    }

    console.log('[alerts:dev] running dispatcher for crawl_ids', { count: crawlIds.length })

    for (const crawl_id of crawlIds) {
      await ctx.runAction(internal.alerts.dispatcher.run, { crawl_id })
    }
  },
})

export const getRecentCrawlIds = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const docs = await stream(ctx.db, schema)
      .query('or_views_changes')
      .withIndex('by_crawl_id')
      .order('desc')
      .distinct(['crawl_id'])
      .take(args.limit)

    return docs.map((doc) => doc.crawl_id)
  },
})
