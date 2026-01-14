import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'

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
    if (args.crawlIds) {
      crawlIds = Array.isArray(args.crawlIds) ? args.crawlIds : [args.crawlIds]
    } else if (args.lastN) {
      crawlIds = await ctx.runQuery(internal.alerts.inputs.getRecentCrawlIds, {
        limit: args.lastN,
      })
    } else {
      throw new Error('Must provide crawlIds or lastN')
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
