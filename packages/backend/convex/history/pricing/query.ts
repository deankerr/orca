import { withoutSystemFields } from 'convex-helpers'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from '#generated/server'

import { cappedCutoff, emptyPage, pageArgs, pageResult } from '../pagination'
import { ENDPOINT_PRICES_TABLE, endpointPricesTable } from './table'

/** Live endpoint history, oldest first; page dependencies exclude the moving observation clock. */
export const observe = query({
  args: { endpoint_id: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(endpointPricesTable.validator),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(ENDPOINT_PRICES_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) => q.eq('endpoint_id', args.endpoint_id))
      .order('asc')
      .paginate({
        ...args.paginationOpts,
        // Reactive pages can grow; force splits before array or transaction limits.
        maximumRowsRead: Math.min(args.paginationOpts.maximumRowsRead ?? 2000, 2000),
        maximumBytesRead: Math.min(args.paginationOpts.maximumBytesRead ?? 4_000_000, 4_000_000),
      })
    return { ...result, page: result.page.map(withoutSystemFields) }
  },
})

/** Page committed pricing observations through the accepted observation horizon. */
export const list = query({
  args: { endpoint_id: v.string(), ...pageArgs },
  returns: pageResult(endpointPricesTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    if (cutoff === null) {
      return emptyPage()
    }
    const result = await ctx.db
      .query(ENDPOINT_PRICES_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})
