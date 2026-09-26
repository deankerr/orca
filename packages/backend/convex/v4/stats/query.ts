import { v } from 'convex/values'

import { query } from '../../_generated/server'
import type { QueryCtx } from '../../_generated/server'
import { V4_CURRENT_STATS_TABLE, currentStatsTable } from './table'

/** The grid consumes the complete published snapshot. */
export const grid = query({
  args: {},
  returns: v.object({
    as_of: v.union(v.null(), v.string()),
    rows: currentStatsTable.validator.fields.rows,
  }),
  handler: async (ctx) => {
    const snapshot = await ctx.db.query(V4_CURRENT_STATS_TABLE).unique()
    return { as_of: snapshot?.scan_at ?? null, rows: snapshot?.rows ?? [] }
  },
})

export async function publishedScanAt(ctx: QueryCtx) {
  const snapshot = await ctx.db.query(V4_CURRENT_STATS_TABLE).unique()
  return snapshot?.scan_at ?? null
}
