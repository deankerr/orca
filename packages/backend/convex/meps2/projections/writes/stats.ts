import { v } from 'convex/values'

import { internalMutation } from '../../../_generated/server'
import { statsTable } from '../../tables/stats'
import { appendResult, insertIfAbsent } from './helpers'

/**
 * Insert stats samples. Existing (`endpoint_id`, `scan_at`, `tier`) rows are skipped.
 * Never patched.
 */
export const insert = internalMutation({
  args: { rows: v.array(statsTable.validator) },
  returns: appendResult,
  handler: async (ctx, args) => {
    let inserted = 0

    for (const row of args.rows) {
      const existing = await ctx.db
        .query('meps2_stats')
        .withIndex('by_endpoint_scan_at', (q) =>
          q.eq('endpoint_id', row.endpoint_id).eq('scan_at', row.scan_at).eq('tier', row.tier),
        )
        .unique()

      inserted += await insertIfAbsent(ctx, 'meps2_stats', existing, row)
    }

    return { inserted }
  },
})
