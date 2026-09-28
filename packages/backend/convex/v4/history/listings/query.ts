import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'

import { query } from '../../../_generated/server'
import { cappedCutoff, emptyPage, pageArgs, pageResult } from '../pagination'
import { V4_ENDPOINT_LISTINGS_TABLE, endpointListingsTable } from './table'

/** Complete context lens; the cutoff bounds observations, not processor completeness. */
export const lens = query({
  args: {},
  returns: v.object({
    as_of: v.union(v.null(), v.string()),
    rows: v.array(endpointListingsTable.validator),
  }),
  handler: async (ctx) => {
    const as_of = await cappedCutoff(ctx)
    if (as_of === null) {
      return { as_of, rows: [] }
    }
    // ponytail: ~6K context rows fit one read; paginate if listings approach transaction limits.
    const rows = await ctx.db.query(V4_ENDPOINT_LISTINGS_TABLE).collect()
    return {
      as_of,
      rows: rows.filter((row) => row.scan_at <= as_of).map(withoutSystemFields),
    }
  },
})

/** Page an endpoint's full context, including moves between models and provider tags. */
export const list = query({
  args: { endpoint_id: v.string(), ...pageArgs },
  returns: pageResult(endpointListingsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    if (cutoff === null) {
      return emptyPage()
    }
    const result = await ctx.db
      .query(V4_ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_endpoint_id_and_scan_at', (q) =>
        q.eq('endpoint_id', args.endpoint_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})

/** Page a model's context rows for historical endpoint discovery; deduplicate UUIDs across pages. */
export const byModel = query({
  args: { model_id: v.string(), ...pageArgs },
  returns: pageResult(endpointListingsTable.validator),
  handler: async (ctx, args) => {
    const cutoff = await cappedCutoff(ctx, args.cutoff)
    if (cutoff === null) {
      return emptyPage()
    }
    const result = await ctx.db
      .query(V4_ENDPOINT_LISTINGS_TABLE)
      .withIndex('by_model_id_and_scan_at', (q) =>
        q.eq('model_id', args.model_id).lte('scan_at', cutoff),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutSystemFields), as_of: cutoff }
  },
})
