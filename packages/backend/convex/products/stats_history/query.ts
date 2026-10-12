import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { query } from '#generated/server'

import { ENDPOINT_STATS_TABLE, endpointStatsTable } from '../../catalogNew/tables/stats'
import { cappedCutoff, emptyPage, pageArgs, pageResult } from '../shared/pagination'

/** Page retained samples across tiers through the completed observation horizon. */
export const list = query({
  args: { endpoint_id: v.string(), ...pageArgs },
  returns: pageResult(endpointStatsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    if (cutoff === null) {
      return emptyPage()
    }
    const result = await ctx.db
      .query(ENDPOINT_STATS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at_and_tier', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})
