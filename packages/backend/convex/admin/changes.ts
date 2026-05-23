import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalMutation } from '../_generated/server'

const DELETE_BATCH_SIZE = 2000

// deletes one batch of changes for a crawl_id pair, returns the number deleted
export const _deletePairBatch = internalMutation({
  args: { previous_crawl_id: v.string(), crawl_id: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query('or_views_changes')
      .withIndex('by_previous_crawl_id__crawl_id', (q) =>
        q.eq('previous_crawl_id', args.previous_crawl_id).eq('crawl_id', args.crawl_id),
      )
      .take(DELETE_BATCH_SIZE)

    for (const doc of batch) {
      await ctx.db.delete(doc._id)
    }

    return batch.length
  },
})

export const deletePair = internalAction({
  args: { previous_crawl_id: v.string(), crawl_id: v.string() },
  handler: async (ctx, args): Promise<void> => {
    let total = 0

    while (true) {
      const deleted = await ctx.runMutation(internal.admin.changes._deletePairBatch, args)
      total += deleted
      if (deleted < DELETE_BATCH_SIZE) {
        break
      }
    }

    console.log('[admin/changes] deletePair complete', { ...args, total })
  },
})
