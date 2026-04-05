// Change batch — queries all changes for a crawl_id.
//
// Returns a flat list of EntityChange[], one per entity per lifecycle state.
// Consumers handle any nesting or grouping they need for display.

import { v } from 'convex/values'

import { query } from './_generated/server'
import { getByCrawlId } from './db/or/views/changes'

export const byCrawlId = query({
  args: { crawl_id: v.string() },
  handler: async (ctx, { crawl_id }) => getByCrawlId(ctx, crawl_id),
})
