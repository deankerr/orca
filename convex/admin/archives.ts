import { paginationOptsValidator } from 'convex/server'

import { query } from '../_generated/server'

export const feed = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.query('snapshot_crawl_archives').order('desc').paginate(args.paginationOpts)
  },
})
