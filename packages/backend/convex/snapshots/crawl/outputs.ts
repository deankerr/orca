import { v } from 'convex/values'

import { internalMutation } from '../../_generated/server'

export const insert = internalMutation({
  args: {
    crawl_id: v.string(),
    storage_id: v.id('_storage'),
    data: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => await ctx.db.insert('snapshot_crawl_archives', args),
})
