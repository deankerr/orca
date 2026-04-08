import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import type { QueryCtx } from '../_generated/server'
import { createEntityChanges, filterChangeDocs } from './projection'

const TABLE_NAME = 'or_views_changes'

export const getByCrawlIdArgs = v.object({
  crawl_id: v.string(),
})

export async function getByCrawlId(ctx: QueryCtx, args: Infer<typeof getByCrawlIdArgs>) {
  const docs = await ctx.db
    .query(TABLE_NAME)
    .withIndex('by_crawl_id', (q) => q.eq('crawl_id', args.crawl_id))
    .collect()

  return createEntityChanges(ctx, filterChangeDocs(docs))
}
