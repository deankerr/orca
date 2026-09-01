import { v } from 'convex/values'

import { internalMutation } from '../../../_generated/server'
import { pricingTable } from '../../tables/pricing'
import { appendResult, insertIfAbsent } from './helpers'

/**
 * Insert pricing samples. Existing (`endpoint_id`, `scan_at`) rows are skipped.
 */
export const insert = internalMutation({
  args: { rows: v.array(pricingTable.validator) },
  returns: appendResult,
  handler: async (ctx, args) => {
    let inserted = 0

    for (const row of args.rows) {
      const existing = await ctx.db
        .query('meps2_pricing')
        .withIndex('by_endpoint_scan_at', (q) =>
          q.eq('endpoint_id', row.endpoint_id).eq('scan_at', row.scan_at),
        )
        .unique()

      inserted += await insertIfAbsent(ctx, 'meps2_pricing', existing, row)
    }

    return { inserted }
  },
})
