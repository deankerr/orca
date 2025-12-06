import { nullable } from 'convex-helpers/validators'

import { internalQuery } from './_generated/server'
import { db } from './db'

export const getFirst = internalQuery({
  args: {},
  returns: nullable(db.snapshot.crawl.config.vTable.doc),
  handler: async (ctx) => {
    return await ctx.db.query('snapshot_crawl_config').first()
  },
})
