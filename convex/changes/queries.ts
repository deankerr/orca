import { v } from 'convex/values'

import { defineQuerySpec } from '../lib/functionSpec'
import { createEntityChanges, filterChangeDocs } from './projection'

const TABLE_NAME = 'or_views_changes'

export const get = defineQuerySpec({
  args: v.object({
    crawl_id: v.string(),
  }),
  async handler(ctx, args) {
    const docs = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
      .collect()

    return createEntityChanges(ctx, filterChangeDocs(docs))
  },
})
