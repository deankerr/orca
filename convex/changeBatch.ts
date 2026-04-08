// Change batch — queries all changes for a crawl_id.
//
// Returns a flat list of EntityChange[], one per entity per lifecycle state.
// Consumers handle any nesting or grouping they need for display.

import { query } from './_generated/server'
import { getByCrawlId, getByCrawlIdArgs } from './changes'

export const byCrawlId = query({
  args: getByCrawlIdArgs,
  handler: async (ctx, args) => getByCrawlId(ctx, args),
})
