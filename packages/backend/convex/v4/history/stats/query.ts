import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { query } from '../../../_generated/server'
import { cappedCutoff, emptyPage, pageArgs, pageResult } from '../pagination'
import { V4_ENDPOINT_STATS_TABLE, endpointStatsTable } from './table'

/** Page committed samples across tiers; routine ingestion does not schedule Stats history. */
export const list = query({
  args: { endpoint_id: v.string(), ...pageArgs },
  returns: pageResult(endpointStatsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    if (cutoff === null) {
      return emptyPage()
    }
    const result = await ctx.db
      .query(V4_ENDPOINT_STATS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})
