import { v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import { db } from '../../db'

export const insert = internalMutation({
  args: {
    crawl_id: v.string(),
    storage_id: v.id('_storage'),
    data: v.record(v.string(), v.any()),
  },
  returns: db.snapshot.crawl.archives.vTable._id,
  handler: async (ctx, args) => {
    return await ctx.db.insert('snapshot_crawl_archives', args)
  },
})
