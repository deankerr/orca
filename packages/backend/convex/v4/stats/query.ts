import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { query } from '../../_generated/server'
import type { QueryCtx } from '../../_generated/server'
import { publicationScanAt } from '../ingestion/publication'
import { V4_CURRENT_STATS_TABLE, currentStatsTable } from './table'

/** Every reading comes from the cursor's scan; the grid always needs all of them. */
export const grid = query({
  args: {},
  returns: v.object({
    as_of: v.union(v.null(), v.string()),
    rows: v.array(currentStatsTable.validator),
  }),
  handler: async (ctx) => {
    const scanAt = await publishedScanAt(ctx)
    const rows = await ctx.db.query(V4_CURRENT_STATS_TABLE).collect()
    return { as_of: scanAt, rows: rows.map(withoutSystemFields) }
  },
})

export async function publishedScanAt(ctx: QueryCtx) {
  return await publicationScanAt(ctx, 'current_stats')
}
